import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
  const { route, stage, origin } = selectedMatch;
  const webRef = useRef<WebView>(null);

  const sheetY = useRef(new Animated.Value(reduceMotion ? 0 : 60)).current;
  const sheetOpacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    Animated.parallel([
      Animated.timing(sheetY, { toValue: 0, duration: MOTION.slow, easing: MOTION.easing, useNativeDriver: true }),
      Animated.timing(sheetOpacity, { toValue: 1, duration: MOTION.normal, useNativeDriver: true }),
    ]).start();
  }, [reduceMotion, sheetY, sheetOpacity]);

  const [osrm, setOsrm] = useState<OsrmResolvedWalkRoute | null>(null);
  const [routing, setRouting] = useState(true);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [useDark, setUseDark] = useState(theme.isDark);
  const [showSteps, setShowSteps] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapKey, setMapKey] = useState(0);

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
      <View style={{ flex: 1.6 }}>
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

        <View style={styles.side}>
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
          <Pressable style={fab} accessibilityLabel="Zoom in" onPress={() => zoom('zoomIn')}>
            <Feather name="plus" size={20} color={theme.textPrimary} />
          </Pressable>
          <Pressable style={fab} accessibilityLabel="Zoom out" onPress={() => zoom('zoomOut')}>
            <Feather name="minus" size={20} color={theme.textPrimary} />
          </Pressable>
        </View>
      </View>

      <Animated.View
        style={[
          styles.sheet,
          SHADOW.sheet,
          {
            backgroundColor: theme.surfaceElevated,
            borderColor: theme.borderSubtle,
            opacity: sheetOpacity,
            transform: [{ translateY: sheetY }],
          },
        ]}
      >
        <View style={[styles.grab, { backgroundColor: theme.borderStrong }]} />
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <RouteNumberBadge value={route.routeNumber} size={46} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.dest, { color: theme.textPrimary }]} numberOfLines={1}>
              {route.destinationName}
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 13 }} numberOfLines={1}>
              {stage.name.replace(' (Demo)', '')} · {stage.streetAddress}
            </Text>
          </View>
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
          <ScrollView style={{ maxHeight: 110 }}>
            {osrm.steps.length > 0 ? (
              osrm.steps.map((s) => (
                <Text key={s.stepNumber} style={{ color: theme.textSecondary, fontSize: 13, paddingVertical: 3 }}>
                  {s.stepNumber}. {s.instruction} ({Math.round(s.distanceMeters)} m)
                </Text>
              ))
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
  topRow: { position: 'absolute', top: 12, left: 14, right: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  fab: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  seg: { flex: 1, flexDirection: 'row', borderRadius: 21, borderWidth: 1, padding: 3, height: 42 },
  segItem: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  side: { position: 'absolute', right: 14, bottom: 30, gap: 8 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 16, gap: 10, marginTop: -22 },
  grab: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginTop: -6, marginBottom: 2 },
  dest: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  fromRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorBox: { borderWidth: 1, borderRadius: 12, padding: 10 },
  solid: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 14 },
  outline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 14, borderWidth: 1 },
  btnText: { fontFamily: FONTS.bold, fontSize: 15, fontWeight: '700' },
});
