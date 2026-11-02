import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Linking,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Feather } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';
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
import { useStageTheme } from '../theme/themeContext';
import { RouteNumberBadge } from './MobileRouteCard';
import { PressableScale } from './Motion';
import { FONTS, GLASS } from '../theme/tokens';
import { GlassBackdrop } from './Glass';
import { formatWalkDistance } from '../utils/destinations';
import {
  cleanSpokenInstruction,
  useWalkingVoiceAssistant,
} from '../hooks/useWalkingVoiceAssistant';
import { buildMobileStageMapHtml } from '../utils/mobileMapHtml';

interface Props {
  selectedMatch: SearchMatchResult;
  /** Real device position, or null when GPS is not in use. */
  userCoords: Coordinates | null;
  onBack: () => void;
  onRequestLocation: () => void;
  onChangeOrigin: () => void;
  onOpenSettings?: () => void;
  permissionBlocked?: boolean;
  locationStatus?: string;
  locationMessage?: string;
}

export type SheetSnapState = 'collapsed' | 'intermediate' | 'expanded';

/** Re-route only after the user has moved this far from the last routed origin. */
const REROUTE_METERS = 40;

/** Compact collapsed card height showing essential summary, icon-only modes, and Start/End CTA. */
const COLLAPSED_HEIGHT = 202;

/** Crisp vector transport mode icons (Walk, Car, Motorcycle) with zero font-load latency. */
const TransportModeIcon: React.FC<{
  mode: TransportMode;
  color: string;
  size?: number;
}> = React.memo(({ mode, color, size = 19 }) => {
  if (mode === 'walking') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle cx="13" cy="4.5" r="2" stroke={color} strokeWidth={2.1} />
        <Path
          d="M10 9.5L13 8.5L15.5 11.5L18 13M11.5 9L9.5 15L7 20.5M12.5 14L15.5 17L16.5 21"
          stroke={color}
          strokeWidth={2.1}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }
  if (mode === 'car') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
          d="M5 11L7 6.5C7.3 5.8 8 5.5 8.8 5.5H15.2C16 5.5 16.7 5.8 17 6.5L19 11M3.5 11H20.5V17.5C20.5 18.1 20.1 18.5 19.5 18.5H18.5C17.9 18.5 17.5 18.1 17.5 17.5V16.5H6.5V17.5C6.5 18.1 6.1 18.5 5.5 18.5H4.5C3.9 18.5 3.5 18.1 3.5 17.5V11Z"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Circle cx="7.5" cy="14" r="1.25" fill={color} />
        <Circle cx="16.5" cy="14" r="1.25" fill={color} />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="5.5" cy="16.5" r="3" stroke={color} strokeWidth={2} />
      <Circle cx="18.5" cy="16.5" r="3" stroke={color} strokeWidth={2} />
      <Path
        d="M8.5 16.5H13L15.5 10.5H12.5L10.5 13H7.5L5.5 16.5M14 7.5H16.5L18.5 16.5"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
});

