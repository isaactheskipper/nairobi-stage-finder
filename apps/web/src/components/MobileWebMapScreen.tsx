import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Compass,
  CornerUpLeft,
  CornerUpRight,
  Crosshair,
  ExternalLink,
  Flag,
  Info,
  Loader2,
  MapPin,
  Maximize2,
  Navigation,
  RefreshCw,
  RotateCcw,
  Volume1,
  Volume2,
  VolumeX,
  WifiOff,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  buildExternalMapsDirectionsUrl,
  calculateDistanceMeters,
  Coordinates,
  fetchMultiModeRoute,
  getOpenFreeMapStyleUrl,
  getTransportModeMeta,
  isValidCoordinates,
  MultiModeRouteResult,
  NAIROBI_DEMO_STAGES,
  ResolvedRouteOption,
  SearchMatchResult,
  STAGE_MAP_CONFIG,
  TRANSPORT_MODE_OPTIONS,
  TransportMode,
  TurnDirection,
} from '@stage/shared';
import {
  cleanSpokenInstruction,
  useWebWalkingVoiceAssistant,
} from '../hooks/useWebWalkingVoiceAssistant';
import { WebLocationPermissionState } from '../hooks/useWebUserLocation';
import {
  mountStageMapLibre,
  StageMapApplyMessage,
  StageMapController,
} from '../utils/webMapLibre';

interface MobileWebMapScreenProps {
  selectedMatch: SearchMatchResult;
  userCoords: Coordinates | null;
  isDarkTheme: boolean;
  onBack: () => void;
  onRequestLocation: () => void;
  onChangeOrigin: () => void;
  onSelectStageById?: (stageId: string) => void;
  onOpenSettings?: () => void;
  permissionBlocked?: boolean;
  locationStatus?: WebLocationPermissionState;
  locationMessage?: string;
}

export type WebSheetSnapState = 'collapsed' | 'intermediate' | 'expanded';

/** Re-route only after the user has moved this far from the last routed origin (matches Android). */
const REROUTE_METERS = 40;

/** Compact collapsed card height showing essential summary, icon-only modes, and Start/End CTA. */
const COLLAPSED_HEIGHT = 202;

