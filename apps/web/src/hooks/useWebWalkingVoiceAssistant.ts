import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BoardingStage,
  calculateDistanceMeters,
  Coordinates,
  NAIROBI_CBD_ORIGINS,
  NAIROBI_DEMO_STAGES,
  OriginLandmark,
  OsrmResolvedWalkRoute,
  WalkingStep,
} from '@stage/shared';

export interface WebVoiceAssistantProps {
  enabled: boolean;
  userCoords: Coordinates | null;
  stage: BoardingStage;
  origin: OriginLandmark;
  routeNumber: string;
  destinationName: string;
  osrm: OsrmResolvedWalkRoute | null;
  routing: boolean;
}

export interface WebVoiceAssistantState {
  speechSupported: boolean;
  isSpeaking: boolean;
  latestInstruction: string | null;
  activeStepNumber: number | null;
  lastAnnouncementType:
    | 'initial'
    | 'turn'
    | 'landmark'
    | 'progress'
    | 'arrival'
    | null;
  stopSpeech: () => void;
  replayLastInstruction: () => void;
  speakStepInstruction: (step: WalkingStep) => void;
}

// Identical thresholds to apps/mobile/src/hooks/useWalkingVoiceAssistant.ts
const MIN_ROUTINE_INTERVAL_MS = 35000; // 35 seconds between routine progress updates
const MIN_LANDMARK_INTERVAL_MS = 16000; // 16 seconds between landmark calls
const LANDMARK_PROXIMITY_METERS = 35; // Trigger when within 35 meters
const ARRIVAL_PROXIMITY_METERS = 25; // Trigger arrival when within 25 meters
const TURN_PROXIMITY_METERS = 45; // Trigger turn preview when within 45 meters

/**
 * Sanitizes raw navigation or step text into a concise, human-readable spoken
 * instruction. Strips raw coordinates, OSRM maneuver metadata, compass degree
 * strings, and demo tags before speech synthesis or UI display.
 */
export function cleanSpokenInstruction(
  raw: string | null | undefined,
  fallback = 'Continue along the walking route.'
): string {
  if (!raw || typeof raw !== 'string') {
    return fallback;
  }

  let cleaned = raw
    // Strip internal maneuver metadata and stage marker debug notes
    .replace(/\b(?:road\s+)?maneuver\b[^.]*\.?/gi, '')
    .replace(/\bstage\s+marker\s+at\b[^.]*\.?/gi, '')
    // Strip technical compass degree bearings e.g. "Bearing 180° (S)"
    .replace(/\bbearing\s+\d+\s*°?\s*(?:\([nesw]{1,3}\))?\.?/gi, '')
    // Strip parenthesized or bare lat/lng coordinate pairs
    .replace(/\(\s*-?\d+\.\d+\s*,\s*-?\d+\.\d+\s*\)/g, '')
    .replace(/\b(?:gps\s*)?\(\s*-?\d+\.\d+[^)]*\)/gi, '')
    .replace(/-?\d+\.\d{2,}\s*,\s*-?\d+\.\d{2,}/g, '')
    // Strip demo / verification annotations
    .replace(
      /\(\s*(?:unverified\s+)?demo(?:\s+coordinates|\s+data)?\s*\)/gi,
      ''
    )
    // Replace internal placeholder street names with natural phrasing
    .replace(/\b(?:onto|along|on)\s+unnamed\s+road\b/gi, 'ahead')
    .replace(/\bunnamed\s+road\b/gi, 'the walkway')
    .replace(/\bnairobi\s+road\s+segment\b/gi, 'the street')
    .replace(/\borigin\s+road\b/gi, 'the street')
    // Remove empty parentheses and collapse repeated punctuation/whitespace
    .replace(/\(\s*\)/g, '')
    .replace(/\s+([.,;!?])/g, '$1')
    .replace(/\.{2,}/g, '.')
    .replace(/(?:\.\s*)+/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Trim stray leading/trailing punctuation
  cleaned = cleaned
    .replace(/^[.,;:\-\s]+/, '')
    .replace(/[,;:\-\s]+$/, '')
    .trim();

  // Verify the cleaned string has meaningful readable words and no leftover coordinate artifacts
  const alphaCount = (cleaned.match(/[a-zA-Z]/g) || []).length;
  if (alphaCount < 4 || /-?\d+\.\d{3,}/.test(cleaned)) {
    return fallback;
  }

  // Capitalize first letter and ensure trailing period
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  if (!/[.!?]$/.test(cleaned)) {
    cleaned += '.';
  }

  return cleaned;
}