function getStepFeatherIcon(
  dir: TurnDirection
): React.ComponentProps<typeof Feather>['name'] {
  switch (dir) {
    case 'left':
      return 'corner-up-left';
    case 'right':
      return 'corner-up-right';
    case 'arrive':
      return 'flag';
    case 'start':
      return 'navigation';
    default:
      return 'arrow-up';
  }
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

export const MobileMapScreen: React.FC<Props> = ({
  selectedMatch,
  userCoords,
  onBack,
  onRequestLocation,
  onChangeOrigin,
  onOpenSettings,
  permissionBlocked,
  locationStatus,
  locationMessage,
}) => {
  const { theme, reduceMotion } = useStageTheme();
  const { height: windowHeight } = useWindowDimensions();
  const { route, stage, origin } = selectedMatch;
  const webRef = useRef<WebView>(null);

  // Measure actual container height inside safe-area bounds
  const [containerHeight, setContainerHeight] = useState(() =>
    Math.max(480, windowHeight - 48)
  );

  // Full sheet height reaches right up to the top safe area (with 8px top breathing room)
  const sheetFullHeight = useMemo(
    () => Math.max(360, containerHeight - 8),
    [containerHeight]
  );

  // Intermediate snap height (~56% of available screen height, clamped for small screens)
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

  // Snap offsets in translateY space (0 = fully expanded at top safe area, maxOffset = collapsed at bottom)
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

  // Start in clean, minimal collapsed state so the map and route are clearly visible
  const [sheetState, setSheetState] = useState<SheetSnapState>('collapsed');
  const sheetStateRef = useRef<SheetSnapState>(sheetState);
  sheetStateRef.current = sheetState;

  const translateY = useRef(
    new Animated.Value(Math.max(0, windowHeight - 48 - 8 - COLLAPSED_HEIGHT))
  ).current;
  const currentOffsetRef = useRef(snapOffsets.collapsed);

  const snapToState = useCallback(
    (nextState: SheetSnapState, callback?: () => void) => {
      const targetOffset = snapOffsetsRef.current[nextState];
      sheetStateRef.current = nextState;
      setSheetState(nextState);
      currentOffsetRef.current = targetOffset;

      if (reduceMotion) {
        translateY.setValue(targetOffset);
        callback?.();
        return;
      }
      Animated.spring(translateY, {
        toValue: targetOffset,
        damping: 26,
        mass: 0.82,
        stiffness: 230,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          currentOffsetRef.current = targetOffset;
        }
        callback?.();
      });
    },
    [reduceMotion, translateY]
  );

  // Keep translateY synced if screen dimensions / safe area change
  useEffect(() => {
    const target = snapOffsets[sheetStateRef.current];
    currentOffsetRef.current = target;
    translateY.setValue(target);
  }, [snapOffsets, translateY]);

  const handleToggleSheet = useCallback(() => {
    if (sheetStateRef.current === 'collapsed') {
      snapToState('expanded');
    } else {
      snapToState('collapsed');
    }
  }, [snapToState]);

  // Android hardware back button: collapse expanded/intermediate sheet first before leaving map
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sheetStateRef.current !== 'collapsed') {
        snapToState('collapsed');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [snapToState]);

  const dragStartOffsetRef = useRef(0);

  // Continuous drag gesture responder for the bottom sheet
  const sheetDragResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return (
            Math.abs(gestureState.dy) > 6 &&
            Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 1.15
          );
        },
        onPanResponderGrant: () => {
          translateY.stopAnimation((val) => {
            dragStartOffsetRef.current =
              typeof val === 'number' && Number.isFinite(val)
                ? val
                : snapOffsetsRef.current[sheetStateRef.current];
          });
        },
        onPanResponderMove: (_, gestureState) => {
          const { expanded, collapsed } = snapOffsetsRef.current;
          const rawNext = dragStartOffsetRef.current + gestureState.dy;
          let clamped = rawNext;
          if (rawNext < expanded) {
            clamped = expanded + (rawNext - expanded) * 0.18;
          } else if (rawNext > collapsed) {
            clamped = collapsed + (rawNext - collapsed) * 0.22;
          }
          currentOffsetRef.current = clamped;
          translateY.setValue(clamped);
        },
        onPanResponderRelease: (_, gestureState) => {
          const { expanded, intermediate, collapsed } = snapOffsetsRef.current;
          const pos = Math.max(
            expanded,
            Math.min(collapsed, dragStartOffsetRef.current + gestureState.dy)
          );
          const vy = gestureState.vy;
          const dy = gestureState.dy;
          const fromState = sheetStateRef.current;

          if (vy < -0.65) {
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

          if (vy > 0.65) {
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
        onPanResponderTerminate: () => {
          snapToState(sheetStateRef.current);
        },
      }),
    [snapToState, translateY]
  );

  // ---- Transport Mode & Multi-Route State --------------------------------
  const [transportMode, setTransportMode] = useState<TransportMode>('walking');
  const [routeResult, setRouteResult] = useState<MultiModeRouteResult | null>(
    null
  );
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);
  const [routing, setRouting] = useState(true);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [useDark, setUseDark] = useState(theme.isDark);
  const [isNavigating, setIsNavigating] = useState(false);
  const [manualStepIndex, setManualStepIndex] = useState(0);
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

  const {
    isSpeaking,
    latestInstruction,
    activeStepNumber,
    stopSpeech,
    replayLastInstruction,
    announceStep,
  } = useWalkingVoiceAssistant({
    enabled: voiceEnabled,
    userCoords,
    stage,
    origin,
    routeNumber: route.routeNumber,
    destinationName: route.destinationName,
    osrm: activeRouteOption,
    routing,
    transportMode,
    isNavigating,
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

  useEffect(() => setUseDark(theme.isDark), [theme.isDark]);

  // The start point is either the real GPS fix or the chosen CBD landmark.
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
    if (!startCoords) {
      setRouting(false);
      setRouteError(
        'No valid starting point. Choose where you are starting from.'
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
        setRouteError(
          e instanceof Error
            ? e.message
            : `${modeMeta.label} route could not be loaded.`
        );
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

  // Determine the currently highlighted step index (0-based)
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

  // Calculate navigation progress (0..100%) and remaining distance/time
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
    const stageShort = stage.name
      .replace(/\s*\((?:Unverified\s+)?Demo\)/gi, '')
      .trim();
    return cleanSpokenInstruction(
      latestInstruction,
      `${modeMeta.actionVerb} toward ${stageShort}.`
    );
  }, [
    isNavigating,
    currentStep,
    latestInstruction,
    stage.name,
    modeMeta.actionVerb,
  ]);

  // ---- Map document: built once per stage/style; updates are injected ----
  const initialRef = useRef({ start: startCoords, label: startLabel });
  const html = useMemo(
    () =>
      buildMobileStageMapHtml({
        styleUrl: getOpenFreeMapStyleUrl(useDark ? 'dark' : 'liberty'),
        originCoords: initialRef.current.start,
        originLabel: initialRef.current.label,
        selectedStage: stage,
        allStages: NAIROBI_DEMO_STAGES,
        routeNumber: route.routeNumber,
        isDark: useDark,
      }),
    [useDark, stage, route.routeNumber, mapKey]
  );

  const apply = useCallback((msg: object) => {
    webRef.current?.injectJavaScript(
      `window.__stageApply && window.__stageApply(${JSON.stringify(msg)});true;`
    );
  }, []);

  const mapBottomPad = useMemo(() => {
    if (sheetState === 'intermediate') return intermediateHeight + 20;
    return COLLAPSED_HEIGHT + 24;
  }, [sheetState, intermediateHeight]);

  // Sync primary route + quiet alternative routes to the MapLibre WebView
  useEffect(() => {
    if (!mapReady) return;
    const primaryLine = activeRouteOption
      ? activeRouteOption.polyline.map((c) => [c.lng, c.lat])
      : [];
    const altLines =
      routeResult && routeResult.routes.length > 1
        ? routeResult.routes
            .filter((_, idx) => idx !== selectedOptionIndex)
            .map((opt) => ({
              optionIndex: opt.optionIndex,
              coords: opt.polyline.map((c) => [c.lng, c.lat]),
            }))
        : [];
    const activeCoord =
      isNavigating && currentStep?.coordinates
        ? [currentStep.coordinates.lng, currentStep.coordinates.lat]
        : null;

    apply({
      type: 'route',
      line: primaryLine,
      altLines,
      activeStepCoord: activeCoord,
      sig: `${transportMode}-${selectedOptionIndex}-${stage.id}`,
      animateDraw: !reduceMotion,
      minutes: minutes ?? undefined,
      dist: distLabel,
      modeShort: modeMeta.shortLabel,
      bottomPad: mapBottomPad,
      fit: !isNavigating && sheetState !== 'expanded',
    });
  }, [
    mapReady,
    activeRouteOption,
    routeResult,
    selectedOptionIndex,
    transportMode,
    stage.id,
    reduceMotion,
    minutes,
    distLabel,
    modeMeta.shortLabel,
    mapBottomPad,
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
    if (activeRouteOption.steps.length > 0) {
      announceStep(1);
    }
  }, [activeRouteOption, announceStep, snapToState]);

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
        announceStep(step.stepNumber);
      }
    },
    [activeRouteOption, announceStep]
  );

  const openGoogle = async () => {
    try {
      await Linking.openURL(
        buildExternalMapsDirectionsUrl(
          startCoords ?? origin.coordinates,
          stage.coordinates,
          transportMode,
          stage.name
        )
      );
    } catch {
      Alert.alert(
        'External Maps unavailable',
        `${modeMeta.actionVerb} toward ${stage.name} (${stage.streetAddress}).`
      );
    }
  };

  const locationProblem =
    locationStatus === 'denied' ||
    locationStatus === 'disabled' ||
    locationStatus === 'error';

  const fab = [styles.fab, GLASS.floating(theme)];
  const fabGlass = <GlassBackdrop variant="floating" />;

  const stageCleanName = stage.name.replace(' (Demo)', '');
  const isSheetExpanded = sheetState === 'expanded';

  return (
    <View
      style={{ flex: 1, backgroundColor: theme.background }}
      onLayout={(e) => {
        const h = Math.round(e.nativeEvent.layout.height);
        if (h > 240 && Math.abs(h - containerHeight) > 2) {
          setContainerHeight(h);
        }
      }}
    >
      {/* Map occupies the entire available screen behind the sheet (no BlurView over WebView) */}
      <View style={StyleSheet.absoluteFill}>
        {mapFailed ? (
          <View style={[styles.fail, { backgroundColor: theme.mapCanvas }]}>
            <Feather name="wifi-off" size={26} color={theme.textMuted} />
            <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>
              The map could not load. Check your connection and try again.
              External Google Maps directions still work below.
            </Text>
            <Pressable
              onPress={() => {
                setMapFailed(false);
                setMapReady(false);
                setMapKey((k) => k + 1);
              }}
              style={[styles.retryBtn, { borderColor: theme.accentElectric }]}
              accessibilityRole="button"
            >
              <Text
                style={{
                  fontFamily: FONTS.bold,
                  color: theme.textPrimary,
                  fontWeight: '700',
                }}
              >
                Try again
              </Text>
            </Pressable>
          </View>
        ) : (
          <WebView
            ref={webRef}
            key={`${useDark ? 'dark' : 'light'}-${mapKey}`}
            originWhitelist={['*']}
            source={{ html }}
            javaScriptEnabled
            domStorageEnabled
            scrollEnabled={false}
            bounces={false}
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: theme.mapCanvas,
            }}
            onLoadStart={() => setMapReady(false)}
            onError={() => setMapFailed(true)}
            onHttpError={() => setMapFailed(true)}
            onMessage={(e) => {
              const raw = e.nativeEvent.data;
              if (raw.includes('MAP_LOADED')) {
                setMapReady(true);
                return;
              }
              if (raw.includes('MAP_ERROR')) {
                setMapFailed(true);
                return;
              }
              try {
                const parsed = JSON.parse(raw);
                if (
                  parsed?.type === 'SELECT_ALT_ROUTE' &&
                  typeof parsed.optionIndex === 'number'
                ) {
                  setSelectedOptionIndex(parsed.optionIndex);
                }
              } catch {
                // ignore non-JSON messages
              }
            }}
          />
        )}

        {!mapFailed && !mapReady && (
          <View style={styles.mapLoading} pointerEvents="none">
            <ActivityIndicator color={theme.accentElectric} />
          </View>
        )}
      </View>

      {/* Top overlay container (visible when sheet is not covering the full screen) */}
      {!isSheetExpanded && (
        <View style={styles.topOverlay} pointerEvents="box-none">
          <View style={styles.topRow} pointerEvents="box-none">
            <Pressable onPress={onBack} style={fab} accessibilityLabel="Back">
              {fabGlass}
              <Feather name="arrow-left" size={20} color={theme.textPrimary} />
            </Pressable>
            <View style={[styles.seg, GLASS.floating(theme)]}>
              <GlassBackdrop variant="floating" />
              {[false, true].map((dark) => (
                <Pressable
                  key={String(dark)}
                  onPress={() => setUseDark(dark)}
                  style={[
                    styles.segItem,
                    useDark === dark && {
                      backgroundColor: theme.accentElectric,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: useDark === dark }}
                >
                  <Text
                    style={{
                      fontWeight: '800',
                      fontSize: 13,
                      color:
                        useDark === dark
                          ? theme.textOnAccent
                          : theme.textPrimary,
                    }}
                  >
                    {dark ? 'Dark' : 'Map'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Active Turn-by-Turn Navigation Header Card over Map */}
          {isNavigating && currentStep && (
            <View
              style={[
                styles.activeNavCard,
                GLASS.floating(theme),
                { borderColor: theme.accentElectric },
              ]}
              accessibilityRole="summary"
              accessibilityLabel={`Current navigation step ${currentStepIndex + 1} of ${steps.length}: ${currentStep.instruction}`}
            >
              <GlassBackdrop variant="floating" active />
              <View style={styles.activeNavTop}>
                <View
                  style={[
                    styles.turnIconBadge,
                    { backgroundColor: theme.accentElectric },
                  ]}
                >
                  <Feather
                    name={getStepFeatherIcon(currentStep.turnDirection)}
                    size={20}
                    color={theme.textOnAccent}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <View style={styles.activeStepMetaRow}>
                    <Text
                      style={[
                        styles.activeStepCounter,
                        { color: theme.accentElectric },
                      ]}
                    >
                      STEP {currentStepIndex + 1} OF {steps.length} ·{' '}
                      {modeMeta.label.toUpperCase()}
                    </Text>
                    {isSpeaking && (
                      <View
                        style={[
                          styles.speakingPill,
                          { backgroundColor: 'rgba(43, 217, 133, 0.2)' },
                        ]}
                      >
                        <Feather
                          name="volume-2"
                          size={11}
                          color={theme.accentElectric}
                        />
                        <Text
                          style={[
                            styles.speakingPillText,
                            { color: theme.accentElectric },
                          ]}
                        >
                          Speaking…
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.activeNavInstruction,
                      { color: theme.textPrimary },
                    ]}
                    numberOfLines={2}
                  >
                    {cleanSpokenInstruction(
                      currentStep.instruction,
                      currentStep.instruction
                    ).replace(/\.$/, '')}
                  </Text>
                  <Text
                    style={[
                      styles.activeNavSub,
                      { color: theme.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {formatWalkDistance(currentStep.distanceMeters)} ·{' '}
                    {currentStep.landmarkCue || currentStep.streetName}
                  </Text>
                </View>
              </View>

              <View style={styles.progressTrackWrap}>
                <View
                  style={[
                    styles.progressTrack,
                    { backgroundColor: theme.borderSubtle },
                  ]}
                >
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${navProgress.percent}%`,
                        backgroundColor: theme.accentElectric,
                      },
                    ]}
                  />
                </View>
                <View style={styles.progressMetaRow}>
                  <Text
                    style={{
                      color: theme.textSecondary,
                      fontSize: 11.5,
                      fontWeight: '600',
                    }}
                  >
                    {navProgress.percent}% ·{' '}
                    {formatWalkDistance(navProgress.remainingMeters)} left (~
                    {navProgress.remainingMinutes} min)
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Simplified map framing controls (only essential recenter + fit route in collapsed state) */}
      {sheetState === 'collapsed' && (
        <View
          style={[styles.side, { bottom: COLLAPSED_HEIGHT + 14 }]}
          pointerEvents="box-none"
        >
          <Pressable
            style={fab}
            accessibilityRole="button"
            accessibilityLabel="Show whole route"
            onPress={() =>
              apply({
                type: 'fit',
                bottomPad: COLLAPSED_HEIGHT + 24,
              })
            }
          >
            {fabGlass}
            <Feather name="maximize" size={18} color={theme.textPrimary} />
          </Pressable>
          <Pressable
            style={fab}
            accessibilityRole="button"
            accessibilityLabel="Center on my location"
            onPress={() => {
              if (usingGps) apply({ type: 'center-user' });
              else onRequestLocation();
            }}
          >
            {fabGlass}
            <Feather
              name="crosshair"
              size={19}
              color={usingGps ? theme.accentElectric : theme.textSecondary}
            />
          </Pressable>
        </View>
      )}

      {/* =====================================================================
          DRAGGABLE 3-STATE FULL-SCREEN BOTTOM SHEET
          (Collapsed -> Intermediate -> Expanded up to top safe area)
          ===================================================================== */}
      <Animated.View
        style={[
          styles.sheet,
          GLASS.sheet(theme),
          {
            height: sheetFullHeight,
            transform: [{ translateY }],
          },
        ]}
      >
        <GlassBackdrop variant="sheet" />

        {/* -----------------------------------------------------------------
            ZONE A: DRAGGABLE COMPACT HEADER & SUMMARY CONTROLS
            In the 'collapsed' state, only the first 202px (compactSection) is
            visible at the bottom of the screen.
            ----------------------------------------------------------------- */}
        <View {...sheetDragResponder.panHandlers} style={styles.draggableTop}>
          {/* 1. COMPACT CARD (Visible in Collapsed, Intermediate, and Expanded) */}
          <View style={styles.compactSection}>
            {/* Drag Handle Pill */}
            <Pressable
              onPress={handleToggleSheet}
              hitSlop={12}
              style={styles.grabHit}
              accessibilityRole="button"
              accessibilityLabel={
                sheetState === 'collapsed'
                  ? 'Expand directions panel'
                  : 'Collapse directions panel'
              }
            >
              <View
                style={[styles.grab, { backgroundColor: theme.borderStrong }]}
              />
            </Pressable>

            {/* Row 1: Destination & Boarding Stage Header + Expand/Collapse Control */}
            <View style={styles.compactHeaderRow}>
              <RouteNumberBadge value={route.routeNumber} size={44} />
              <Pressable
                onPress={handleToggleSheet}
                style={{ flex: 1, minWidth: 0, gap: 2 }}
                accessibilityRole="button"
                accessibilityLabel={`${route.destinationName}, board at ${stageCleanName}`}
              >
                <Text
                  style={[styles.destTitle, { color: theme.textPrimary }]}
                  numberOfLines={1}
                >
                  {route.destinationName}
                </Text>
                <Text
                  style={[styles.stageSub, { color: theme.textSecondary }]}
                  numberOfLines={1}
                >
                  Board at{' '}
                  <Text
                    style={{ color: theme.accentElectric, fontWeight: '700' }}
                  >
                    {stageCleanName}
                  </Text>{' '}
                  · {stage.streetAddress}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleToggleSheet}
                hitSlop={10}
                style={[
                  styles.collapseBtn,
                  {
                    backgroundColor: theme.isDark
                      ? 'rgba(255,255,255,0.07)'
                      : 'rgba(17,22,19,0.06)',
                    borderColor: theme.borderSubtle,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  sheetState === 'collapsed'
                    ? 'Expand full directions'
                    : 'Collapse directions to map'
                }
              >
                <Feather
                  name={
                    sheetState === 'collapsed' ? 'chevron-up' : 'chevron-down'
                  }
                  size={18}
                  color={theme.textPrimary}
                />
              </Pressable>
            </View>

            {/* Row 2: Icon-Only Transport Mode Selector + Travel Time & Distance */}
            <View style={styles.modeAndMetricsRow}>
              <View
                style={[
                  styles.modeSelectorPill,
                  {
                    backgroundColor: theme.isDark
                      ? 'rgba(8, 17, 13, 0.72)'
                      : 'rgba(226, 236, 230, 0.85)',
                    borderColor: theme.borderSubtle,
                  },
                ]}
                accessibilityRole="tablist"
                accessibilityLabel="Transport mode selector"
              >
                {TRANSPORT_MODE_OPTIONS.map((option) => {
                  const selected = option.id === transportMode;
                  const iconColor = selected
                    ? theme.textOnAccent
                    : theme.textSecondary;
                  return (
                    <Pressable
                      key={option.id}
                      onPress={() => handleSelectTransportMode(option.id)}
                      hitSlop={4}
                      style={[
                        styles.modeIconBtn,
                        selected && {
                          backgroundColor: theme.accentElectric,
                        },
                      ]}
                      accessibilityRole="tab"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${option.label} directions`}
                      accessibilityHint={`Switch route calculation to ${option.label.toLowerCase()} mode`}
                    >
                      <TransportModeIcon
                        mode={option.id}
                        color={iconColor}
                        size={19}
                      />
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                onPress={() => {
                  if (sheetState === 'collapsed') {
                    snapToState('intermediate');
                  }
                }}
                style={styles.compactMetricsRight}
                accessibilityRole="button"
                accessibilityLabel="Expand route details"
              >
                {routing ? (
                  <View style={styles.inlineLoadingRow}>
                    <ActivityIndicator
                      size="small"
                      color={theme.accentElectric}
                    />
                    <Text
                      style={{
                        color: theme.textSecondary,
                        fontSize: 13,
                        fontWeight: '600',
                      }}
                    >
                      Routing…
                    </Text>
                  </View>
                ) : activeRouteOption ? (
                  <View style={styles.compactTimeDistRow}>
                    <Text
                      style={[
                        styles.compactDuration,
                        { color: theme.accentElectric },
                      ]}
                    >
                      {minutes} min
                    </Text>
                    <Text
                      style={[
                        styles.compactDistance,
                        { color: theme.textPrimary },
                      ]}
                    >
                      · {distLabel}
                    </Text>
                  </View>
                ) : (
                  <Text
                    style={{
                      color: theme.warningText,
                      fontSize: 12.5,
                      fontWeight: '600',
                    }}
                    numberOfLines={1}
                  >
                    Route unavailable
                  </Text>
                )}
              </Pressable>
            </View>

            {/* Row 3: Single Primary Navigation Action + Compact Voice Toggle */}
            <View style={styles.compactActionRow}>
              {routeError && !routing ? (
                <PressableScale
                  onPress={retry}
                  style={[
                    styles.primaryNavBtn,
                    { backgroundColor: theme.accentPrimary },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Retry route calculation"
                >
                  <Feather
                    name="refresh-cw"
                    size={15}
                    color={theme.textOnAccent}
                  />
                  <Text
                    style={[
                      styles.primaryNavBtnText,
                      { color: theme.textOnAccent },
                    ]}
                  >
                    Retry Route
                  </Text>
                </PressableScale>
              ) : isNavigating ? (
                <PressableScale
                  onPress={handleEndNavigation}
                  style={[
                    styles.primaryNavBtn,
                    { backgroundColor: '#E5484D' },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="End Navigation"
                >
                  <Feather name="x-circle" size={16} color="#FFFFFF" />
                  <Text style={[styles.primaryNavBtnText, { color: '#FFFFFF' }]}>
                    End Navigation
                  </Text>
                </PressableScale>
              ) : (
                <PressableScale
                  onPress={handleStartNavigation}
                  disabled={routing || !activeRouteOption}
                  style={[
                    styles.primaryNavBtn,
                    {
                      backgroundColor: theme.accentPrimary,
                      opacity: routing || !activeRouteOption ? 0.55 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Start Navigation"
                >
                  <Feather
                    name="navigation"
                    size={15}
                    color={theme.textOnAccent}
                  />
                  <Text
                    style={[
                      styles.primaryNavBtnText,
                      { color: theme.textOnAccent },
                    ]}
                  >
                    Start Navigation
                  </Text>
                </PressableScale>
              )}

              <Pressable
                onPress={handleToggleVoice}
                hitSlop={6}
                style={[
                  styles.voiceToggleIconBtn,
                  {
                    backgroundColor: voiceEnabled
                      ? 'rgba(43, 217, 133, 0.14)'
                      : theme.isDark
                        ? 'rgba(255, 255, 255, 0.06)'
                        : 'rgba(17, 22, 19, 0.06)',
                    borderColor: voiceEnabled
                      ? 'rgba(43, 217, 133, 0.42)'
                      : theme.borderSubtle,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: voiceEnabled }}
                accessibilityLabel={
                  voiceEnabled
                    ? 'Mute voice guidance'
                    : 'Enable voice guidance'
                }
                accessibilityHint="Toggles spoken turn-by-turn audio instructions"
              >
                <Feather
                  name={
                    voiceEnabled
                      ? isSpeaking
                        ? 'volume-2'
                        : 'volume-1'
                      : 'volume-x'
                  }
                  size={18}
                  color={voiceEnabled ? theme.accentElectric : theme.textMuted}
                />
              </Pressable>
            </View>
          </View>

          {/* ---------------------------------------------------------------
              2. EXPANDED DETAILS (Below the 202px fold — visible when dragged up)
              --------------------------------------------------------------- */}
          <View
            style={[
              styles.expandedControlsWrap,
              { borderTopColor: theme.borderSubtle },
            ]}
          >
            {/* Detailed Summary, Alternatives & ETA Card */}
            {activeRouteOption && routeResult && !routing && (
              <View
                style={[
                  styles.summaryCard,
                  {
                    backgroundColor: theme.isDark
                      ? 'rgba(18, 36, 28, 0.55)'
                      : 'rgba(232, 245, 238, 0.75)',
                    borderColor: theme.borderSubtle,
                  },
                ]}
              >
                <View style={styles.summaryTopRow}>
                  <View style={styles.summaryBadgesRow}>
                    {activeRouteOption.isQuickest && (
                      <View
                        style={[
                          styles.quickestBadge,
                          {
                            backgroundColor: 'rgba(43, 217, 133, 0.16)',
                            borderColor: 'rgba(43, 217, 133, 0.42)',
                          },
                        ]}
                      >
                        <Feather
                          name="zap"
                          size={11}
                          color={theme.accentElectric}
                        />
                        <Text
                          style={{
                            color: theme.accentElectric,
                            fontSize: 11,
                            fontWeight: '700',
                          }}
                        >
                          Quickest
                        </Text>
                      </View>
                    )}
                    <Text
                      style={{
                        color: theme.textPrimary,
                        fontSize: 12.5,
                        fontWeight: '700',
                      }}
                    >
                      Via {activeRouteOption.viaSummary}
                    </Text>
                  </View>
                  <View style={styles.summaryRightMeta}>
                    {etaLabel && (
                      <Text
                        style={{
                          color: theme.accentElectric,
                          fontSize: 12,
                          fontWeight: '700',
                        }}
                      >
                        ETA {etaLabel}
                      </Text>
                    )}
                    {voiceEnabled && displayInstruction && (
                      <Pressable
                        onPress={replayLastInstruction}
                        hitSlop={8}
                        style={[
                          styles.replayInlineBtn,
                          { borderColor: theme.borderSubtle },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Replay spoken instruction"
                      >
                        <Feather
                          name="rotate-ccw"
                          size={12}
                          color={theme.accentElectric}
                        />
                      </Pressable>
                    )}
                  </View>
                </View>

                <Text
                  style={{
                    color: theme.textSecondary,
                    fontSize: 11.5,
                    lineHeight: 16,
                  }}
                >
                  {routeResult.trafficDisclaimer}
                </Text>

                {/* Alternative routes selector when provider returns > 1 route */}
                {routeResult.routes.length > 1 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.altScroll}
                  >
                    {routeResult.routes.map((opt, idx) => {
                      const isSelected = idx === selectedOptionIndex;
                      return (
                        <Pressable
                          key={opt.id}
                          onPress={() => {
                            setSelectedOptionIndex(idx);
                            setManualStepIndex(0);
                          }}
                          style={[
                            styles.altPill,
                            {
                              backgroundColor: isSelected
                                ? 'rgba(43, 217, 133, 0.18)'
                                : 'rgba(255, 255, 255, 0.05)',
                              borderColor: isSelected
                                ? theme.accentElectric
                                : theme.borderSubtle,
                            },
                          ]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isSelected }}
                        >
                          <Text
                            style={{
                              color: isSelected
                                ? theme.accentElectric
                                : theme.textPrimary,
                              fontSize: 12,
                              fontWeight: '700',
                            }}
                          >
                            {idx === 0
                              ? `Fastest · ${opt.estimatedMinutes} min`
                              : `Option ${idx + 1} · ${opt.estimatedMinutes} min`}
                          </Text>
                          <Text
                            style={{
                              color: theme.textSecondary,
                              fontSize: 11,
                            }}
                            numberOfLines={1}
                          >
                            {formatWalkDistance(opt.totalDistanceMeters)} ·{' '}
                            {opt.viaSummary}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}

                {/* Motorcycle Road-Routing Fallback Notice */}
                {routeResult.isFallbackProfile &&
                  routeResult.fallbackExplanation && (
                    <View
                      style={[
                        styles.fallbackBox,
                        {
                          backgroundColor: theme.warningBg,
                          borderColor: theme.warningBorder,
                        },
                      ]}
                    >
                      <Feather
                        name="info"
                        size={13}
                        color={theme.warningText}
                        style={{ marginTop: 1 }}
                      />
                      <Text
                        style={{
                          flex: 1,
                          color: theme.warningText,
                          fontSize: 11.5,
                          lineHeight: 16,
                        }}
                      >
                        {routeResult.fallbackExplanation}
                      </Text>
                    </View>
                  )}
              </View>
            )}

            {/* Secondary Utility Row: Starting Point & External Google Maps link */}
            <View style={styles.secondaryUtilityRow}>
              <Pressable
                onPress={onChangeOrigin}
                hitSlop={6}
                style={styles.secondaryOriginLink}
                accessibilityRole="button"
                accessibilityLabel="Change starting point"
              >
                <Feather
                  name={usingGps ? 'crosshair' : 'map-pin'}
                  size={12}
                  color={theme.accentElectric}
                />
                <Text
                  style={{
                    color: theme.textSecondary,
                    fontSize: 12,
                    flexShrink: 1,
                  }}
                  numberOfLines={1}
                >
                  From{' '}
                  <Text style={{ color: theme.textPrimary, fontWeight: '700' }}>
                    {usingGps ? 'Live GPS' : origin.shortName}
                  </Text>{' '}
                  <Text
                    style={{ color: theme.accentElectric, fontWeight: '700' }}
                  >
                    · Change
                  </Text>
                </Text>
              </Pressable>

              <Pressable
                onPress={openGoogle}
                hitSlop={6}
                style={styles.secondaryExtLink}
                accessibilityRole="link"
                accessibilityLabel="Open route in external Google Maps"
              >
                <Text
                  style={{
                    color: theme.textSecondary,
                    fontSize: 12,
                    fontWeight: '600',
                  }}
                >
                  Google Maps
                </Text>
                <Feather
                  name="external-link"
                  size={12}
                  color={theme.textSecondary}
                />
              </Pressable>
            </View>

            {/* Route error or GPS warning when expanded */}
            {routeError && !routing && (
              <View
                style={[
                  styles.errorBox,
                  {
                    backgroundColor: theme.warningBg,
                    borderColor: theme.warningBorder,
                  },
                ]}
              >
                <Text
                  style={{
                    color: theme.warningText,
                    fontSize: 12.5,
                    lineHeight: 17,
                  }}
                >
                  {routeError} No route is drawn until a real one is returned by
                  the routing service.
                </Text>
              </View>
            )}

            {locationProblem && locationMessage ? (
              <Pressable
                onPress={
                  permissionBlocked && onOpenSettings
                    ? onOpenSettings
                    : onRequestLocation
                }
                accessibilityRole="button"
              >
                <Text
                  style={{
                    color: theme.warningText,
                    fontSize: 12,
                    lineHeight: 17,
                  }}
                >
                  {locationMessage}{' '}
                  {permissionBlocked ? 'Tap to open settings.' : 'Tap to retry.'}
                </Text>
              </Pressable>
            ) : null}

            {/* Turn-by-Turn Section Header */}
            <View style={styles.stepsSectionHeader}>
              <Text
                style={[
                  styles.stepsHeaderTitle,
                  { color: theme.textSecondary },
                ]}
              >
                TURN-BY-TURN DIRECTIONS ({steps.length})
              </Text>
              {isNavigating && (
                <Text
                  style={{
                    color: theme.accentElectric,
                    fontSize: 11.5,
                    fontWeight: '700',
                  }}
                >
                  Step {currentStepIndex + 1} of {steps.length} ·{' '}
                  {navProgress.percent}%
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* -----------------------------------------------------------------
            ZONE B: INDEPENDENTLY SCROLLABLE TURN-BY-TURN DIRECTIONS LIST
            Scrolling inside this ScrollView never drags or collapses the sheet.
            ----------------------------------------------------------------- */}
        <ScrollView
          style={styles.stepsListScroll}
          contentContainerStyle={styles.stepsListContent}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
        >
          {routing ? (
            <View style={styles.emptyStepsBox}>
              <ActivityIndicator size="small" color={theme.accentElectric} />
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                Loading turn-by-turn {modeMeta.ongoingLabel} instructions…
              </Text>
            </View>
          ) : steps.length > 0 ? (
            steps.map((s, idx) => {
              const isCurrent = idx === currentStepIndex;
              const cleanStepText = cleanSpokenInstruction(
                s.instruction,
                s.instruction
              ).replace(/\.$/, '');
              return (
                <Pressable
                  key={s.stepNumber}
                  onPress={() => handleSelectStep(idx)}
                  style={[
                    styles.stepCardRow,
                    {
                      backgroundColor: isCurrent
                        ? 'rgba(43, 217, 133, 0.15)'
                        : theme.isDark
                          ? 'rgba(255, 255, 255, 0.03)'
                          : 'rgba(17, 22, 19, 0.03)',
                      borderColor: isCurrent
                        ? theme.accentElectric
                        : theme.borderSubtle,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isCurrent }}
                >
                  <View
                    style={[
                      styles.stepIconCircle,
                      {
                        backgroundColor: isCurrent
                          ? theme.accentElectric
                          : theme.isDark
                            ? 'rgba(255,255,255,0.08)'
                            : 'rgba(17,22,19,0.08)',
                      },
                    ]}
                  >
                    <Feather
                      name={getStepFeatherIcon(s.turnDirection)}
                      size={15}
                      color={
                        isCurrent ? theme.textOnAccent : theme.textSecondary
                      }
                    />
                  </View>

                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <View style={styles.stepTitleRow}>
                      <Text
                        style={{
                          flex: 1,
                          color: isCurrent
                            ? theme.textPrimary
                            : theme.textSecondary,
                          fontFamily: isCurrent ? FONTS.bold : FONTS.semiBold,
                          fontWeight: isCurrent ? '700' : '600',
                          fontSize: 13.5,
                          lineHeight: 19,
                        }}
                      >
                        {s.stepNumber}. {cleanStepText}
                      </Text>
                      {isCurrent && (
                        <View
                          style={[
                            styles.currentStepTag,
                            { backgroundColor: theme.accentElectric },
                          ]}
                        >
                          <Text
                            style={{
                              color: theme.textOnAccent,
                              fontSize: 9.5,
                              fontWeight: '800',
                            }}
                          >
                            {isNavigating ? 'ACTIVE' : 'NEXT'}
                          </Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.stepSubMetaRow}>
                      <Text
                        style={{
                          color: isCurrent
                            ? theme.accentElectric
                            : theme.textMuted,
                          fontSize: 12,
                          fontWeight: '700',
                        }}
                      >
                        {formatWalkDistance(s.distanceMeters)}
                      </Text>
                      <Text
                        style={{
                          color: theme.textMuted,
                          fontSize: 12,
                          flex: 1,
                        }}
                        numberOfLines={1}
                      >
                        · {s.landmarkCue || s.streetName}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })
          ) : (
            <View style={styles.emptyStepsBox}>
              <Feather name="compass" size={18} color={theme.textMuted} />
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                Detailed turn-by-turn steps are not available for this route.
              </Text>
            </View>
          )}

          <Text
            style={{
              color: theme.textMuted,
              fontSize: 10.5,
              textAlign: 'center',
              marginTop: 8,
            }}
          >
            {STAGE_MAP_CONFIG.attributionText}
          </Text>
        </ScrollView>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  fail: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 30,
  },
  retryBtn: {
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapLoading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topOverlay: {
    position: 'absolute',
    top: 10,
    left: 14,
    right: 14,
    gap: 8,
    zIndex: 15,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fab: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seg: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: 21,
    borderWidth: 1,
    padding: 3,
    height: 42,
  },
  segItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  side: { position: 'absolute', right: 14, gap: 8, zIndex: 5 },
  activeNavCard: {
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 12,
    gap: 10,
  },
  activeNavTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  turnIconBadge: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeStepMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  activeStepCounter: {
    fontFamily: FONTS.bold,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  speakingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  speakingPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  activeNavInstruction: {
    fontFamily: FONTS.extraBold,
    fontSize: 15.5,
    lineHeight: 20,
    fontWeight: '800',
  },
  activeNavSub: {
    fontFamily: FONTS.medium,
    fontSize: 12,
  },
  progressTrackWrap: {
    gap: 5,
  },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    overflow: 'hidden',
  },
  draggableTop: {
    paddingHorizontal: 18,
  },
  compactSection: {
    height: COLLAPSED_HEIGHT,
    paddingTop: 4,
    paddingBottom: 12,
    justifyContent: 'space-between',
  },
  grabHit: {
    alignSelf: 'center',
    paddingVertical: 5,
    paddingHorizontal: 32,
  },
  grab: {
    width: 42,
    height: 4.5,
    borderRadius: 3,
  },
  compactHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  destTitle: {
    fontFamily: FONTS.extraBold,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  stageSub: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    lineHeight: 16,
  },
  collapseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeAndMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  modeSelectorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 3,
    gap: 4,
  },
  modeIconBtn: {
    minWidth: 44,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  compactMetricsRight: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  inlineLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 24,
  },
  compactTimeDistRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
  },
  compactDuration: {
    fontFamily: FONTS.extraBold,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  compactDistance: {
    fontFamily: FONTS.bold,
    fontSize: 14.5,
    lineHeight: 19,
    fontWeight: '700',
  },
  compactActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  primaryNavBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  primaryNavBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 14.5,
    fontWeight: '800',
  },
  voiceToggleIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandedControlsWrap: {
    borderTopWidth: 1,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  summaryCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 11,
    gap: 7,
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  summaryBadgesRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 7,
  },
  summaryRightMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  replayInlineBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickestBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  altScroll: {
    gap: 8,
    paddingTop: 2,
  },
  altPill: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 11,
    borderWidth: 1,
    maxWidth: 200,
    gap: 2,
  },
  fallbackBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  secondaryUtilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 2,
  },
  secondaryOriginLink: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
  },
  secondaryExtLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
  },
  errorBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  stepsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  stepsHeaderTitle: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  stepsListScroll: {
    flex: 1,
  },
  stepsListContent: {
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 28,
    gap: 8,
  },
  emptyStepsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 18,
    paddingHorizontal: 12,
  },
  stepCardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 13,
    borderWidth: 1,
  },
  stepIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  currentStepTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  stepSubMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
});