function formatWalkDistance(meters: number): string {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)} km`
    : `${Math.round(meters)} m`;
}

function formatArrivalClockTime(durationSeconds: number): string {
  const arrival = new Date(Date.now() + durationSeconds * 1000);
  const hours = arrival.getHours();
  const mins = arrival.getMinutes();
  const period = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  const mPadded = mins < 10 ? `0${mins}` : String(mins);
  return `${h12}:${mPadded} ${period}`;
}

/** Crisp vector transport mode icons matching Android MobileMapScreen.tsx */
export const WebTransportModeIcon: React.FC<{
  mode: TransportMode;
  size?: number;
}> = React.memo(({ mode, size = 19 }) => {
  if (mode === 'walking') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="13" cy="4.5" r="2" stroke="currentColor" strokeWidth="2.1" />
        <path
          d="M10 9.5L13 8.5L15.5 11.5L18 13M11.5 9L9.5 15L7 20.5M12.5 14L15.5 17L16.5 21"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (mode === 'car') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M5 11L7 6.5C7.3 5.8 8 5.5 8.8 5.5H15.2C16 5.5 16.7 5.8 17 6.5L19 11M3.5 11H20.5V17.5C20.5 18.1 20.1 18.5 19.5 18.5H18.5C17.9 18.5 17.5 18.1 17.5 17.5V16.5H6.5V17.5C6.5 18.1 6.1 18.5 5.5 18.5H4.5C3.9 18.5 3.5 18.1 3.5 17.5V11Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="7.5" cy="14" r="1.25" fill="currentColor" />
        <circle cx="16.5" cy="14" r="1.25" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="5.5" cy="16.5" r="3" stroke="currentColor" strokeWidth="2" />
      <circle cx="18.5" cy="16.5" r="3" stroke="currentColor" strokeWidth="2" />
      <path
        d="M8.5 16.5H13L15.5 10.5H12.5L10.5 13H7.5L5.5 16.5M14 7.5H16.5L18.5 16.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
});

function StepTurnIcon({
  dir,
  size = 16,
}: {
  dir: TurnDirection;
  size?: number;
}) {
  switch (dir) {
    case 'left':
      return <CornerUpLeft size={size} />;
    case 'right':
      return <CornerUpRight size={size} />;
    case 'arrive':
      return <Flag size={size} />;
    case 'start':
      return <Navigation size={size} />;
    default:
      return <ArrowUp size={size} />;
  }
}

export const MobileWebMapScreen: React.FC<MobileWebMapScreenProps> = ({
  selectedMatch,
  userCoords,
  isDarkTheme,
  onBack,
  onRequestLocation,
  onChangeOrigin,
  onSelectStageById,
  onOpenSettings,
  permissionBlocked,
  locationStatus,
  locationMessage,
}) => {
  const { route, stage, origin } = selectedMatch;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapCtrlRef = useRef<StageMapController | null>(null);

  // Measure actual container height for 3-state full-screen bottom sheet
  const [containerHeight, setContainerHeight] = useState<number>(() =>
    typeof window !== 'undefined' ? Math.max(480, window.innerHeight) : 720
  );

  useEffect(() => {
    const updateHeight = () => {
      const h =
        containerRef.current?.clientHeight ||
        (typeof window !== 'undefined' ? window.innerHeight : 720);
      if (h > 240) {
        setContainerHeight(h);
      }
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  const sheetFullHeight = useMemo(
    () => Math.max(360, containerHeight - 10),
    [containerHeight]
  );

  const intermediateHeight = useMemo(
    () =>
      Math.round(
        Math.min(
          Math.max(COLLAPSED_HEIGHT + 150, sheetFullHeight * 0.56),
          sheetFullHeight - 88
        )
      ),
    [sheetFullHeight]
  );

  const snapOffsets = useMemo(() => {
    const collapsedOffset = Math.max(0, sheetFullHeight - COLLAPSED_HEIGHT);
    const intermediateOffset = Math.max(
      0,
      Math.min(collapsedOffset, sheetFullHeight - intermediateHeight)
    );
    return {
      expanded: 0,
      intermediate: intermediateOffset,
      collapsed: collapsedOffset,
    };
  }, [sheetFullHeight, intermediateHeight]);

  const snapOffsetsRef = useRef(snapOffsets);
  snapOffsetsRef.current = snapOffsets;

  // Start in clean, minimal collapsed state so map and route are clearly visible
  const [sheetState, setSheetState] = useState<WebSheetSnapState>('collapsed');
  const sheetStateRef = useRef<WebSheetSnapState>(sheetState);
  sheetStateRef.current = sheetState;

  const [dragTranslateY, setDragTranslateY] = useState<number | null>(null);
  const dragRef = useRef<{
    active: boolean;
    startY: number;
    startX: number;
    startOffset: number;
    startTime: number;
    moved: boolean;
  }>({
    active: false,
    startY: 0,
    startX: 0,
    startOffset: 0,
    startTime: 0,
    moved: false,
  });

  const snapToState = useCallback((next: WebSheetSnapState) => {
    sheetStateRef.current = next;
    setSheetState(next);
    setDragTranslateY(null);
  }, []);

  const handleToggleSheet = useCallback(() => {
    if (sheetStateRef.current === 'collapsed') {
      snapToState('expanded');
    } else {
      snapToState('collapsed');
    }
  }, [snapToState]);

  // ---- Transport Mode & Multi-Route State --------------------------------
  const [transportMode, setTransportMode] = useState<TransportMode>('walking');
  const [routeResult, setRouteResult] = useState<MultiModeRouteResult | null>(
    null
  );
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);
  const [routing, setRouting] = useState(true);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [useDark, setUseDark] = useState(isDarkTheme);
  const [isNavigating, setIsNavigating] = useState(false);
  const [manualStepIndex, setManualStepIndex] = useState<number>(0);
  const [mapFailed, setMapFailed] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapKey, setMapKey] = useState(0);

  const [voiceEnabled, setVoiceEnabled] = useState(true);

  const modeMeta = useMemo(
    () => getTransportModeMeta(transportMode),
    [transportMode]
  );

  const activeRouteOption: ResolvedRouteOption | null = useMemo(() => {
    if (!routeResult || routeResult.routes.length === 0) return null;
    return (
      routeResult.routes[selectedOptionIndex] ?? routeResult.quickestRoute
    );
  }, [routeResult, selectedOptionIndex]);

  useEffect(() => {
    setUseDark(isDarkTheme);
  }, [isDarkTheme]);

  useEffect(() => {
    setMapReady(false);
    setMapFailed(false);
  }, [useDark, stage.id, mapKey]);

  const {
    speechSupported,
    isSpeaking,
    latestInstruction,
    activeStepNumber,
    stopSpeech,
    replayLastInstruction,
    speakStepInstruction,
  } = useWebWalkingVoiceAssistant({
    enabled: voiceEnabled,
    userCoords,
    stage,
    origin,
    routeNumber: route.routeNumber,
    destinationName: route.destinationName,
    osrm: activeRouteOption,
    routing,
  });

  const handleToggleVoice = useCallback(() => {
    setVoiceEnabled((prev) => {
      const next = !prev;
      if (!next) {
        stopSpeech();
      }
      return next;
    });
  }, [stopSpeech]);

  const stageShort = useMemo(
    () => stage.name.replace(/\s*\((?:Unverified\s+)?Demo\)/gi, '').trim(),
    [stage.name]
  );

  // Start point is either the live GPS fix or the chosen CBD landmark
  const startCoords: Coordinates | null = useMemo(() => {
    if (userCoords && isValidCoordinates(userCoords)) return userCoords;
    if (isValidCoordinates(origin.coordinates)) return origin.coordinates;
    return null;
  }, [userCoords, origin.coordinates]);

  const usingGps = Boolean(userCoords && isValidCoordinates(userCoords));
  const startLabel = usingGps ? 'Your location' : origin.shortName;

  // ---- Multi-Mode Route Calculation -------------------------------------
  const routedFromRef = useRef<Coordinates | null>(null);
  const routedStageRef = useRef<string | null>(null);
  const routedModeRef = useRef<TransportMode | null>(null);

  useEffect(() => {
    if (!startCoords || !isValidCoordinates(stage.coordinates)) {
      setRouteResult(null);
      setRouting(false);
      setRouteError(
        'No valid starting point or stage coordinates. Choose where you are starting from.'
      );
      return;
    }
    const moved = routedFromRef.current
      ? calculateDistanceMeters(routedFromRef.current, startCoords)
      : Infinity;
    const sameStage = routedStageRef.current === stage.id;
    const sameMode = routedModeRef.current === transportMode;

    if (
      routeResult &&
      sameStage &&
      sameMode &&
      moved < REROUTE_METERS &&
      retryTick === 0
    ) {
      return; // GPS jitter: keep the current route
    }

    let cancelled = false;
    setRouting(true);
    setRouteError(null);

    fetchMultiModeRoute(
      startCoords,
      stage.coordinates,
      stage.name,
      transportMode,
      {
        forceRefresh: retryTick > 0,
      }
    )
      .then((res) => {
        if (cancelled) return;
        routedFromRef.current = startCoords;
        routedStageRef.current = stage.id;
        routedModeRef.current = transportMode;
        setRouteResult(res);
        setSelectedOptionIndex(0);
        setManualStepIndex(0);
        setRouting(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setRouteResult(null);
        routedFromRef.current = null;
        const errMsg =
          e instanceof Error
            ? e.message
            : `${modeMeta.label} route could not be loaded.`;
        setRouteError(errMsg);
        setRouting(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startCoords?.lat, startCoords?.lng, stage.id, transportMode, retryTick]);

  const handleSelectTransportMode = useCallback(
    (nextMode: TransportMode) => {
      if (nextMode === transportMode) return;
      setTransportMode(nextMode);
    },
    [transportMode]
  );

  const retry = useCallback(() => {
    setRetryTick((t) => t + 1);
  }, []);

  const minutes = activeRouteOption?.estimatedMinutes ?? null;
  const distLabel = activeRouteOption
    ? formatWalkDistance(activeRouteOption.totalDistanceMeters)
    : '';
  const etaLabel = useMemo(
    () =>
      activeRouteOption
        ? formatArrivalClockTime(activeRouteOption.estimatedDurationSeconds)
        : null,
    [activeRouteOption]
  );

  const steps = activeRouteOption?.steps ?? [];
  const currentStepIndex = useMemo(() => {
    if (steps.length === 0) return 0;
    if (isNavigating) {
      return Math.min(Math.max(0, manualStepIndex), steps.length - 1);
    }
    if (activeStepNumber !== null) {
      const idx = steps.findIndex((s) => s.stepNumber === activeStepNumber);
      if (idx !== -1) return idx;
    }
    return 0;
  }, [steps, isNavigating, manualStepIndex, activeStepNumber]);

  const currentStep = steps[currentStepIndex] ?? null;

  // Navigation progress (0..100%) and remaining distance/time
  const navProgress = useMemo(() => {
    if (!activeRouteOption || steps.length === 0) {
      return {
        percent: 0,
        remainingMeters: activeRouteOption?.totalDistanceMeters ?? 0,
        remainingMinutes: activeRouteOption?.estimatedMinutes ?? 0,
      };
    }
    if (usingGps && userCoords) {
      const remDist = calculateDistanceMeters(userCoords, stage.coordinates);
      const total = Math.max(1, activeRouteOption.totalDistanceMeters);
      const pct = Math.min(
        100,
        Math.max(5, Math.round(((total - remDist) / total) * 100))
      );
      const ratio = remDist / total;
      const remMins = Math.max(
        1,
        Math.round(activeRouteOption.estimatedMinutes * Math.min(1, ratio))
      );
      return {
        percent: pct,
        remainingMeters: remDist,
        remainingMinutes: remMins,
      };
    }
    const completedSteps = currentStepIndex;
    const pct = Math.min(
      100,
      Math.max(
        8,
        Math.round(((completedSteps + 1) / Math.max(1, steps.length)) * 100)
      )
    );
    const remainingStepsSlice = steps.slice(currentStepIndex);
    const remMeters = remainingStepsSlice.reduce(
      (acc, s) => acc + s.distanceMeters,
      0
    );
    const remSecs = remainingStepsSlice.reduce(
      (acc, s) => acc + s.durationSeconds,
      0
    );
    return {
      percent: pct,
      remainingMeters: remMeters,
      remainingMinutes: Math.max(1, Math.round(remSecs / 60)),
    };
  }, [
    activeRouteOption,
    steps,
    usingGps,
    userCoords,
    stage.coordinates,
    currentStepIndex,
  ]);

  const displayInstruction = useMemo(() => {
    if (isNavigating && currentStep) {
      return cleanSpokenInstruction(
        currentStep.instruction,
        currentStep.instruction
      );
    }
    if (!latestInstruction) return null;
    return cleanSpokenInstruction(
      latestInstruction,
      `${modeMeta.actionVerb} toward ${stageShort}.`
    );
  }, [
    isNavigating,
    currentStep,
    latestInstruction,
    stageShort,
    modeMeta.actionVerb,
  ]);

  const bottomPad = useMemo(() => {
    if (sheetState === 'intermediate') return intermediateHeight + 20;
    return COLLAPSED_HEIGHT + 24;
  }, [sheetState, intermediateHeight]);

  // ---- Direct-DOM MapLibre instance: built once per stage/style; updates are injected ----
  const initialRef = useRef({
    start: startCoords,
    label: startLabel,
    polyline: activeRouteOption?.polyline ?? [],
    minutes,
    distLabel,
    bottomPad,
  });
  initialRef.current = {
    start: startCoords,
    label: startLabel,
    polyline: activeRouteOption?.polyline ?? [],
    minutes,
    distLabel,
    bottomPad,
  };

  const onSelectStageRef = useRef(onSelectStageById);
  onSelectStageRef.current = onSelectStageById;

  const apply = useCallback((msg: StageMapApplyMessage) => {
    mapCtrlRef.current?.apply(msg);
  }, []);

  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el || mapFailed) return;

    const ctrl = mountStageMapLibre({
      container: el,
      styleUrl: getOpenFreeMapStyleUrl(useDark ? 'dark' : 'liberty'),
      isDark: useDark,
      originCoords: initialRef.current.start,
      originLabel: initialRef.current.label,
      selectedStage: stage,
      allStages: NAIROBI_DEMO_STAGES,
      routeNumber: route.routeNumber,
      initialPolyline: initialRef.current.polyline,
      initialMinutes: initialRef.current.minutes,
      initialDistanceLabel: initialRef.current.distLabel,
      initialBottomPad: initialRef.current.bottomPad,
      onMapReady: () => {
        setMapReady(true);
      },
      onMapError: () => {
        setMapFailed(true);
      },
      onSelectStageById: (stageId) => {
        onSelectStageRef.current?.(stageId);
      },
      onSelectAltRoute: (optionIdx) => {
        setSelectedOptionIndex(optionIdx);
        setManualStepIndex(0);
      },
    });

    mapCtrlRef.current = ctrl;

    return () => {
      ctrl.destroy();
      if (mapCtrlRef.current === ctrl) {
        mapCtrlRef.current = null;
      }
    };
  }, [useDark, stage, route.routeNumber, mapKey, mapFailed]);

  // Sync primary route + alternative routes to MapLibre
  useEffect(() => {
    if (!mapReady) return;
    const primaryLine = activeRouteOption
      ? activeRouteOption.polyline.map((c): [number, number] => [c.lng, c.lat])
      : [];
    const altLines =
      routeResult && routeResult.routes.length > 1
        ? routeResult.routes
            .filter((_, idx) => idx !== selectedOptionIndex)
            .map((opt) => ({
              optionIndex: opt.optionIndex,
              coords: opt.polyline.map((c): [number, number] => [c.lng, c.lat]),
            }))
        : [];
    const activeCoord: [number, number] | null =
      isNavigating && currentStep?.coordinates
        ? [currentStep.coordinates.lng, currentStep.coordinates.lat]
        : null;

    apply({
      type: 'route',
      line: primaryLine,
      altLines,
      activeStepCoord: activeCoord,
      modeShort: modeMeta.shortLabel,
      minutes,
      dist: distLabel,
      bottomPad,
      fit: !isNavigating && sheetState !== 'expanded',
    });
  }, [
    mapReady,
    activeRouteOption,
    routeResult,
    selectedOptionIndex,
    modeMeta.shortLabel,
    minutes,
    distLabel,
    bottomPad,
    isNavigating,
    sheetState,
    currentStep,
    apply,
  ]);

  // Sync active navigation step highlight on the map
  useEffect(() => {
    if (!mapReady) return;
    if (!isNavigating || !currentStep?.coordinates) {
      apply({ type: 'active-step', coord: null, pan: false });
      return;
    }
    apply({
      type: 'active-step',
      coord: [currentStep.coordinates.lng, currentStep.coordinates.lat],
      pan: sheetState !== 'expanded',
    });
  }, [mapReady, isNavigating, currentStep, sheetState, apply]);

  useEffect(() => {
    if (!mapReady) return;
    apply({
      type: 'user',
      user: startCoords
        ? { lat: startCoords.lat, lng: startCoords.lng, label: startLabel }
        : null,
      fit: false,
    });
  }, [mapReady, startCoords, startLabel, apply]);

  const handleStartNavigation = useCallback(() => {
    if (!activeRouteOption) return;
    setIsNavigating(true);
    setManualStepIndex(0);
    if (sheetStateRef.current === 'expanded') {
      snapToState('collapsed');
    }
    const firstStep = activeRouteOption.steps[0];
    if (firstStep) {
      speakStepInstruction(firstStep);
    }
  }, [activeRouteOption, speakStepInstruction, snapToState]);

  const handleEndNavigation = useCallback(() => {
    setIsNavigating(false);
    stopSpeech();
    if (mapReady) {
      apply({ type: 'active-step', coord: null, pan: false });
      apply({
        type: 'fit',
        bottomPad: COLLAPSED_HEIGHT + 24,
      });
    }
  }, [apply, mapReady, stopSpeech]);

  const handleSelectStep = useCallback(
    (idx: number) => {
      if (
        !activeRouteOption ||
        idx < 0 ||
        idx >= activeRouteOption.steps.length
      ) {
        return;
      }
      setManualStepIndex(idx);
      const step = activeRouteOption.steps[idx];
      if (step) {
        speakStepInstruction(step);
      }
    },
    [activeRouteOption, speakStepInstruction]
  );

  // Touch drag handlers for the 3-state full-screen bottom sheet (Zone A)
  const handleSheetTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length !== 1) return;
      const baseOffset = snapOffsetsRef.current[sheetStateRef.current];
      dragRef.current = {
        active: true,
        startY: e.touches[0].clientY,
        startX: e.touches[0].clientX,
        startOffset: baseOffset,
        startTime: Date.now(),
        moved: false,
      };
    },
    []
  );

  const handleSheetTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const state = dragRef.current;
      if (!state.active || e.touches.length !== 1) return;
      const dy = e.touches[0].clientY - state.startY;
      const dx = e.touches[0].clientX - state.startX;
      if (Math.abs(dy) > 6 && Math.abs(dy) > Math.abs(dx) * 1.1) {
        state.moved = true;
        const { expanded, collapsed } = snapOffsetsRef.current;
        const rawNext = state.startOffset + dy;
        let clamped = rawNext;
        if (rawNext < expanded) {
          clamped = expanded + (rawNext - expanded) * 0.18;
        } else if (rawNext > collapsed) {
          clamped = collapsed + (rawNext - collapsed) * 0.22;
        }
        setDragTranslateY(clamped);
      }
    },
    []
  );

  const handleSheetTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const state = dragRef.current;
      dragRef.current.active = false;
      if (!state.moved || e.changedTouches.length !== 1) {
        setDragTranslateY(null);
        return;
      }
      const dy = e.changedTouches[0].clientY - state.startY;
      const elapsed = Math.max(1, Date.now() - state.startTime);
      const vy = dy / elapsed; // px/ms
      const { expanded, intermediate, collapsed } = snapOffsetsRef.current;
      const pos = Math.max(
        expanded,
        Math.min(collapsed, state.startOffset + dy)
      );
      const fromState = sheetStateRef.current;

      if (vy < -0.5) {
        if (
          fromState === 'collapsed' &&
          pos > intermediate + 40 &&
          Math.abs(dy) < 150
        ) {
          snapToState('intermediate');
        } else {
          snapToState('expanded');
        }
        return;
      }

      if (vy > 0.5) {
        if (
          fromState === 'expanded' &&
          pos < intermediate - 40 &&
          Math.abs(dy) < 150
        ) {
          snapToState('intermediate');
        } else {
          snapToState('collapsed');
        }
        return;
      }

      const midTop = (expanded + intermediate) / 2;
      const midBottom = (intermediate + collapsed) / 2;

      if (pos <= midTop) {
        snapToState('expanded');
      } else if (pos <= midBottom) {
        snapToState('intermediate');
      } else {
        snapToState('collapsed');
      }
    },
    [snapToState]
  );

  const locationProblem =
    locationStatus === 'denied' ||
    locationStatus === 'disabled' ||
    locationStatus === 'error';

  const googleMapsUrl = buildExternalMapsDirectionsUrl(
    startCoords ?? origin.coordinates,
    stage.coordinates,
    transportMode,
    stage.name
  );

  const numLen = route.routeNumber.length;
  const badgeFontSize = Math.round(
    44 * (numLen > 3 ? 0.3 : numLen > 2 ? 0.36 : 0.46)
  );

  const activeTranslateY =
    dragTranslateY !== null ? dragTranslateY : snapOffsets[sheetState];
  const isSheetExpanded = sheetState === 'expanded';

  return (
    <div
      ref={containerRef}
      className="m-map-screen"
      data-no-tab-swipe="true"
    >
      {/* Full-bleed Map Canvas behind overlays */}
      <div className="m-map-canvas">
        {mapFailed ? (
          <div className="m-map-fail">
            <WifiOff size={26} color="var(--stage-ink-muted)" />
            <p className="m-map-fail__text">
              The map could not load. Check your connection and try again.
              Google Maps directions still work below.
            </p>
            <button
              type="button"
              className="m-map-fail__retry"
              onClick={() => {
                setMapFailed(false);
                setMapReady(false);
                setMapKey((k) => k + 1);
              }}
            >
              Try again
            </button>
          </div>
        ) : (
          <div
            ref={mapContainerRef}
            key={`${useDark ? 'dark' : 'light'}-${stage.id}-${mapKey}`}
            aria-label={`Map to ${stage.name}`}
            className="m-map-container"
          />
        )}

        {!mapFailed && !mapReady && (
          <div className="m-map-loading" aria-live="polite">
            <Loader2
              size={26}
              color="var(--stage-accent-electric)"
              className="m-spin"
            />
          </div>
        )}
      </div>

      {/* Top Overlay: Back button + Map/Dark switcher + Active Turn-by-Turn Card */}
      {!isSheetExpanded && (
        <div className="m-map-top-overlay">
          <div className="m-map-top-row">
            <button
              type="button"
              className="m-map-fab"
              onClick={onBack}
              aria-label="Back"
            >
              <ArrowLeft size={20} />
            </button>

            <div
              className="m-map-seg"
              role="group"
              aria-label="Map style selector"
            >
              {[false, true].map((dark) => {
                const active = useDark === dark;
                return (
                  <button
                    key={String(dark)}
                    type="button"
                    className={`m-map-seg__item ${
                      active ? 'm-map-seg__item--active' : ''
                    }`}
                    onClick={() => {
                      if (useDark !== dark) {
                        setMapReady(false);
                        setUseDark(dark);
                      }
                    }}
                    aria-pressed={active}
                  >
                    {dark ? 'Dark' : 'Map'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Turn-by-Turn Navigation Header Card over Map */}
          {isNavigating && currentStep && (
            <div
              className="m-active-nav-card"
              role="region"
              aria-label={`Current navigation step ${currentStepIndex + 1} of ${steps.length}: ${currentStep.instruction}`}
            >
              <div className="m-active-nav-card__top">
                <div className="m-active-nav-card__turn-badge">
                  <StepTurnIcon dir={currentStep.turnDirection} size={20} />
                </div>
                <div className="m-active-nav-card__body">
                  <div className="m-active-nav-card__meta-row">
                    <span className="m-active-nav-card__counter">
                      STEP {currentStepIndex + 1} OF {steps.length} ·{' '}
                      {modeMeta.label.toUpperCase()}
                    </span>
                    {isSpeaking && (
                      <span className="m-active-nav-card__speaking">
                        <Volume2 size={11} />
                        Speaking…
                      </span>
                    )}
                  </div>
                  <div className="m-active-nav-card__instruction">
                    {cleanSpokenInstruction(
                      currentStep.instruction,
                      currentStep.instruction
                    ).replace(/\.$/, '')}
                  </div>
                  <div className="m-active-nav-card__sub">
                    {formatWalkDistance(currentStep.distanceMeters)} ·{' '}
                    {currentStep.landmarkCue || currentStep.streetName}
                  </div>
                </div>
              </div>

              <div className="m-active-nav-card__progress-wrap">
                <div className="m-active-nav-card__progress-track">
                  <div
                    className="m-active-nav-card__progress-fill"
                    style={{ width: `${navProgress.percent}%` }}
                  />
                </div>
                <div className="m-active-nav-card__progress-meta">
                  <span>
                    {navProgress.percent}% ·{' '}
                    {formatWalkDistance(navProgress.remainingMeters)} left (~
                    {navProgress.remainingMinutes} min)
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Simplified right-side map framing controls (only essential Fit Route + My Location in collapsed state) */}
      {sheetState === 'collapsed' && (
        <div
          className="m-map-side-fabs"
          style={{
            bottom: `calc(${COLLAPSED_HEIGHT + 14}px + env(safe-area-inset-bottom, 0px))`,
          }}
        >
          <button
            type="button"
            className="m-map-fab"
            aria-label="Show whole route"
            title="Show whole route"
            onClick={() =>
              apply({ type: 'fit', bottomPad: COLLAPSED_HEIGHT + 24 })
            }
          >
            <Maximize2 size={18} />
          </button>

          <button
            type="button"
            className="m-map-fab"
            aria-label="Center on my location"
            title="Center on my location"
            onClick={() => {
              if (usingGps) apply({ type: 'center-user' });
              else onRequestLocation();
            }}
          >
            <Crosshair
              size={19}
              color={
                usingGps
                  ? 'var(--stage-accent-electric)'
                  : 'var(--stage-ink-secondary)'
              }
            />
          </button>
        </div>
      )}

      {/* =====================================================================
          DRAGGABLE 3-STATE FULL-SCREEN DIRECTIONS BOTTOM SHEET
          (Collapsed -> Intermediate -> Expanded up to top safe area)
          ===================================================================== */}
      <div
        className={`m-map-sheet m-map-sheet--${sheetState}`}
        style={{
          height: `${sheetFullHeight}px`,
          transform: `translateY(${activeTranslateY}px)`,
          transition:
            dragTranslateY !== null
              ? 'none'
              : 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {/* ZONE A: DRAGGABLE COMPACT HEADER & SUMMARY CONTROLS */}
        <div
          className="m-map-sheet__draggable-top"
          onTouchStart={handleSheetTouchStart}
          onTouchMove={handleSheetTouchMove}
          onTouchEnd={handleSheetTouchEnd}
        >
          {/* 1. COMPACT SECTION (202px — visible in all states) */}
          <div className="m-map-sheet__compact-section">
            <button
              type="button"
              className="m-map-sheet__grab-hit"
              onClick={handleToggleSheet}
              aria-label={
                sheetState === 'collapsed'
                  ? 'Expand directions panel'
                  : 'Collapse directions panel'
              }
            >
              <span className="m-map-sheet__grab" />
            </button>

            {/* Row 1: Destination & Boarding Stage Header + Expand/Collapse Chevron */}
            <div className="m-map-sheet__header-row">
              <div
                className="m-route-badge"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 13.2,
                  fontSize: badgeFontSize,
                }}
              >
                {route.routeNumber}
              </div>

              <button
                type="button"
                className="m-map-sheet__title-btn"
                onClick={handleToggleSheet}
                aria-label={`${route.destinationName}, board at ${stageShort}`}
              >
                <div className="m-map-sheet__dest">{route.destinationName}</div>
                <div className="m-map-sheet__stage">
                  Board at <strong>{stageShort}</strong> · {stage.streetAddress}
                </div>
              </button>

              <button
                type="button"
                className="m-map-sheet__collapse-btn"
                onClick={handleToggleSheet}
                aria-label={
                  sheetState === 'collapsed'
                    ? 'Expand full directions'
                    : 'Collapse directions to map'
                }
                title={
                  sheetState === 'collapsed'
                    ? 'Expand full directions'
                    : 'Collapse directions to map'
                }
              >
                {sheetState === 'collapsed' ? (
                  <ChevronUp size={18} />
                ) : (
                  <ChevronDown size={18} />
                )}
              </button>
            </div>

            {/* Row 2: Icon-Only Transport Mode Selector + Travel Time & Distance */}
            <div className="m-map-sheet__mode-metrics-row">
              <div
                className="m-mode-selector-pill"
                role="tablist"
                aria-label="Transport mode selector"
              >
                {TRANSPORT_MODE_OPTIONS.map((option) => {
                  const selected = option.id === transportMode;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      aria-label={`${option.label} directions`}
                      title={`${option.label} directions`}
                      className={`m-mode-icon-btn ${
                        selected ? 'm-mode-icon-btn--active' : ''
                      }`}
                      onClick={() => handleSelectTransportMode(option.id)}
                    >
                      <WebTransportModeIcon mode={option.id} size={19} />
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                className="m-map-sheet__metrics-right"
                onClick={() => {
                  if (sheetState === 'collapsed') {
                    snapToState('intermediate');
                  }
                }}
                aria-label="Expand route details"
              >
                {routing ? (
                  <span className="m-map-sheet__inline-loading">
                    <Loader2
                      size={15}
                      color="var(--stage-accent-electric)"
                      className="m-spin"
                    />
                    <span>Routing…</span>
                  </span>
                ) : activeRouteOption ? (
                  <span className="m-map-sheet__time-dist">
                    <span className="m-map-sheet__duration">{minutes} min</span>
                    <span className="m-map-sheet__distance">· {distLabel}</span>
                  </span>
                ) : (
                  <span className="m-map-sheet__unavail">
                    Route unavailable
                  </span>
                )}
              </button>
            </div>

            {/* Row 3: Single Primary Navigation Action + Compact Voice Toggle */}
            <div className="m-map-sheet__action-row">
              {routeError && !routing ? (
                <button
                  type="button"
                  className="m-primary-nav-btn"
                  onClick={retry}
                >
                  <RefreshCw size={15} />
                  <span>Retry Route</span>
                </button>
              ) : isNavigating ? (
                <button
                  type="button"
                  className="m-primary-nav-btn m-primary-nav-btn--end"
                  onClick={handleEndNavigation}
                >
                  <XCircle size={16} />
                  <span>End Navigation</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="m-primary-nav-btn"
                  disabled={routing || !activeRouteOption}
                  onClick={handleStartNavigation}
                >
                  <Navigation size={15} />
                  <span>Start Navigation</span>
                </button>
              )}

              <button
                type="button"
                className={`m-voice-icon-btn ${
                  voiceEnabled ? 'm-voice-icon-btn--active' : ''
                }`}
                onClick={handleToggleVoice}
                aria-pressed={voiceEnabled}
                aria-label={
                  voiceEnabled
                    ? 'Mute voice guidance'
                    : 'Enable voice guidance'
                }
                title={
                  voiceEnabled
                    ? 'Mute voice guidance'
                    : 'Enable voice guidance'
                }
              >
                {voiceEnabled ? (
                  isSpeaking ? (
                    <Volume2 size={18} />
                  ) : (
                    <Volume1 size={18} />
                  )
                ) : (
                  <VolumeX size={18} />
                )}
              </button>
            </div>
          </div>

          {/* 2. EXPANDED CONTROLS (Below the 202px fold — visible when dragged up) */}
          <div className="m-map-sheet__expanded-controls">
            {activeRouteOption && routeResult && !routing && (
              <div className="m-map-summary-card">
                <div className="m-map-summary-card__top">
                  <div className="m-map-summary-card__badges">
                    {activeRouteOption.isQuickest && (
                      <span className="m-quickest-badge">
                        <Zap size={11} />
                        Quickest
                      </span>
                    )}
                    <span className="m-map-summary-card__via">
                      Via {activeRouteOption.viaSummary}
                    </span>
                  </div>
                  <div className="m-map-summary-card__right">
                    {etaLabel && (
                      <span className="m-map-summary-card__eta">
                        ETA {etaLabel}
                      </span>
                    )}
                    {speechSupported && voiceEnabled && displayInstruction && (
                      <button
                        type="button"
                        className="m-replay-inline-btn"
                        onClick={replayLastInstruction}
                        aria-label="Replay spoken instruction"
                        title="Replay spoken instruction"
                      >
                        <RotateCcw size={12} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="m-map-summary-card__disclaimer">
                  {routeResult.trafficDisclaimer}
                </div>

                {routeResult.routes.length > 1 && (
                  <div className="m-alt-routes-scroll">
                    {routeResult.routes.map((opt, idx) => {
                      const isSelected = idx === selectedOptionIndex;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          className={`m-alt-route-pill ${
                            isSelected ? 'm-alt-route-pill--selected' : ''
                          }`}
                          onClick={() => {
                            setSelectedOptionIndex(idx);
                            setManualStepIndex(0);
                          }}
                        >
                          <div className="m-alt-route-pill__title">
                            {idx === 0
                              ? `Fastest · ${opt.estimatedMinutes} min`
                              : `Option ${idx + 1} · ${opt.estimatedMinutes} min`}
                          </div>
                          <div className="m-alt-route-pill__sub">
                            {formatWalkDistance(opt.totalDistanceMeters)} ·{' '}
                            {opt.viaSummary}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {routeResult.isFallbackProfile &&
                  routeResult.fallbackExplanation && (
                    <div className="m-fallback-notice">
                      <Info size={13} />
                      <span>{routeResult.fallbackExplanation}</span>
                    </div>
                  )}
              </div>
            )}

            {/* Secondary Utility Row: Starting Point & External Google Maps link */}
            <div className="m-secondary-utility-row">
              <button
                type="button"
                className="m-secondary-origin-link"
                onClick={onChangeOrigin}
                aria-label="Change starting point"
              >
                {usingGps ? (
                  <Crosshair size={12} color="var(--stage-accent-electric)" />
                ) : (
                  <MapPin size={12} color="var(--stage-accent-electric)" />
                )}
                <span>
                  From{' '}
                  <strong>{usingGps ? 'Live GPS' : origin.shortName}</strong>{' '}
                  <span className="m-secondary-origin-link__change">
                    · Change
                  </span>
                </span>
              </button>

              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="m-secondary-ext-link"
                aria-label="Open route in external Google Maps"
              >
                <span>Google Maps</span>
                <ExternalLink size={12} />
              </a>
            </div>

            {routeError && !routing && (
              <div className="m-map-sheet__error">
                <div>
                  {routeError} No route is drawn until a real one is returned by
                  the routing service.
                </div>
              </div>
            )}

            {locationProblem && locationMessage && (
              <button
                type="button"
                className="m-map-sheet__loc-warn"
                onClick={
                  permissionBlocked && onOpenSettings
                    ? onOpenSettings
                    : onRequestLocation
                }
              >
                {locationMessage}{' '}
                <strong>
                  {permissionBlocked ? 'Tap for location help.' : 'Tap to retry.'}
                </strong>
              </button>
            )}

            <div className="m-steps-section-header">
              <span className="m-steps-section-header__title">
                TURN-BY-TURN DIRECTIONS ({steps.length})
              </span>
              {isNavigating && (
                <span className="m-steps-section-header__progress">
                  Step {currentStepIndex + 1} of {steps.length} ·{' '}
                  {navProgress.percent}%
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ZONE B: INDEPENDENTLY SCROLLABLE TURN-BY-TURN DIRECTIONS LIST */}
        <div className="m-map-sheet__steps-scroll">
          {routing ? (
            <div className="m-empty-steps-box">
              <Loader2
                size={16}
                color="var(--stage-accent-electric)"
                className="m-spin"
              />
              <span>
                Loading turn-by-turn {modeMeta.ongoingLabel} instructions…
              </span>
            </div>
          ) : steps.length > 0 ? (
            steps.map((s, idx) => {
              const isCurrent = idx === currentStepIndex;
              const cleanStepText = cleanSpokenInstruction(
                s.instruction,
                s.instruction
              ).replace(/\.$/, '');
              return (
                <button
                  key={s.stepNumber}
                  type="button"
                  className={`m-step-card-row ${
                    isCurrent ? 'm-step-card-row--active' : ''
                  }`}
                  onClick={() => handleSelectStep(idx)}
                >
                  <div
                    className={`m-step-icon-circle ${
                      isCurrent ? 'm-step-icon-circle--active' : ''
                    }`}
                  >
                    <StepTurnIcon dir={s.turnDirection} size={15} />
                  </div>
                  <div className="m-step-card-row__body">
                    <div className="m-step-card-row__title-row">
                      <span className="m-step-card-row__title">
                        {s.stepNumber}. {cleanStepText}
                      </span>
                      {isCurrent && (
                        <span className="m-step-card-row__tag">
                          {isNavigating ? 'ACTIVE' : 'NEXT'}
                        </span>
                      )}
                    </div>
                    <div className="m-step-card-row__meta">
                      <span className="m-step-card-row__dist">
                        {formatWalkDistance(s.distanceMeters)}
                      </span>
                      <span className="m-step-card-row__cue">
                        · {s.landmarkCue || s.streetName}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="m-empty-steps-box">
              <Compass size={18} color="var(--stage-ink-muted)" />
              <span>
                Detailed turn-by-turn steps are not available for this route.
              </span>
            </div>
          )}

          <div className="m-map-sheet__attrib">
            {STAGE_MAP_CONFIG.attributionText}
          </div>
        </div>
      </div>
    </div>
  );
};
