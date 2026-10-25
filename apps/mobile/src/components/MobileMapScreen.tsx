import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
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
import {
  buildGoogleMapsWalkingUrl,
  buildOpenFreeMapHtml,
  calculateDistanceMeters,
  Coordinates,
  fetchOsrmWalkingRoute,
  getOpenFreeMapStyleUrl,
  isValidCoordinates,
  NAIROBI_DEMO_STAGES,
  OsrmResolvedWalkRoute,
  SearchMatchResult,
  STAGE_MAP_CONFIG,
} from '@stage/shared';
import { useStageTheme } from '../theme/themeContext';
import { RouteNumberBadge } from './MobileRouteCard';
import { PressableScale } from './Motion';
import { FONTS, MOTION, SHADOW } from '../theme/tokens';
import { formatWalkDistance } from '../utils/destinations';
import {
  cleanSpokenInstruction,
  useWalkingVoiceAssistant,
} from '../hooks/useWalkingVoiceAssistant';

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

/** Re-route only after the user has moved this far from the last routed origin. */
const REROUTE_METERS = 40;

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

  const PEEK_HEIGHT = 104;
  const maxSheetHeight = Math.max(260, Math.min(430, windowHeight - 156));
  const [isExpanded, setIsExpanded] = useState(true);
  const isExpandedRef = useRef(isExpanded);
  isExpandedRef.current = isExpanded;

  const [cardHeight, setCardHeight] = useState(380);
  const cardHeightRef = useRef(380);
  cardHeightRef.current = cardHeight;

  const translateY = useRef(new Animated.Value(0)).current;

  const animateTo = useCallback(
    (toValue: number, callback?: () => void) => {
      if (reduceMotion) {
        translateY.setValue(toValue);
        callback?.();
        return;
      }
      Animated.spring(translateY, {
        toValue,
        damping: 24,
        mass: 0.8,
        stiffness: 220,
        useNativeDriver: true,
      }).start(() => callback?.());
    },
    [reduceMotion, translateY]
  );

  const expand = useCallback(() => {
    setIsExpanded(true);
    animateTo(0);
  }, [animateTo]);

  const collapse = useCallback(() => {
    setIsExpanded(false);
    const maxOffset = Math.max(0, cardHeightRef.current - PEEK_HEIGHT);
    animateTo(maxOffset);
  }, [animateTo]);

  const toggleExpand = useCallback(() => {
    if (isExpandedRef.current) {
      collapse();
    } else {
      expand();
    }
  }, [collapse, expand]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return (
            Math.abs(gestureState.dy) > 7 &&
            Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 1.2
          );
        },
        onPanResponderGrant: () => {
          translateY.stopAnimation();
        },
        onPanResponderMove: (_, gestureState) => {
          const maxOffset = Math.max(0, cardHeightRef.current - PEEK_HEIGHT);
          const base = isExpandedRef.current ? 0 : maxOffset;
          const next = Math.max(0, Math.min(maxOffset, base + gestureState.dy));
          translateY.setValue(next);
        },
        onPanResponderRelease: (_, gestureState) => {
          const maxOffset = Math.max(0, cardHeightRef.current - PEEK_HEIGHT);
          if (gestureState.vy > 0.4 || gestureState.dy > 50) {
            collapse();
          } else if (gestureState.vy < -0.4 || gestureState.dy < -50) {
            expand();
          } else {
            const halfway = maxOffset / 2;
            const currentPos = (isExpandedRef.current ? 0 : maxOffset) + gestureState.dy;
            if (currentPos > halfway) {
              collapse();
            } else {
              expand();
            }
          }
        },
      }),
    [collapse, expand, translateY]
  );

  const [osrm, setOsrm] = useState<OsrmResolvedWalkRoute | null>(null);
  const [routing, setRouting] = useState(true);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [useDark, setUseDark] = useState(theme.isDark);
  const [showSteps, setShowSteps] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapKey, setMapKey] = useState(0);

  const [voiceEnabled, setVoiceEnabled] = useState(true);

  const {
    isSpeaking,
    latestInstruction,
    activeStepNumber,
    lastAnnouncementType,
    stopSpeech,
    replayLastInstruction,
  } = useWalkingVoiceAssistant({
    enabled: voiceEnabled,
    userCoords,
    stage,
    origin,
    routeNumber: route.routeNumber,
    destinationName: route.destinationName,
    osrm,
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

  const displayInstruction = useMemo(() => {
    if (!latestInstruction) return null;
    const stageShort = stage.name.replace(/\s*\((?:Unverified\s+)?Demo\)/gi, '').trim();
    return cleanSpokenInstruction(latestInstruction, `Walk toward ${stageShort}.`);
  }, [latestInstruction, stage.name]);

  // Avoid duplicating instructions already visible in the expanded direction card
  const isInstructionDuplicatedOnCard = useMemo(() => {
    if (!displayInstruction || !isExpanded) return false;
    // When turn-by-turn steps are expanded on the card, step instructions are already shown there
    if (
      showSteps &&
      osrm &&
      osrm.steps.length > 0 &&
      (lastAnnouncementType === 'initial' || lastAnnouncementType === 'turn')
    ) {
      return true;
    }
    // When OSRM steps are unavailable, the fallback initial text repeats the stage name & street shown on the card
    if (
      (!osrm || osrm.steps.length === 0) &&
      lastAnnouncementType === 'initial'
    ) {
      return true;
    }
    return false;
  }, [displayInstruction, isExpanded, showSteps, osrm, lastAnnouncementType]);

  const showVoiceBanner = Boolean(
    voiceEnabled && displayInstruction && !isInstructionDuplicatedOnCard
  );

  useEffect(() => setUseDark(theme.isDark), [theme.isDark]);

  // The start point is either the real GPS fix or the chosen CBD landmark.
  const startCoords: Coordinates | null = useMemo(() => {
    if (userCoords && isValidCoordinates(userCoords)) return userCoords;
    if (isValidCoordinates(origin.coordinates)) return origin.coordinates;
    return null;
  }, [userCoords, origin.coordinates]);
  const usingGps = Boolean(userCoords && isValidCoordinates(userCoords));
  const startLabel = usingGps ? 'Your location' : origin.shortName;

  // ---- Walking route (OSRM foot profile) --------------------------------
  const routedFromRef = useRef<Coordinates | null>(null);
  const routedStageRef = useRef<string | null>(null);

  useEffect(() => {
    if (!startCoords) {
      setRouting(false);
      setRouteError('No valid starting point. Choose where you are starting from.');
      return;
    }
    const moved = routedFromRef.current
      ? calculateDistanceMeters(routedFromRef.current, startCoords)
      : Infinity;
    const sameStage = routedStageRef.current === stage.id;
    if (osrm && sameStage && moved < REROUTE_METERS) {
      return; // GPS jitter: keep the current route
    }
    let cancelled = false;
    setRouting(true);
    setRouteError(null);
    fetchOsrmWalkingRoute(startCoords, stage.coordinates, stage.name, [], {
      forceRefresh: retryTick > 0,
    })
      .then((r) => {
        if (cancelled) return;
        routedFromRef.current = startCoords;
        routedStageRef.current = stage.id;
        setOsrm(r);
        setRouting(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setOsrm(null);
        routedFromRef.current = null;
        setRouteError(
          e instanceof Error ? e.message : 'Walking route could not be loaded.'
        );
        setRouting(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startCoords?.lat, startCoords?.lng, stage.id, retryTick]);

  const retry = useCallback(() => {
    setRetryTick((t) => t + 1);
  }, []);

  const minutes = osrm?.estimatedMinutes ?? null;
  const distLabel = osrm ? formatWalkDistance(osrm.totalDistanceMeters) : '';

  // ---- Map document: built once per stage/style; updates are injected ----
  const initialRef = useRef({ start: startCoords, label: startLabel });
  const html = useMemo(
    () =>
      buildOpenFreeMapHtml({
        styleUrl: getOpenFreeMapStyleUrl(useDark ? 'dark' : 'liberty'),
        originCoords: initialRef.current.start,
        originLabel: initialRef.current.label,
        selectedStage: stage,
        allStages: NAIROBI_DEMO_STAGES,
        routePolyline: [],
        activeMinutes: null,
        formattedDistance: '',
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

  useEffect(() => {
    if (!mapReady) return;
    apply({
      type: 'route',
      line: osrm ? osrm.polyline.map((c) => [c.lng, c.lat]) : [],
      minutes: minutes ?? undefined,
      dist: distLabel,
      fit: true,
    });
  }, [mapReady, osrm, minutes, distLabel, apply]);

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

  const openGoogle = async () => {
    try {
      await Linking.openURL(
        buildGoogleMapsWalkingUrl(
          startCoords ?? origin.coordinates,
          stage.coordinates,
          stage.name
        )
      );
    } catch {
      Alert.alert(
        'Google Maps unavailable',
        `Walk toward ${stage.name} (${stage.streetAddress}).`
      );
    }
  };

  const locationProblem =
    locationStatus === 'denied' ||
    locationStatus === 'disabled' ||
    locationStatus === 'error';

  const fab = [
    styles.fab,
    { backgroundColor: theme.surfaceElevated, borderColor: theme.borderStrong },
  ];
  const zoom = (fn: string) =>
    webRef.current?.injectJavaScript(`window.__stageMap && window.__stageMap.${fn}();true;`);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Map occupies the entire available screen behind the sheet */}
      <View style={StyleSheet.absoluteFill}>
        {mapFailed ? (
          <View style={[styles.fail, { backgroundColor: theme.mapCanvas }]}>
            <Feather name="wifi-off" size={26} color={theme.textMuted} />
            <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>
              The map could not load. Check your connection and try again.
              Google Maps directions still work below.
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
              <Text style={{ fontFamily: FONTS.bold, color: theme.textPrimary, fontWeight: '700' }}>Try again</Text>
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
            style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}
            onLoadStart={() => setMapReady(false)}
            onError={() => setMapFailed(true)}
            onHttpError={() => setMapFailed(true)}
            onMessage={(e) => {
              const data = e.nativeEvent.data;
              if (data.includes('MAP_LOADED')) setMapReady(true);
              else if (data.includes('MAP_ERROR')) setMapFailed(true);
            }}
          />
        )}

        {!mapFailed && !mapReady && (
          <View style={styles.mapLoading} pointerEvents="none">
            <ActivityIndicator color={theme.accentElectric} />
          </View>
        )}
      </View>

      {/* Top overlay container: navigation bar + non-overlapping voice instruction banner */}
      <View style={styles.topOverlay} pointerEvents="box-none">
        <View style={styles.topRow} pointerEvents="box-none">
          <Pressable onPress={onBack} style={fab} accessibilityLabel="Back">
            <Feather name="arrow-left" size={20} color={theme.textPrimary} />
          </Pressable>
          <View
            style={[
              styles.seg,
              { backgroundColor: theme.surfaceElevated, borderColor: theme.borderStrong },
            ]}
          >
            {[false, true].map((dark) => (
              <Pressable
                key={String(dark)}
                onPress={() => setUseDark(dark)}
                style={[styles.segItem, useDark === dark && { backgroundColor: theme.accentElectric }]}
                accessibilityRole="button"
                accessibilityState={{ selected: useDark === dark }}
              >
                <Text
                  style={{
                    fontWeight: '800',
                    fontSize: 13,
                    color: useDark === dark ? theme.textOnAccent : theme.textPrimary,
                  }}
                >
                  {dark ? 'Dark' : 'Map'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {showVoiceBanner && displayInstruction && (
          <View
            style={[
              styles.voiceBanner,
              SHADOW.card,
              {
                backgroundColor: theme.surfaceElevated,
                borderColor: theme.borderStrong,
              },
            ]}
            accessibilityRole="summary"
            accessibilityLabel={`Voice instruction: ${displayInstruction}`}
          >
            <View
              style={[
                styles.voiceIconWrap,
                { backgroundColor: theme.badgeBg },
              ]}
            >
              <Feather
                name={isSpeaking ? 'volume-2' : 'navigation'}
                size={13}
                color={theme.accentElectric}
              />
            </View>
            <Text
              style={[styles.voiceBannerText, { color: theme.textPrimary }]}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {displayInstruction}
            </Text>
            <Pressable
              onPress={replayLastInstruction}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Replay voice instruction"
              style={styles.voiceActionBtn}
            >
              <Feather name="rotate-ccw" size={13} color={theme.textSecondary} />
            </Pressable>
            <Pressable
              onPress={handleToggleVoice}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Mute voice guidance"
              style={styles.voiceActionBtn}
            >
              <Feather name="volume-x" size={13} color={theme.textMuted} />
            </Pressable>
          </View>
        )}
      </View>

      {/* Side map action controls */}
      <View style={[styles.side, { bottom: PEEK_HEIGHT + 14 }]} pointerEvents="box-none">
        <Pressable style={fab} accessibilityLabel="Show whole route" onPress={() => apply({ type: 'fit' })}>
          <Feather name="maximize" size={18} color={theme.textPrimary} />
        </Pressable>
        <Pressable
          style={fab}
          accessibilityLabel="Center on my location"
          onPress={() => {
            if (usingGps) apply({ type: 'center-user' });
            else onRequestLocation();
          }}
        >
          <Feather name="crosshair" size={19} color={usingGps ? theme.accentElectric : theme.textSecondary} />
        </Pressable>
        <Pressable
          style={fab}
          accessibilityLabel={voiceEnabled ? 'Mute voice guidance' : 'Enable voice guidance'}
          onPress={handleToggleVoice}
        >
          <Feather
            name={voiceEnabled ? (isSpeaking ? 'volume-2' : 'volume-1') : 'volume-x'}
            size={19}
            color={voiceEnabled ? theme.accentElectric : theme.textMuted}
          />
        </Pressable>
        <Pressable style={fab} accessibilityLabel="Zoom in" onPress={() => zoom('zoomIn')}>
          <Feather name="plus" size={20} color={theme.textPrimary} />
        </Pressable>
        <Pressable style={fab} accessibilityLabel="Zoom out" onPress={() => zoom('zoomOut')}>
          <Feather name="minus" size={20} color={theme.textPrimary} />
        </Pressable>
      </View>

      {/* Directions bottom sheet overlay */}
      <Animated.View
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && Math.abs(h - cardHeight) > 2) {
            setCardHeight(h);
            cardHeightRef.current = h;
            if (!isExpandedRef.current) {
              translateY.setValue(Math.max(0, h - PEEK_HEIGHT));
            }
          }
        }}
        style={[
          styles.sheet,
          SHADOW.sheet,
          {
            maxHeight: maxSheetHeight,
            backgroundColor: theme.surfaceElevated,
            borderColor: theme.borderSubtle,
            transform: [{ translateY }],
          },
        ]}
      >
        {/* Swipe handle & Header drag zone */}
        <View {...panResponder.panHandlers} style={styles.dragZone}>
          <Pressable
            onPress={toggleExpand}
            hitSlop={12}
            style={styles.grabHit}
            accessibilityRole="button"
            accessibilityLabel={isExpanded ? 'Collapse directions' : 'Expand directions'}
          >
            <View style={[styles.grab, { backgroundColor: theme.borderStrong }]} />
          </Pressable>

          <Pressable
            onPress={toggleExpand}
            style={styles.peekHeader}
            accessibilityRole="button"
            accessibilityLabel={isExpanded ? 'Collapse directions' : 'Expand directions'}
          >
            <RouteNumberBadge value={route.routeNumber} size={44} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={[styles.dest, { color: theme.textPrimary }]} numberOfLines={1}>
                {route.destinationName}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 13 }} numberOfLines={1}>
                {stage.name.replace(' (Demo)', '')} · {stage.streetAddress}
              </Text>
            </View>
            <View style={[styles.peekBadge, { backgroundColor: theme.badgeBg }]}>
              <Feather name="user" size={12} color={theme.accentElectric} />
              <Text style={{ color: theme.badgeText, fontWeight: '700', fontSize: 12 }}>
                {minutes ? `${minutes}m` : distLabel || 'Route'}
              </Text>
            </View>
          </Pressable>
        </View>

        <Pressable
          onPress={onChangeOrigin}
          style={styles.fromRow}
          accessibilityRole="button"
          accessibilityLabel="Change starting point"
        >
          <Feather name={usingGps ? 'crosshair' : 'map-pin'} size={13} color={theme.textSecondary} />
          <Text style={{ color: theme.textSecondary, fontSize: 13, flex: 1 }} numberOfLines={1}>
            From: {usingGps ? 'your live location' : `${origin.name}`}
          </Text>
          <Text style={{ color: theme.accentElectric, fontSize: 13, fontWeight: '700' }}>Change</Text>
        </Pressable>

        {routing ? (
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color={theme.accentElectric} />
            <Text style={{ color: theme.textSecondary }}>Finding walking route…</Text>
          </View>
        ) : osrm ? (
          <View style={styles.statusRow}>
            <Feather name="user" size={14} color={theme.textSecondary} />
            <Text style={{ color: theme.textPrimary, fontWeight: '700' }}>
              {minutes} min ({distLabel}) walking
            </Text>
          </View>
        ) : (
          <View style={[styles.errorBox, { backgroundColor: theme.warningBg, borderColor: theme.warningBorder }]}>
            <Text style={{ color: theme.warningText, fontSize: 13, lineHeight: 18 }}>
              {routeError ?? 'Walking route unavailable.'} No route is drawn
              until a real one is found.
            </Text>
          </View>
        )}

        {locationProblem && locationMessage ? (
          <Pressable
            onPress={permissionBlocked && onOpenSettings ? onOpenSettings : onRequestLocation}
            accessibilityRole="button"
          >
            <Text style={{ color: theme.warningText, fontSize: 12, lineHeight: 17 }}>
              {locationMessage}{' '}
              {permissionBlocked ? 'Tap to open settings.' : 'Tap to retry.'}
            </Text>
          </Pressable>
        ) : null}

        {showSteps && osrm && (
          <ScrollView style={{ maxHeight: 110 }} nestedScrollEnabled>
            {osrm.steps.length > 0 ? (
              osrm.steps.map((s) => {
                const isActiveStep = s.stepNumber === activeStepNumber;
                const cleanStepText = cleanSpokenInstruction(
                  s.instruction,
                  s.instruction
                ).replace(/\.$/, '');
                return (
                  <Text
                    key={s.stepNumber}
                    style={{
                      color: isActiveStep ? theme.textPrimary : theme.textSecondary,
                      fontWeight: isActiveStep ? '700' : '400',
                      fontSize: 13,
                      lineHeight: 18,
                      paddingVertical: 3,
                    }}
                  >
                    {s.stepNumber}. {cleanStepText} ({Math.round(s.distanceMeters)} m)
                  </Text>
                );
              })
            ) : (
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                Turn-by-turn steps were not provided. Follow the green line.
              </Text>
            )}
          </ScrollView>
        )}

        {routeError && !routing ? (
          <PressableScale
            onPress={retry}
            style={[styles.solid, { backgroundColor: theme.accentPrimary }]}
            accessibilityRole="button"
          >
            <Feather name="refresh-cw" size={16} color={theme.textOnAccent} />
            <Text style={[styles.btnText, { color: theme.textOnAccent }]}>Try again</Text>
          </PressableScale>
        ) : (
          <PressableScale
            onPress={() => setShowSteps((v) => !v)}
            disabled={routing || !osrm}
            style={[styles.solid, { backgroundColor: theme.accentPrimary, opacity: routing || !osrm ? 0.6 : 1 }]}
            accessibilityRole="button"
          >
            <Feather name="navigation" size={16} color={theme.textOnAccent} />
            <Text style={[styles.btnText, { color: theme.textOnAccent }]}>
              {showSteps ? 'Hide steps' : 'Walk there'}
            </Text>
          </PressableScale>
        )}
        <PressableScale
          onPress={openGoogle}
          style={[styles.outline, { borderColor: theme.accentElectric }]}
          accessibilityRole="button"
        >
          <Feather name="compass" size={16} color={theme.accentElectric} />
          <Text style={[styles.btnText, { color: theme.textPrimary }]}>Open Maps</Text>
        </PressableScale>
        <Text style={{ color: theme.textMuted, fontSize: 10.5, textAlign: 'center' }}>
          {STAGE_MAP_CONFIG.attributionText}
        </Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  fail: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 30 },
  retryBtn: { paddingHorizontal: 16, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  mapLoading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  topOverlay: {
    position: 'absolute',
    top: 12,
    left: 14,
    right: 14,
    gap: 8,
    zIndex: 15,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fab: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  seg: { flex: 1, flexDirection: 'row', borderRadius: 21, borderWidth: 1, padding: 3, height: 42 },
  segItem: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  side: { position: 'absolute', right: 14, gap: 8, zIndex: 5 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
    gap: 10,
  },
  dragZone: {
    gap: 6,
    paddingBottom: 4,
  },
  grabHit: {
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 24,
  },
  grab: { width: 38, height: 4, borderRadius: 2 },
  peekHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  peekBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
  },
  dest: { fontFamily: FONTS.extraBold, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  fromRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorBox: { borderWidth: 1, borderRadius: 12, padding: 10 },
  solid: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 14 },
  outline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 14, borderWidth: 1 },
  btnText: { fontFamily: FONTS.bold, fontSize: 15, fontWeight: '700' },
  voiceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    maxWidth: '100%',
  },
  voiceIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  voiceBannerText: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    fontSize: 12.5,
    lineHeight: 17,
    fontFamily: FONTS.semiBold,
    fontWeight: '600',
  },
  voiceActionBtn: {
    padding: 4,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