export function useWebWalkingVoiceAssistant({
  enabled,
  userCoords,
  stage,
  origin,
  routeNumber,
  destinationName,
  osrm,
  routing,
}: WebVoiceAssistantProps): WebVoiceAssistantState {
  const speechSupported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance !== 'undefined';

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [latestInstruction, setLatestInstruction] = useState<string | null>(
    null
  );
  const [activeStepNumber, setActiveStepNumber] = useState<number | null>(null);
  const [lastAnnouncementType, setLastAnnouncementType] = useState<
    WebVoiceAssistantState['lastAnnouncementType']
  >(null);

  // Session deduplication tracking
  const sessionKeyRef = useRef<string>('');
  const initialAnnouncedRef = useRef(false);
  const arrivalAnnouncedRef = useRef(false);
  const announcedLandmarksRef = useRef<Set<string>>(new Set());
  const announcedStepsRef = useRef<Set<number>>(new Set());

  // Timing and motion tracking
  const lastSpokenTimeRef = useRef(0);
  const lastSpokenCoordsRef = useRef<Coordinates | null>(null);
  const lastSpokenTextRef = useRef<string | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Reset tracking when the stage or route changes
  const currentKey = `${stage.id}-${routeNumber}-${origin.id}`;
  if (sessionKeyRef.current !== currentKey) {
    sessionKeyRef.current = currentKey;
    initialAnnouncedRef.current = false;
    arrivalAnnouncedRef.current = false;
    announcedLandmarksRef.current.clear();
    announcedStepsRef.current.clear();
    lastSpokenTimeRef.current = 0;
    lastSpokenCoordsRef.current = null;
    lastSpokenTextRef.current = null;
  }

  const stopSpeech = useCallback(() => {
    try {
      if (speechSupported) {
        window.speechSynthesis.cancel();
      }
    } catch {
      // Ignore browser speech stop errors
    }
    setIsSpeaking(false);
  }, [speechSupported]);

  const synthSpeak = useCallback(
    (cleanText: string, interrupt = true) => {
      if (!speechSupported || !enabledRef.current) return;
      try {
        if (interrupt) {
          window.speechSynthesis.cancel();
        }
        const utterance = new window.SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'en-US';
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        setIsSpeaking(true);
        window.speechSynthesis.speak(utterance);
      } catch {
        setIsSpeaking(false);
      }
    },
    [speechSupported]
  );

  const speak = useCallback(
    (
      rawText: string,
      type: 'initial' | 'turn' | 'landmark' | 'progress' | 'arrival',
      priority: 'high' | 'normal' | 'low' = 'normal',
      stepNum: number | null = null,
      fallbackText?: string
    ) => {
      const now = Date.now();
      const elapsed = now - lastSpokenTimeRef.current;

      // Rate limit lower priority updates
      if (priority === 'low' && elapsed < MIN_ROUTINE_INTERVAL_MS) {
        return;
      }
      if (type === 'landmark' && elapsed < MIN_LANDMARK_INTERVAL_MS) {
        return;
      }

      const stageClean = stage.name
        .replace(/\s*\((?:Unverified\s+)?Demo\)/gi, '')
        .trim();
      const cleanedText = cleanSpokenInstruction(
        rawText,
        fallbackText ?? `Walk toward ${stageClean}.`
      );

      // Avoid repeating the exact same instruction back-to-back
      if (lastSpokenTextRef.current === cleanedText && type !== 'arrival') {
        return;
      }

      setLatestInstruction(cleanedText);
      setActiveStepNumber(stepNum);
      setLastAnnouncementType(type);
      lastSpokenTextRef.current = cleanedText;
      lastSpokenTimeRef.current = now;
      if (userCoords) {
        lastSpokenCoordsRef.current = userCoords;
      }

      if (!enabledRef.current) {
        return;
      }

      synthSpeak(cleanedText, priority === 'high' || true);
    },
    [stage.name, userCoords, synthSpeak]
  );

  const replayLastInstruction = useCallback(() => {
    if (!enabledRef.current || !lastSpokenTextRef.current) {
      return;
    }
    const cleanText = cleanSpokenInstruction(lastSpokenTextRef.current);
    synthSpeak(cleanText, true);
  }, [synthSpeak]);

  const speakStepInstruction = useCallback(
    (step: WalkingStep) => {
      const cleanText = cleanSpokenInstruction(step.instruction);
      setLatestInstruction(cleanText);
      setActiveStepNumber(step.stepNumber);
      setLastAnnouncementType('turn');
      lastSpokenTextRef.current = cleanText;
      lastSpokenTimeRef.current = Date.now();
      if (enabledRef.current) {
        synthSpeak(cleanText, true);
      }
    },
    [synthSpeak]
  );

  // Stop speech immediately when user disables voice assistance
  useEffect(() => {
    if (!enabled) {
      stopSpeech();
    }
  }, [enabled, stopSpeech]);

  // Clean up audio when unmounting
  useEffect(() => {
    return () => {
      stopSpeech();
    };
  }, [stopSpeech]);

  // 1. Initial departure instruction
  useEffect(() => {
    if (routing || initialAnnouncedRef.current) return;

    const stageShort = stage.name
      .replace(/\s*\((?:Unverified\s+)?Demo\)/gi, '')
      .trim();
    let initialText = `Walk toward ${stageShort} on ${stage.streetAddress}.`;
    let firstStepNum: number | null = null;

    if (osrm && osrm.steps.length > 0) {
      const firstStep = osrm.steps[0];
      firstStepNum = firstStep.stepNumber;
      announcedStepsRef.current.add(firstStep.stepNumber);
      initialText = cleanSpokenInstruction(
        firstStep.instruction,
        `Walk toward ${stageShort} on ${stage.streetAddress}.`
      );
    }

    initialAnnouncedRef.current = true;
    speak(
      initialText,
      'initial',
      'normal',
      firstStepNum,
      `Walk toward ${stageShort}.`
    );
  }, [routing, osrm, stage.name, stage.streetAddress, speak]);

  // 2. Continuous location-driven navigation (Turns, Landmarks, Arrival, Progress)
  useEffect(() => {
    if (!userCoords || routing) return;

    const stageShort = stage.name
      .replace(/\s*\((?:Unverified\s+)?Demo\)/gi, '')
      .trim();

    // A. Arrival Check
    const distToStage = calculateDistanceMeters(userCoords, stage.coordinates);
    if (distToStage <= ARRIVAL_PROXIMITY_METERS && !arrivalAnnouncedRef.current) {
      arrivalAnnouncedRef.current = true;
      speak(
        `You have arrived at ${stageShort}. Board route ${routeNumber} to ${destinationName}.`,
        'arrival',
        'high',
        null,
        `You have arrived at ${stageShort}.`
      );
      return;
    }

    // B. Upcoming Turn Detection (when approaching maneuver coordinates)
    if (osrm && osrm.steps.length > 1) {
      for (const step of osrm.steps) {
        if (announcedStepsRef.current.has(step.stepNumber)) continue;
        if (
          step.turnDirection === 'left' ||
          step.turnDirection === 'right' ||
          step.turnDirection === 'cross'
        ) {
          if (step.coordinates) {
            const distToTurn = calculateDistanceMeters(
              userCoords,
              step.coordinates
            );
            if (distToTurn <= TURN_PROXIMITY_METERS) {
              announcedStepsRef.current.add(step.stepNumber);
              speak(
                step.instruction,
                'turn',
                'high',
                step.stepNumber,
                `Turn ${step.turnDirection} ahead.`
              );
              return;
            }
          }
        }
      }
    }

    // C. Landmark Proximity Detection (Nairobi CBD Landmarks)
    const allLandmarks: Array<{
      id: string;
      name: string;
      coordinates: Coordinates;
    }> = [
      ...NAIROBI_CBD_ORIGINS.map((o) => ({
        id: o.id,
        name: o.name.split('(')[0].trim(),
        coordinates: o.coordinates,
      })),
      ...NAIROBI_DEMO_STAGES.filter((s) => s.id !== stage.id).map((s) => ({
        id: s.id,
        name: s.name
          .replace(/\s*\((?:Unverified\s+)?Demo\)/gi, '')
          .split('/')[0]
          .trim(),
        coordinates: s.coordinates,
      })),
    ];

    for (const lm of allLandmarks) {
      if (announcedLandmarksRef.current.has(lm.id)) continue;
      const d = calculateDistanceMeters(userCoords, lm.coordinates);
      if (d <= LANDMARK_PROXIMITY_METERS) {
        announcedLandmarksRef.current.add(lm.id);
        speak(
          `Passing near ${lm.name}.`,
          'landmark',
          'normal',
          null,
          `Continue toward ${stageShort}.`
        );
        return;
      }
    }

    // D. Periodic Walking Progress (Quiet & Non-annoying)
    const now = Date.now();
    const elapsed = now - lastSpokenTimeRef.current;
    if (elapsed >= MIN_ROUTINE_INTERVAL_MS && lastSpokenCoordsRef.current) {
      const movedSinceLastSpeak = calculateDistanceMeters(
        userCoords,
        lastSpokenCoordsRef.current
      );

      if (movedSinceLastSpeak >= 25 && distToStage > 50) {
        const roundedDist = Math.round(distToStage / 10) * 10;
        speak(
          `Continue toward ${stageShort}, about ${roundedDist} meters remaining.`,
          'progress',
          'low',
          null,
          `Continue toward ${stageShort}.`
        );
      }
    }
  }, [userCoords, routing, stage, routeNumber, destinationName, osrm, speak]);

  return {
    speechSupported,
    isSpeaking,
    latestInstruction,
    activeStepNumber,
    lastAnnouncementType,
    stopSpeech,
    replayLastInstruction,
    speakStepInstruction,
  };
}

