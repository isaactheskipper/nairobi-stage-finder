import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Compass,
  ExternalLink,
  Footprints,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  buildGoogleMapsWalkingUrl,
  formatSpokenWalkingScript,
  SearchMatchResult,
  WalkingStep,
} from '@stage/shared';

interface WalkingNavigationViewProps {
  selectedMatch: SearchMatchResult;
}

export const WalkingNavigationView: React.FC<WalkingNavigationViewProps> = ({
  selectedMatch,
}) => {
  const { origin, stage, route, walking } = selectedMatch;
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [speechStatusText, setSpeechStatusText] = useState<string>(
    'Voice guidance ready (optional)'
  );

  // Reset active step and stop ongoing speech when selected stage changes
  useEffect(() => {
    setActiveStepIndex(0);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setSpeechStatusText('Voice guidance ready (optional)');
    }
  }, [stage.id, origin.id, route.id]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const speakText = (textToSpeak: string, label: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setSpeechStatusText(
        'Browser speech synthesis unavailable on this device.'
      );
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.rate = 0.98;
    utterance.pitch = 1.0;
    utterance.onstart = () => {
      setIsSpeaking(true);
      setSpeechStatusText(`Speaking: ${label}`);
    };
    utterance.onend = () => {
      setIsSpeaking(false);
      setSpeechStatusText('Spoken briefing complete');
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setSpeechStatusText('Voice readout stopped');
    };

    window.speechSynthesis.speak(utterance);
  };

  const handleToggleFullVoiceBriefing = () => {
    if (isSpeaking) {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsSpeaking(false);
      setSpeechStatusText('Voice guidance paused');
      return;
    }

    const fullScript = formatSpokenWalkingScript(stage, route, walking);
    speakText(fullScript, `Full walk to ${stage.name}`);
  };

  const handleStepSelect = (step: WalkingStep, index: number) => {
    setActiveStepIndex(index);
    if (isSpeaking) {
      speakText(
        `Step ${step.stepNumber}. ${step.instruction}. ${step.landmarkCue}.`,
        `Step ${step.stepNumber}`
      );
    }
  };

  const googleMapsUrl = buildGoogleMapsWalkingUrl(
    origin.coordinates,
    stage.coordinates,
    stage.name
  );

  return (
    <section
      className="detail-sheet walking-nav"
      aria-label={`Walking Navigation from ${origin.shortName} to ${stage.name}`}
    >
      <div className="detail-sheet__header">
        <div>
          <span className="detail-sheet__code">
            WALKING NAVIGATION · {walking.compassBearing} ({walking.compassDegrees}°)
          </span>
          <h2 className="detail-sheet__title">
            {origin.shortName} → {stage.name}
          </h2>
          <p className="detail-sheet__subtitle">{walking.summary}</p>
        </div>

        <span className="route-card__walk-pill">
          <Footprints size={14} />
          {walking.estimatedMinutes} min · {walking.totalDistanceMeters}m
        </span>
      </div>

      {/* Spoken Instructions & Google Maps Action Bar */}
      <div className="walking-nav__controls">
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            Hands-Free Street Audio Guide
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: 'var(--stage-ink-muted-on-dark)',
              marginTop: 2,
            }}
          >
            {speechStatusText}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn-voice ${isSpeaking ? 'btn-voice--speaking' : ''}`}
            onClick={handleToggleFullVoiceBriefing}
          >
            {isSpeaking ? <VolumeX size={16} /> : <Volume2 size={16} />}
            {isSpeaking ? 'Stop Spoken Guide' : 'Speak Walking Directions'}
          </button>

          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-gmaps"
          >
            <Compass size={15} color="#00B84C" />
            Open in Google Maps
            <ExternalLink size={13} />
          </a>
        </div>
      </div>

      {/* Turn-by-Turn Steps */}
      <ol className="walking-steps">
        {walking.steps.map((step, index) => {
          const isCurrent = index === activeStepIndex;
          return (
            <li
              key={step.stepNumber}
              className={`walking-step ${
                isCurrent ? 'walking-step--active' : ''
              }`}
              onClick={() => handleStepSelect(step, index)}
            >
              <span className="walking-step__index">{step.stepNumber}</span>
              <div className="walking-step__body">
                <div className="walking-step__instruction">
                  {step.instruction}
                </div>
                <div className="walking-step__cue">
                  <strong>Street:</strong> {step.streetName} ·{' '}
                  <strong>Cue:</strong> {step.landmarkCue}
                </div>
              </div>
              <div className="walking-step__telemetry">
                <div>{step.distanceMeters}m</div>
                <div style={{ fontSize: 10.5, opacity: 0.8 }}>
                  {step.compassBearing}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--stage-ink-secondary)' }}>
          <CheckCircle2
            size={14}
            color="#00B84C"
            style={{ verticalAlign: 'text-bottom', marginRight: 5 }}
          />
          Click any step above to highlight it or advance along the street corridor.
        </span>

        {activeStepIndex < walking.steps.length - 1 ? (
          <button
            type="button"
            className="btn-stage-secondary"
            onClick={() =>
              handleStepSelect(
                walking.steps[activeStepIndex + 1],
                activeStepIndex + 1
              )
            }
          >
            Next Walking Step →
          </button>
        ) : (
          <button
            type="button"
            className="btn-stage-secondary"
            onClick={() => handleStepSelect(walking.steps[0], 0)}
          >
            Restart Steps
          </button>
        )}
      </div>
    </section>
  );
};

