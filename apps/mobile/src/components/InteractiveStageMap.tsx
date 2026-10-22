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
  TurboModuleRegistry,
  View,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import type {
  CameraRef,
  GeoJSONSourceProps,
  LayerProps,
  MapProps,
  MarkerProps,
} from '@maplibre/maplibre-react-native';
import { Feather } from '@expo/vector-icons';
import {
  BoardingStage,
  buildGoogleMapsWalkingUrl,
  buildOpenFreeMapHtml,
  Coordinates,
  fetchOsrmWalkingRoute,
  formatSpokenWalkingScript,
  getOpenFreeMapStyleUrl,
  isValidCoordinates,
  NAIROBI_CBD_ORIGINS,
  NAIROBI_DEMO_STAGES,
  OpenFreeMapStylePreset,
  OsrmResolvedWalkRoute,
  SearchMatchResult,
  STAGE_MAP_CONFIG,
} from '@stage/shared';
import { useStageTheme } from '../theme/themeContext';
import { MONO_FONT } from '../theme/mobileStyles';
import { LocationPermissionState } from '../hooks/useUserLocation';
import { VerificationBadge } from './VerificationBadge';

interface MapLibreRuntimeModule {
  Map: React.ComponentType<MapProps>;
  Camera: React.ComponentType<
    {
      ref?: React.Ref<CameraRef>;
      center?: [number, number];
      zoom?: number;
      duration?: number;
    }
  >;
  GeoJSONSource: React.ComponentType<GeoJSONSourceProps>;
  Layer: React.ComponentType<LayerProps>;
  Marker: React.ComponentType<MarkerProps>;
}

/**
 * Safely detect whether the native MapLibre TurboModule (`MLRNMapViewModule`) is
 * compiled into the current Android binary (Development Build / Production APK)
 * vs running inside the standard Expo Go client.
 */
function getMapLibreRuntime(): MapLibreRuntimeModule | null {
  try {
    const nativeModule = TurboModuleRegistry.get('MLRNMapViewModule');
    if (!nativeModule) {
      return null;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@maplibre/maplibre-react-native') as MapLibreRuntimeModule;
  } catch {
    return null;
  }
}

const MAPLIBRE_RUNTIME = getMapLibreRuntime();

interface InteractiveStageMapProps {
  selectedMatch: SearchMatchResult;
  allMatches: SearchMatchResult[];
  onSelectMatch: (match: SearchMatchResult) => void;
  onBack: () => void;
  onOpenStageDetails: () => void;
  locationStatus: LocationPermissionState;
  locationMessage: string;
  userCoords: Coordinates | null;
  onRequestLocation: () => Promise<Coordinates | null> | void;
  selectedOriginId?: string;
  onSelectOriginId?: (originId: string) => void;
}

// Default Nairobi CBD bounds
const CBD_BOUNDS = {
  minLat: -1.2922,
  maxLat: -1.2802,
  minLng: 36.8178,
  maxLng: 36.8298,
};

function projectToPercent(
  coords: Coordinates,
  bounds = CBD_BOUNDS
): { xPct: number; yPct: number } {
  const xRatio =
    (coords.lng - bounds.minLng) /
    Math.max(0.0001, bounds.maxLng - bounds.minLng);
  const yRatio =
    1 -
    (coords.lat - bounds.minLat) /
      Math.max(0.0001, bounds.maxLat - bounds.minLat);

  return {
    xPct: Math.max(8, Math.min(92, xRatio * 80 + 10)),
    yPct: Math.max(12, Math.min(88, yRatio * 76 + 12)),
  };
}

export const InteractiveStageMap: React.FC<InteractiveStageMapProps> = ({
  selectedMatch,
  allMatches,
  onSelectMatch,
  onBack,
  onOpenStageDetails,
  locationStatus,
  locationMessage,
  userCoords,
  onRequestLocation,
  selectedOriginId,
  onSelectOriginId,
}) => {
  const { theme, reduceMotion } = useStageTheme();
  const { route, stage, walking, origin } = selectedMatch;

  const [osrmRoute, setOsrmRoute] = useState<OsrmResolvedWalkRoute | null>(
    null
  );
  const [isLoadingOsrm, setIsLoadingOsrm] = useState<boolean>(false);
  const [showStepsSheet, setShowStepsSheet] = useState<boolean>(false);
  const [showVoiceTranscript, setShowVoiceTranscript] =
    useState<boolean>(false);
  const [showStageInfoCard, setShowStageInfoCard] = useState<boolean>(true);
  const [fallbackZoom, setFallbackZoom] = useState<number>(
    STAGE_MAP_CONFIG.nairobiStageZoom
  );
  const [fallbackPanOffset, setFallbackPanOffset] = useState<{
    latDelta: number;
    lngDelta: number;
  }>({ latDelta: 0, lngDelta: 0 });
  const [mapLayout, setMapLayout] = useState<{ width: number; height: number }>(
    { width: 360, height: 320 }
  );
  const [lightStylePreset, setLightStylePreset] =
    useState<OpenFreeMapStylePreset>('liberty');
  const [maplibreLoadError, setMaplibreLoadError] = useState<boolean>(false);
  const [webViewLoadError, setWebViewLoadError] = useState<boolean>(false);

  const cameraRef = useRef<CameraRef | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const activeOriginCoords: Coordinates = useMemo(() => {
    if (userCoords && isValidCoordinates(userCoords)) {
      return userCoords;
    }
    if (isValidCoordinates(origin.coordinates)) {
      return origin.coordinates;
    }
    return STAGE_MAP_CONFIG.nairobiDefaultCenter;
  }, [userCoords, origin.coordinates]);

  // Fetch OSRM route from active origin (user GPS or selected CBD landmark) to selected boarding stage
  const loadDirectionsToStage = useCallback(
    async (forceRefresh = false) => {
      if (
        !isValidCoordinates(activeOriginCoords) ||
        !isValidCoordinates(stage.coordinates)
      ) {
        return;
      }
      setIsLoadingOsrm(true);
      try {
        const resolved = await fetchOsrmWalkingRoute(
          activeOriginCoords,
          stage.coordinates,
          stage.name,
          walking.steps,
          { forceRefresh }
        );
        setOsrmRoute(resolved);
      } finally {
        setIsLoadingOsrm(false);
      }
    },
    [activeOriginCoords, stage.coordinates, stage.name, walking.steps]
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoadingOsrm(true);

    fetchOsrmWalkingRoute(
      activeOriginCoords,
      stage.coordinates,
      stage.name,
      walking.steps
    )
      .then((resolved) => {
        if (!cancelled) {
          setOsrmRoute(resolved);
          setIsLoadingOsrm(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsLoadingOsrm(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeOriginCoords,
    stage.coordinates,
    stage.name,
    walking.steps,
  ]);

  useEffect(() => {
    if (reduceMotion) {
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.45,
          duration: 1100,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [reduceMotion, pulseAnim]);

  // Center MapLibre camera when stage changes
  useEffect(() => {
    setShowStageInfoCard(true);
    setFallbackPanOffset({ latDelta: 0, lngDelta: 0 });
    if (cameraRef.current && isValidCoordinates(stage.coordinates)) {
      try {
        cameraRef.current.flyTo({
          center: [stage.coordinates.lng, stage.coordinates.lat],
          zoom: STAGE_MAP_CONFIG.nairobiStageZoom,
          duration: 750,
        });
      } catch {
        // Ignore if native camera is still mounting
      }
    }
  }, [stage.id, stage.coordinates]);

  // "Find My Location" button handler — requests GPS and centers map on user
  const handleFindMyLocation = useCallback(async () => {
    const coords = await onRequestLocation();
    const target = coords ?? userCoords;
    if (target && isValidCoordinates(target)) {
      setFallbackPanOffset({
        latDelta: target.lat - stage.coordinates.lat,
        lngDelta: target.lng - stage.coordinates.lng,
      });
      if (cameraRef.current) {
        try {
          cameraRef.current.flyTo({
            center: [target.lng, target.lat],
            zoom: 16,
            duration: 800,
          });
        } catch {
          // Ignore camera error prior to initialization
        }
      }
    }
  }, [onRequestLocation, userCoords, stage.coordinates]);

  // Dynamic map bounds that frame both the user's position and the stage (with zoom/pan support)
  const dynamicBounds = useMemo(() => {
    const zoomScale = Math.pow(2, 16 - fallbackZoom);
    const lats = [
      activeOriginCoords.lat,
      stage.coordinates.lat,
      CBD_BOUNDS.minLat,
      CBD_BOUNDS.maxLat,
    ];
    const lngs = [
      activeOriginCoords.lng,
      stage.coordinates.lng,
      CBD_BOUNDS.minLng,
      CBD_BOUNDS.maxLng,
    ];
    const baseMinLat = Math.min(...lats);
    const baseMaxLat = Math.max(...lats);
    const baseMinLng = Math.min(...lngs);
    const baseMaxLng = Math.max(...lngs);

    const centerLat =
      (baseMinLat + baseMaxLat) / 2 + fallbackPanOffset.latDelta * 0.5;
    const centerLng =
      (baseMinLng + baseMaxLng) / 2 + fallbackPanOffset.lngDelta * 0.5;
    const halfLat = ((baseMaxLat - baseMinLat) / 2) * zoomScale;
    const halfLng = ((baseMaxLng - baseMinLng) / 2) * zoomScale;

    return {
      minLat: centerLat - halfLat,
      maxLat: centerLat + halfLat,
      minLng: centerLng - halfLng,
      maxLng: centerLng + halfLng,
    };
  }, [
    activeOriginCoords,
    stage.coordinates,
    fallbackZoom,
    fallbackPanOffset,
  ]);

  const activeStylePreset: OpenFreeMapStylePreset = theme.isDark
    ? 'dark'
    : lightStylePreset;

  const activeOpenFreeMapStyleUrl = useMemo(
    () => getOpenFreeMapStyleUrl(activeStylePreset),
    [activeStylePreset]
  );

  const originPos = useMemo(
    () => projectToPercent(activeOriginCoords, dynamicBounds),
    [activeOriginCoords, dynamicBounds]
  );

  // Project OSRM polyline points to pixel segments inside mapLayout
  const osrmPixelSegments = useMemo(() => {
    const pts =
      osrmRoute && osrmRoute.polyline.length >= 2
        ? osrmRoute.polyline
        : [activeOriginCoords, stage.coordinates];

    const pixelPts = pts.map((c) => {
      const p = projectToPercent(c, dynamicBounds);
      return {
        x: (p.xPct / 100) * mapLayout.width,
        y: (p.yPct / 100) * mapLayout.height,
      };
    });

    const segs: Array<{
      key: string;
      cx: number;
      cy: number;
      length: number;
      angleDeg: number;
    }> = [];

    for (let i = 0; i < pixelPts.length - 1; i++) {
      const p1 = pixelPts[i];
      const p2 = pixelPts[i + 1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);
      if (len < 1) continue;
      const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
      segs.push({
        key: `seg-${i}`,
        cx: (p1.x + p2.x) / 2,
        cy: (p1.y + p2.y) / 2,
        length: len + 2,
        angleDeg,
      });
    }
    return segs;
  }, [
    osrmRoute,
    activeOriginCoords,
    stage.coordinates,
    dynamicBounds,
    mapLayout,
  ]);

  // GeoJSON Feature for MapLibre GeoJSONSource
  const routeGeoJsonFeature: GeoJSON.Feature<GeoJSON.LineString> = useMemo(() => {
    const geometry = osrmRoute?.geometryGeoJson ?? {
      type: 'LineString',
      coordinates: [
        [activeOriginCoords.lng, activeOriginCoords.lat],
        [stage.coordinates.lng, stage.coordinates.lat],
      ],
    };
    return {
      type: 'Feature',
      properties: {
        stageId: stage.id,
        source: osrmRoute?.source ?? 'curated-fallback',
      },
      geometry,
    };
  }, [osrmRoute, activeOriginCoords, stage]);

  const activeDistanceMeters =
    osrmRoute?.totalDistanceMeters ?? walking.totalDistanceMeters;
  const activeMinutes = osrmRoute?.estimatedMinutes ?? walking.estimatedMinutes;
  const activeSteps = osrmRoute?.steps ?? walking.steps;

  const formattedDistance =
    activeDistanceMeters >= 1000
      ? `${(activeDistanceMeters / 1000).toFixed(2)} km`
      : `${activeDistanceMeters} m`;

  const handleSelectStageMarker = (targetStage: BoardingStage) => {
    setShowStageInfoCard(true);
    const matchForStage = allMatches.find(
      (m) => m.stage.id === targetStage.id
    );
    if (matchForStage) {
      onSelectMatch(matchForStage);
    }
  };

  const handleOpenGoogleMaps = async () => {
    const url = buildGoogleMapsWalkingUrl(
      activeOriginCoords,
      stage.coordinates,
      stage.name
    );
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        'External Navigation Unavailable',
        `Walk toward ${stage.name} (${stage.streetAddress}).`
      );
    }
  };

  const spokenScript = useMemo(
    () => formatSpokenWalkingScript(stage, route, walking),
    [stage, route, walking]
  );

  const mapCenterLngLat: [number, number] = useMemo(
    () => [
      (activeOriginCoords.lng + stage.coordinates.lng) / 2,
      (activeOriginCoords.lat + stage.coordinates.lat) / 2,
    ],
    [activeOriginCoords, stage.coordinates]
  );

  const openFreeMapWebViewHtml = useMemo(
    () =>
      buildOpenFreeMapHtml({
        styleUrl: activeOpenFreeMapStyleUrl,
        originCoords: activeOriginCoords,
        originLabel: userCoords ? 'My GPS' : origin.shortName,
        selectedStage: stage,
        allStages: NAIROBI_DEMO_STAGES,
        routePolyline:
          osrmRoute && osrmRoute.polyline.length >= 2
            ? osrmRoute.polyline
            : [activeOriginCoords, stage.coordinates],
        activeMinutes,
        formattedDistance,
        routeNumber: route.routeNumber,
        isDark: theme.isDark,
      }),
    [
      activeOpenFreeMapStyleUrl,
      activeOriginCoords,
      userCoords,
      origin.shortName,
      stage,
      osrmRoute,
      activeMinutes,
      formattedDistance,
      route.routeNumber,
      theme.isDark,
    ]
  );

  const handleWebViewMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const parsed = JSON.parse(event.nativeEvent.data) as {
          type?: string;
          stageId?: string;
        };
        if (parsed.type === 'SELECT_STAGE' && parsed.stageId) {
          const clickedStage = NAIROBI_DEMO_STAGES.find(
            (s) => s.id === parsed.stageId
          );
          if (clickedStage) {
            setShowStageInfoCard(true);
            const matchForStage = allMatches.find(
              (m) => m.stage.id === clickedStage.id
            );
            if (matchForStage) {
              onSelectMatch(matchForStage);
            }
          }
        } else if (parsed.type === 'MAP_ERROR') {
          setWebViewLoadError(true);
        }
      } catch {
        // Ignore malformed message
      }
    },
    [allMatches, onSelectMatch]
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Top Interactive Map Viewport */}
      <View
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          if (width > 0 && height > 0) {
            setMapLayout({ width, height });
          }
        }}
        style={[
          styles.mapViewport,
          showStepsSheet ? styles.mapViewportCompact : styles.mapViewportLarge,
          {
            backgroundColor: theme.mapCanvas,
            borderColor: theme.borderSubtle,
          },
        ]}
      >
        {MAPLIBRE_RUNTIME && !maplibreLoadError ? (
          /* TIER 1: NATIVE MAPLIBRE REACT NATIVE ENGINE WITH OPENFREEMAP (Expo Dev Build / APK) */
          <MAPLIBRE_RUNTIME.Map
            style={StyleSheet.absoluteFill}
            mapStyle={activeOpenFreeMapStyleUrl}
            onDidFailLoadingMap={() => setMaplibreLoadError(true)}
            dragPan
            touchZoom
            doubleTapZoom
          >
            <MAPLIBRE_RUNTIME.Camera
              ref={cameraRef}
              center={mapCenterLngLat}
              zoom={STAGE_MAP_CONFIG.nairobiStageZoom}
            />

            {/* OSRM GeoJSON Route Line */}
            <MAPLIBRE_RUNTIME.GeoJSONSource
              id="stage-osrm-route-source"
              data={routeGeoJsonFeature}
            >
              <MAPLIBRE_RUNTIME.Layer
                id="stage-osrm-route-line"
                type="line"
                paint={{
                  'line-color': theme.accentPrimary,
                  'line-width': 5,
                  'line-opacity': 0.92,
                }}
              />
            </MAPLIBRE_RUNTIME.GeoJSONSource>

            {/* User Position Marker */}
            <MAPLIBRE_RUNTIME.Marker
              id="stage-user-origin-marker"
              lngLat={[activeOriginCoords.lng, activeOriginCoords.lat]}
            >
              <View style={styles.nativeOriginMarker}>
                <View
                  style={[
                    styles.uberOriginCircle,
                    {
                      backgroundColor: theme.textPrimary,
                      borderColor: theme.surfaceElevated,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.uberOriginInnerDot,
                      { backgroundColor: theme.surfaceElevated },
                    ]}
                  />
                </View>
                <View
                  style={[
                    styles.uberCalloutPill,
                    {
                      backgroundColor: theme.surfaceElevated,
                      borderColor: theme.borderStrong,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.uberCalloutTitle,
                      { color: theme.textPrimary },
                    ]}
                  >
                    {userCoords ? 'My GPS' : origin.shortName}
                  </Text>
                </View>
              </View>
            </MAPLIBRE_RUNTIME.Marker>

            {/* Nairobi CBD Boarding Stage Markers */}
            {NAIROBI_DEMO_STAGES.map((stg) => {
              const isSelectedStage = stg.id === stage.id;
              return (
                <MAPLIBRE_RUNTIME.Marker
                  key={stg.id}
                  id={`stage-marker-${stg.id}`}
                  lngLat={[stg.coordinates.lng, stg.coordinates.lat]}
                  onPress={() => handleSelectStageMarker(stg)}
                >
                  <Pressable
                    onPress={() => handleSelectStageMarker(stg)}
                    style={styles.nativeStageMarkerWrap}
                  >
                    {isSelectedStage && (
                      <View
                        style={[
                          styles.boardHereBadge,
                          { backgroundColor: theme.accentPrimary },
                        ]}
                      >
                        <Text
                          style={[
                            styles.boardHereBadgeText,
                            { color: theme.textOnAccent },
                          ]}
                        >
                          BOARD HERE
                        </Text>
                      </View>
                    )}
                    <View
                      style={[
                        isSelectedStage
                          ? styles.uberDestSquare
                          : styles.inactiveStageDot,
                        {
                          backgroundColor: isSelectedStage
                            ? theme.accentPrimary
                            : theme.mapStageInactive,
                          borderColor: isSelectedStage
                            ? theme.textOnAccent
                            : theme.borderStrong,
                        },
                      ]}
                    >
                      <Feather
                        name={isSelectedStage ? 'navigation' : 'map-pin'}
                        size={isSelectedStage ? 12 : 9}
                        color={
                          isSelectedStage
                            ? theme.textOnAccent
                            : theme.mapStageInactiveText
                        }
                      />
                    </View>
                  </Pressable>
                </MAPLIBRE_RUNTIME.Marker>
              );
            })}
          </MAPLIBRE_RUNTIME.Map>
        ) : !webViewLoadError ? (
          /* TIER 2: EXPO GO COMPATIBLE WEBVIEW RUNNING MAPLIBRE GL JS + OPENFREEMAP VECTOR STYLES */
          <WebView
            key={`ofm-webview-${activeStylePreset}-${stage.id}-${activeOriginCoords.lat.toFixed(4)}`}
            originWhitelist={['*']}
            source={{ html: openFreeMapWebViewHtml }}
            style={StyleSheet.absoluteFill}
            javaScriptEnabled
            domStorageEnabled
            scrollEnabled={false}
            bounces={false}
            onMessage={handleWebViewMessage}
            onError={() => setWebViewLoadError(true)}
            onHttpError={() => setWebViewLoadError(true)}
          />
        ) : (
          /* TIER 3: OFFLINE / NO-NETWORK VECTOR STREET GRID FALLBACK (Zero Raster Images) */
          <>
            {/* Vector CBD Street Grid Backup & Labels */}
            <View
              style={[
                styles.gridHorizontalNorth,
                { borderColor: theme.mapGridLine },
              ]}
            />
            <View
              style={[
                styles.gridHorizontalMid,
                { borderColor: theme.mapCorridorStroke },
              ]}
            />
            <View
              style={[
                styles.gridVerticalMoi,
                { borderColor: theme.mapCorridorStroke },
              ]}
            />
            <View
              style={[
                styles.gridVerticalTomMboya,
                { borderColor: theme.mapCorridorStroke },
              ]}
            />
            <Text
              style={[styles.streetLabelMoi, { color: theme.mapStreetLabel }]}
            >
              MOI AVE
            </Text>
            <Text
              style={[
                styles.streetLabelTomMboya,
                { color: theme.mapStreetLabel },
              ]}
            >
              TOM MBOYA ST
            </Text>

            {/* Rendered Project-OSRM GeoJSON Route Polyline */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {osrmPixelSegments.map((seg) => (
                <View
                  key={seg.key}
                  style={[
                    styles.osrmRouteSegment,
                    {
                      width: seg.length,
                      left: seg.cx - seg.length / 2,
                      top: seg.cy - 2.5,
                      backgroundColor: theme.accentPrimary,
                      transform: [{ rotate: `${seg.angleDeg}deg` }],
                    },
                  ]}
                />
              ))}
            </View>

            {/* User Geological Position Marker */}
            <View
              style={[
                styles.originMarkerWrap,
                {
                  left: `${originPos.xPct}%`,
                  top: `${originPos.yPct}%`,
                },
              ]}
            >
              <View
                style={[
                  styles.uberOriginCircle,
                  {
                    backgroundColor: theme.textPrimary,
                    borderColor: theme.surfaceElevated,
                  },
                ]}
              >
                <View
                  style={[
                    styles.uberOriginInnerDot,
                    { backgroundColor: theme.surfaceElevated },
                  ]}
                />
              </View>
              <View
                style={[
                  styles.uberCalloutPill,
                  {
                    backgroundColor: theme.surfaceElevated,
                    borderColor: theme.borderStrong,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.uberCalloutTitle,
                    { color: theme.textPrimary },
                  ]}
                >
                  {userCoords ? 'My GPS' : origin.shortName}
                </Text>
                <Text
                  style={[styles.uberCalloutSub, { color: theme.textMuted }]}
                >
                  {activeOriginCoords.lat.toFixed(4)},{' '}
                  {activeOriginCoords.lng.toFixed(4)}
                </Text>
              </View>
            </View>

            {/* Nairobi CBD Boarding Stage Markers ("BOARD HERE" for selected stage) */}
            {NAIROBI_DEMO_STAGES.map((stg) => {
              const pos = projectToPercent(stg.coordinates, dynamicBounds);
              const isSelectedStage = stg.id === stage.id;
              return (
                <Pressable
                  key={stg.id}
                  onPress={() => handleSelectStageMarker(stg)}
                  style={[
                    styles.stageMarkerWrap,
                    {
                      left: `${pos.xPct}%`,
                      top: `${pos.yPct}%`,
                      zIndex: isSelectedStage ? 25 : 10,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelectedStage }}
                  accessibilityLabel={`Boarding stage ${stg.name}`}
                >
                  {isSelectedStage && (
                    <View
                      style={[
                        styles.boardHereBadge,
                        { backgroundColor: theme.accentPrimary },
                      ]}
                    >
                      <Text
                        style={[
                          styles.boardHereBadgeText,
                          { color: theme.textOnAccent },
                        ]}
                      >
                        BOARD HERE
                      </Text>
                    </View>
                  )}

                  {isSelectedStage && (
                    <Animated.View
                      style={[
                        styles.stagePulseRing,
                        {
                          borderColor: theme.accentPrimary,
                          transform: [{ scale: pulseAnim }],
                        },
                      ]}
                    />
                  )}

                  <View
                    style={[
                      isSelectedStage
                        ? styles.uberDestSquare
                        : styles.inactiveStageDot,
                      {
                        backgroundColor: isSelectedStage
                          ? theme.accentPrimary
                          : theme.mapStageInactive,
                        borderColor: isSelectedStage
                          ? theme.textOnAccent
                          : theme.borderStrong,
                      },
                    ]}
                  >
                    <Feather
                      name={isSelectedStage ? 'navigation' : 'map-pin'}
                      size={isSelectedStage ? 12 : 9}
                      color={
                        isSelectedStage
                          ? theme.textOnAccent
                          : theme.mapStageInactiveText
                      }
                    />
                  </View>

                  {isSelectedStage && (
                    <View
                      style={[
                        styles.uberDestCallout,
                        {
                          backgroundColor: theme.heroSurface,
                          borderColor: theme.accentPrimary,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.uberTimeBox,
                          { backgroundColor: theme.accentPrimary },
                        ]}
                      >
                        <Text
                          style={[
                            styles.uberTimeNum,
                            { color: theme.textOnAccent },
                          ]}
                        >
                          {activeMinutes}
                        </Text>
                        <Text
                          style={[
                            styles.uberTimeUnit,
                            { color: theme.textOnAccent },
                          ]}
                        >
                          MIN
                        </Text>
                      </View>
                      <View style={{ paddingHorizontal: 7, paddingVertical: 3 }}>
                        <Text
                          style={[
                            styles.uberDestName,
                            { color: theme.heroText },
                          ]}
                          numberOfLines={1}
                        >
                          {stg.name}
                        </Text>
                        <Text
                          style={[
                            styles.uberDestCoords,
                            { color: theme.heroSubtext },
                          ]}
                        >
                          { formattedDistance } · RT {route.routeNumber}
                        </Text>
                      </View>
                    </View>
                  )}
                </Pressable>
              );
            })}

            {/* Zoom & Pan Controls for Expo Go Tile Mode */}
            <View style={styles.zoomControlStack}>
              <Pressable
                onPress={() =>
                  setFallbackZoom((z) => Math.min(18, z + 1))
                }
                style={[
                  styles.zoomBtn,
                  {
                    backgroundColor: theme.surfaceElevated,
                    borderColor: theme.borderStrong,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Zoom in map"
              >
                <Feather name="plus" size={14} color={theme.textPrimary} />
              </Pressable>
              <Pressable
                onPress={() =>
                  setFallbackZoom((z) => Math.max(13, z - 1))
                }
                style={[
                  styles.zoomBtn,
                  {
                    backgroundColor: theme.surfaceElevated,
                    borderColor: theme.borderStrong,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Zoom out map"
              >
                <Feather name="minus" size={14} color={theme.textPrimary} />
              </Pressable>
              <Pressable
                onPress={() => {
                  setFallbackZoom(STAGE_MAP_CONFIG.nairobiStageZoom);
                  setFallbackPanOffset({ latDelta: 0, lngDelta: 0 });
                }}
                style={[
                  styles.zoomBtn,
                  {
                    backgroundColor: theme.surfaceElevated,
                    borderColor: theme.borderStrong,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Reset map view to stage and origin"
              >
                <Feather name="maximize-2" size={13} color={theme.textPrimary} />
              </Pressable>
            </View>
          </>
        )}

        {/* Floating Top Navigation, OSRM Status Pill & "Find My Location" Button */}
        <View style={styles.floatingTopBar}>
          <Pressable
            onPress={onBack}
            style={[
              styles.roundBackBtn,
              {
                backgroundColor: theme.surfaceElevated,
                borderColor: theme.borderStrong,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Back to destination search"
          >
            <Feather name="arrow-left" size={18} color={theme.textPrimary} />
          </Pressable>

          <View
            style={[
              styles.osrmStatusPill,
              {
                backgroundColor: theme.surfaceElevated,
                borderColor: theme.accentBorder,
              },
            ]}
          >
            {isLoadingOsrm ? (
              <ActivityIndicator size="small" color={theme.accentPrimary} />
            ) : (
              <View
                style={[
                  styles.liveDot,
                  {
                    backgroundColor:
                      osrmRoute?.source === 'osrm-live'
                        ? theme.accentElectric
                        : theme.accentPrimary,
                  },
                ]}
              />
            )}
            <Text
              style={[styles.osrmStatusText, { color: theme.textPrimary }]}
              numberOfLines={1}
            >
              {osrmRoute?.source === 'osrm-live'
                ? 'OSRM Road Route'
                : 'CBD Fallback Route'}{' '}
              · {activeMinutes} min ({formattedDistance})
            </Text>
          </View>

          <Pressable
            onPress={handleFindMyLocation}
            style={[
              styles.findMyLocationBtn,
              {
                backgroundColor:
                  locationStatus === 'granted'
                    ? theme.accentPrimary
                    : theme.surfaceElevated,
                borderColor:
                  locationStatus === 'granted'
                    ? theme.accentPrimary
                    : theme.borderStrong,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Find My Location using device GPS"
          >
            {locationStatus === 'loading' ? (
              <ActivityIndicator
                size="small"
                color={theme.accentPrimary}
              />
            ) : (
              <Feather
                name="crosshair"
                size={14}
                color={
                  locationStatus === 'granted'
                    ? theme.textOnAccent
                    : theme.accentPrimary
                }
              />
            )}
            <Text
              style={[
                styles.findMyLocationText,
                {
                  color:
                    locationStatus === 'granted'
                      ? theme.textOnAccent
                      : theme.textPrimary,
                },
              ]}
            >
              {locationStatus === 'granted' ? 'My GPS' : 'Find Me'}
            </Text>
          </Pressable>
        </View>

        {/* Visible Map Attribution (OpenFreeMap © OpenMapTiles Data from OpenStreetMap) */}
        <View
          style={[
            styles.attributionPill,
            {
              backgroundColor: theme.isDark
                ? 'rgba(12, 16, 14, 0.88)'
                : 'rgba(255, 255, 255, 0.92)',
              borderColor: theme.borderSubtle,
            },
          ]}
          pointerEvents="none"
        >
          <Text
            style={[styles.attributionText, { color: theme.textSecondary }]}
          >
            {STAGE_MAP_CONFIG.attributionText}
          </Text>
        </View>

        {/* OpenFreeMap Light Style Preset Toggle (Liberty vs Positron) */}
        {!theme.isDark && (
          <Pressable
            onPress={() =>
              setLightStylePreset((prev) =>
                prev === 'liberty' ? 'positron' : 'liberty'
              )
            }
            style={[
              styles.stylePresetBtn,
              {
                backgroundColor: 'rgba(255, 255, 255, 0.92)',
                borderColor: theme.borderStrong,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Switch OpenFreeMap light style between Liberty and Positron"
          >
            <Feather name="layers" size={11} color={theme.accentPrimary} />
            <Text style={[styles.stylePresetText, { color: theme.textPrimary }]}>
              {lightStylePreset === 'liberty' ? 'Liberty' : 'Positron'}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Dismissible Selected Stage Info Card (Section 3.4 & Section 4.1) */}
      {showStageInfoCard && (
        <View
          style={[
            styles.stageInfoCard,
            {
              backgroundColor: theme.surfaceElevated,
              borderColor: theme.accentBorder,
            },
          ]}
        >
          <View style={styles.stageInfoHeader}>
            <View style={styles.stageInfoBadgeRow}>
              <View
                style={[
                  styles.boardAtPill,
                  { backgroundColor: theme.accentPrimary },
                ]}
              >
                <Text
                  style={[styles.boardAtPillText, { color: theme.textOnAccent }]}
                >
                  BOARD HERE · {stage.code}
                </Text>
              </View>
              <VerificationBadge status={stage.verificationStatus} compact />
            </View>

            <Pressable
              onPress={() => setShowStageInfoCard(false)}
              hitSlop={8}
              style={styles.closeInfoCardBtn}
              accessibilityRole="button"
              accessibilityLabel="Close stage information card"
            >
              <Feather name="x" size={16} color={theme.textMuted} />
            </Pressable>
          </View>

          <Text style={[styles.stageInfoTitle, { color: theme.textPrimary }]}>
            {stage.name}
          </Text>

          <View style={styles.stageInfoMetaGrid}>
            <View style={styles.stageInfoMetaItem}>
              <Feather name="map-pin" size={12} color={theme.accentPrimary} />
              <Text
                style={[
                  styles.stageInfoMetaText,
                  { color: theme.textSecondary },
                ]}
              >
                Road/Area: {stage.streetAddress}
              </Text>
            </View>
            <View style={styles.stageInfoMetaItem}>
              <Feather name="compass" size={12} color={theme.accentPrimary} />
              <Text
                style={[
                  styles.stageInfoMetaText,
                  { color: theme.textSecondary },
                ]}
              >
                Landmark: {stage.nearestLandmark}
              </Text>
            </View>
            <View style={styles.stageInfoMetaItem}>
              <Feather name="navigation" size={12} color={theme.accentPrimary} />
              <Text
                style={[
                  styles.stageInfoMetaText,
                  { color: theme.textSecondary },
                ]}
              >
                Route {route.routeNumber} Destinations:{' '}
                {route.corridors.join(' → ')}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Bottom Stage Confirmation, Directions & OSRM Sheet */}
      <View
        style={[
          styles.uberSheet,
          {
            backgroundColor: theme.surfaceElevated,
            borderColor: theme.borderSubtle,
          },
        ]}
      >
        <View
          style={[
            styles.sheetHandle,
            { backgroundColor: theme.borderStrong },
          ]}
        />

        {/* Selected Stage Summary Header */}
        <View style={styles.sheetTopRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={styles.badgeLine}>
              <Text
                style={[styles.eyebrowText, { color: theme.accentPrimary }]}
              >
                {formattedDistance.toUpperCase()} · ~{activeMinutes} MIN TO STAGE
              </Text>
              {!showStageInfoCard && (
                <Pressable onPress={() => setShowStageInfoCard(true)}>
                  <Text
                    style={[
                      styles.reopenInfoLink,
                      { color: theme.accentPrimary },
                    ]}
                  >
                    Show Stage Card
                  </Text>
                </Pressable>
              )}
            </View>
            <Text
              style={[styles.stageMainTitle, { color: theme.textPrimary }]}
              numberOfLines={1}
            >
              {stage.name}
            </Text>
            <Text
              style={[styles.stageStreetSub, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              From {userCoords ? 'My GPS Location' : origin.name} →{' '}
              {stage.streetAddress}
            </Text>
          </View>

          <View
            style={[
              styles.routeNumberBadge,
              {
                backgroundColor: theme.badgeBg,
                borderColor: theme.accentPrimary,
              },
            ]}
          >
            <Text style={[styles.routeLabelMini, { color: theme.badgeSubtext }]}>
              ROUTE
            </Text>
            <Text style={[styles.routeNumberBig, { color: theme.badgeText }]}>
              {route.routeNumber}
            </Text>
          </View>
        </View>

        {/* Honest OSRM Routing Mode Notice + Retry Button */}
        <View
          style={[
            styles.osrmNoticeBox,
            {
              backgroundColor: theme.surfaceSecondary,
              borderColor: theme.borderSubtle,
            },
          ]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              style={[styles.osrmNoticeTitle, { color: theme.textPrimary }]}
            >
              {osrmRoute?.source === 'osrm-live'
                ? `OSRM Road Route (${formattedDistance}, ~${activeMinutes} min)`
                : `CBD Fallback Route (${formattedDistance}, ~${activeMinutes} min)`}
            </Text>
            <Text
              style={[styles.osrmNoticeBody, { color: theme.textSecondary }]}
            >
              {osrmRoute?.routingModeNotice ??
                'OSRM road routing (driving profile) — use pedestrian sidewalks when approaching the stage.'}
            </Text>
            {osrmRoute?.errorMessage ? (
              <Text
                style={[styles.osrmErrorHint, { color: theme.warningText }]}
              >
                {osrmRoute.errorMessage}
              </Text>
            ) : null}
          </View>

          <Pressable
            onPress={() => loadDirectionsToStage(true)}
            disabled={isLoadingOsrm}
            style={[
              styles.retryRouteBtn,
              {
                backgroundColor: theme.surfaceElevated,
                borderColor: theme.accentPrimary,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Calculate or retry OSRM directions to stage"
          >
            {isLoadingOsrm ? (
              <ActivityIndicator size="small" color={theme.accentPrimary} />
            ) : (
              <>
                <Feather
                  name="refresh-cw"
                  size={12}
                  color={theme.accentPrimary}
                />
                <Text
                  style={[
                    styles.retryRouteBtnText,
                    { color: theme.accentPrimary },
                  ]}
                >
                  Directions
                </Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Prompt if GPS is not active: allow enabling GPS or switching CBD starting point */}
        {locationStatus !== 'granted' && (
          <View
            style={[
              styles.fallbackOriginBox,
              {
                backgroundColor: theme.background,
                borderColor: theme.borderSubtle,
              },
            ]}
          >
            <View style={styles.fallbackOriginTop}>
              <Text
                style={[
                  styles.fallbackOriginTitle,
                  { color: theme.textSecondary },
                ]}
              >
                {locationStatus === 'denied' || locationStatus === 'disabled'
                  ? locationMessage
                  : 'GPS not enabled — routing from selected Nairobi CBD landmark:'}
              </Text>
              <Pressable
                onPress={handleFindMyLocation}
                style={[
                  styles.enableGpsInlineBtn,
                  { backgroundColor: theme.accentTint },
                ]}
              >
                <Feather
                  name="crosshair"
                  size={11}
                  color={theme.accentPrimary}
                />
                <Text
                  style={[
                    styles.enableGpsInlineText,
                    { color: theme.accentPrimary },
                  ]}
                >
                  Use GPS
                </Text>
              </Pressable>
            </View>

            {onSelectOriginId && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.landmarkFallbackRow}
              >
                {NAIROBI_CBD_ORIGINS.map((lm) => {
                  const isCurrent =
                    (selectedOriginId ?? origin.id) === lm.id;
                  return (
                    <Pressable
                      key={lm.id}
                      onPress={() => onSelectOriginId(lm.id)}
                      style={[
                        styles.landmarkFallbackChip,
                        {
                          backgroundColor: isCurrent
                            ? theme.accentPrimary
                            : theme.surfaceSecondary,
                          borderColor: isCurrent
                            ? theme.accentPrimary
                            : theme.borderSubtle,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.landmarkFallbackChipText,
                          {
                            color: isCurrent
                              ? theme.textOnAccent
                              : theme.textPrimary,
                          },
                        ]}
                      >
                        {lm.shortName}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}

        {/* Horizontal Uber-Style Route Selector Strip */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.uberOptionsStrip}
        >
          {allMatches.slice(0, 6).map((item) => {
            const selected = item.route.id === route.id;
            return (
              <Pressable
                key={item.route.id}
                onPress={() => onSelectMatch(item)}
                style={[
                  styles.uberOptionCard,
                  {
                    backgroundColor: selected
                      ? theme.accentTint
                      : theme.surfaceSecondary,
                    borderColor: selected
                      ? theme.accentPrimary
                      : theme.borderSubtle,
                  },
                ]}
              >
                <View style={styles.uberOptionTop}>
                  <Text
                    style={[
                      styles.uberOptionRoute,
                      { color: theme.accentPrimary },
                    ]}
                  >
                    RT {item.route.routeNumber}
                  </Text>
                  <Text
                    style={[
                      styles.uberOptionWalk,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {item.walking.estimatedMinutes}m
                  </Text>
                </View>
                <Text
                  style={[
                    styles.uberOptionDest,
                    { color: theme.textPrimary },
                  ]}
                  numberOfLines={1}
                >
                  {item.route.destinationName}
                </Text>
                <Text
                  style={[
                    styles.uberOptionFare,
                    { color: theme.textMuted },
                  ]}
                  numberOfLines={1}
                >
                  Board: {item.stage.code}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Expandable OSRM Turn-by-Turn Instructions, Audio Guide & Stage Bay Info */}
        <View style={styles.utilityRow}>
          <Pressable
            onPress={() => setShowStepsSheet((prev) => !prev)}
            style={[
              styles.utilityBtn,
              {
                backgroundColor: showStepsSheet
                  ? theme.accentTint
                  : theme.surfaceSecondary,
                borderColor: showStepsSheet
                  ? theme.accentPrimary
                  : theme.borderSubtle,
              },
            ]}
          >
            <Feather
              name="list"
              size={14}
              color={showStepsSheet ? theme.accentPrimary : theme.textPrimary}
            />
            <Text
              style={[
                styles.utilityBtnText,
                {
                  color: showStepsSheet
                    ? theme.accentPrimary
                    : theme.textPrimary,
                },
              ]}
            >
              {showStepsSheet
                ? 'Hide Steps'
                : `Route Steps (${activeSteps.length})`}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setShowVoiceTranscript((prev) => !prev)}
            style={[
              styles.utilityBtn,
              {
                backgroundColor: showVoiceTranscript
                  ? theme.accentTint
                  : theme.surfaceSecondary,
                borderColor: showVoiceTranscript
                  ? theme.accentPrimary
                  : theme.borderSubtle,
              },
            ]}
          >
            <Feather
              name="volume-2"
              size={14}
              color={
                showVoiceTranscript ? theme.accentPrimary : theme.textPrimary
              }
            />
            <Text
              style={[
                styles.utilityBtnText,
                {
                  color: showVoiceTranscript
                    ? theme.accentPrimary
                    : theme.textPrimary,
                },
              ]}
            >
              Voice Guide
            </Text>
          </Pressable>

          <Pressable
            onPress={onOpenStageDetails}
            style={[
              styles.utilityBtn,
              {
                backgroundColor: theme.surfaceSecondary,
                borderColor: theme.borderSubtle,
              },
            ]}
          >
            <Feather name="info" size={14} color={theme.textPrimary} />
            <Text
              style={[styles.utilityBtnText, { color: theme.textPrimary }]}
            >
              Stage Bay Info
            </Text>
          </Pressable>
        </View>

        {showVoiceTranscript && (
          <View
            style={[
              styles.voiceBox,
              {
                backgroundColor: theme.accentTint,
                borderColor: theme.accentBorder,
              },
            ]}
          >
            <Text style={[styles.voiceText, { color: theme.textPrimary }]}>
              {spokenScript}
            </Text>
          </View>
        )}

        {showStepsSheet && (
          <ScrollView
            style={styles.stepsList}
            contentContainerStyle={{ gap: 6 }}
            nestedScrollEnabled
          >
            {activeSteps.map((step) => (
              <View
                key={step.stepNumber}
                style={[
                  styles.stepRow,
                  {
                    backgroundColor: theme.background,
                    borderColor: theme.borderSubtle,
                  },
                ]}
              >
                <View
                  style={[
                    styles.stepNumCircle,
                    { backgroundColor: theme.accentPrimary },
                  ]}
                >
                  <Text
                    style={[
                      styles.stepNumText,
                      { color: theme.textOnAccent },
                    ]}
                  >
                    {step.stepNumber}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.stepInstrText,
                      { color: theme.textPrimary },
                    ]}
                  >
                    {step.instruction}
                  </Text>
                  <Text
                    style={[
                      styles.stepSubText,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {step.streetName} · {step.landmarkCue}
                  </Text>
                </View>
                <Text
                  style={[styles.stepDistText, { color: theme.accentPrimary }]}
                >
                  {step.distanceMeters}m
                </Text>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Primary Action CTAs: "Directions to Stage" (In-App OSRM) + "Open in Google Maps" */}
        <View style={styles.ctaButtonsRow}>
          <Pressable
            onPress={() => {
              setShowStepsSheet(true);
              loadDirectionsToStage(true);
            }}
            style={[
              styles.directionsInAppBtn,
              {
                backgroundColor: theme.accentPrimary,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Get OSRM directions to ${stage.name}`}
          >
            <Feather name="navigation" size={15} color={theme.textOnAccent} />
            <Text
              style={[
                styles.uberConfirmCtaText,
                { color: theme.textOnAccent },
              ]}
            >
              Directions to Stage
            </Text>
          </Pressable>

          <Pressable
            onPress={handleOpenGoogleMaps}
            style={[
              styles.googleMapsSecondaryBtn,
              {
                backgroundColor: theme.surfaceSecondary,
                borderColor: theme.borderStrong,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Open directions to ${stage.name} in Google Maps`}
          >
            <Feather name="external-link" size={14} color={theme.textPrimary} />
            <Text
              style={[
                styles.googleMapsSecondaryText,
                { color: theme.textPrimary },
              ]}
            >
              Google Maps
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 10,
  },
  mapViewport: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  mapViewportLarge: {
    height: 315,
  },
  mapViewportCompact: {
    height: 225,
  },
  osmTileGrid: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  osmTileImage: {
    position: 'absolute',
    width: '33.5%',
    height: '33.5%',
  },
  gridHorizontalNorth: {
    position: 'absolute',
    top: '26%',
    left: 0,
    right: 0,
    borderTopWidth: 1,
  },
  gridHorizontalMid: {
    position: 'absolute',
    top: '54%',
    left: 0,
    right: 0,
    borderTopWidth: 1.5,
  },
  gridVerticalMoi: {
    position: 'absolute',
    left: '56%',
    top: 0,
    bottom: 0,
    borderLeftWidth: 1.5,
  },
  gridVerticalTomMboya: {
    position: 'absolute',
    left: '74%',
    top: 0,
    bottom: 0,
    borderLeftWidth: 1.5,
  },
  streetLabelMoi: {
    position: 'absolute',
    left: '40%',
    top: '38%',
    fontFamily: MONO_FONT,
    fontSize: 8.5,
    letterSpacing: 0.7,
  },
  streetLabelTomMboya: {
    position: 'absolute',
    left: '75%',
    top: '28%',
    fontFamily: MONO_FONT,
    fontSize: 8.5,
    letterSpacing: 0.7,
  },
  floatingTopBar: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  roundBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  osrmStatusPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  osrmStatusText: {
    fontFamily: MONO_FONT,
    fontSize: 10.5,
    fontWeight: '800',
  },
  findMyLocationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  findMyLocationText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  attributionPill: {
    position: 'absolute',
    bottom: 8,
    left: 10,
    zIndex: 35,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  attributionText: {
    fontFamily: MONO_FONT,
    fontSize: 8.5,
    fontWeight: '700',
  },
  stylePresetBtn: {
    position: 'absolute',
    bottom: 8,
    right: 10,
    zIndex: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  stylePresetText: {
    fontFamily: MONO_FONT,
    fontSize: 9,
    fontWeight: '800',
  },
  zoomControlStack: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    zIndex: 35,
    gap: 6,
  },
  zoomBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  osrmRouteSegment: {
    position: 'absolute',
    height: 5,
    borderRadius: 2.5,
  },
  nativeOriginMarker: {
    alignItems: 'center',
  },
  nativeStageMarkerWrap: {
    alignItems: 'center',
  },
  originMarkerWrap: {
    position: 'absolute',
    alignItems: 'center',
    transform: [{ translateX: -12 }, { translateY: -12 }],
    zIndex: 22,
  },
  uberOriginCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uberOriginInnerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  uberCalloutPill: {
    marginTop: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
  },
  uberCalloutTitle: {
    fontSize: 10,
    fontWeight: '800',
  },
  uberCalloutSub: {
    fontFamily: MONO_FONT,
    fontSize: 8,
  },
  stageMarkerWrap: {
    position: 'absolute',
    alignItems: 'center',
    transform: [{ translateX: -14 }, { translateY: -14 }],
  },
  boardHereBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    marginBottom: 3,
  },
  boardHereBadgeText: {
    fontFamily: MONO_FONT,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  stagePulseRing: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1.5,
    top: 14,
  },
  uberDestSquare: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inactiveStageDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uberDestCallout: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  uberTimeBox: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uberTimeNum: {
    fontFamily: MONO_FONT,
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 12,
  },
  uberTimeUnit: {
    fontFamily: MONO_FONT,
    fontSize: 7.5,
    fontWeight: '800',
  },
  uberDestName: {
    fontSize: 10.5,
    fontWeight: '800',
    maxWidth: 120,
  },
  uberDestCoords: {
    fontFamily: MONO_FONT,
    fontSize: 8,
  },
  stageInfoCard: {
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 13,
    gap: 7,
  },
  stageInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stageInfoBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  boardAtPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  boardAtPillText: {
    fontFamily: MONO_FONT,
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  closeInfoCardBtn: {
    padding: 3,
  },
  stageInfoTitle: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  stageInfoMetaGrid: {
    gap: 4,
  },
  stageInfoMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stageInfoMetaText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  uberSheet: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    gap: 11,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
  },
  sheetTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  badgeLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  eyebrowText: {
    fontFamily: MONO_FONT,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  reopenInfoLink: {
    fontSize: 11,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  stageMainTitle: {
    fontSize: 18.5,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  stageStreetSub: {
    fontSize: 12,
  },
  routeNumberBadge: {
    minWidth: 58,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeLabelMini: {
    fontFamily: MONO_FONT,
    fontSize: 8.5,
    fontWeight: '700',
  },
  routeNumberBig: {
    fontFamily: MONO_FONT,
    fontSize: 19,
    fontWeight: '900',
  },
  osrmNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  osrmNoticeTitle: {
    fontSize: 12,
    fontWeight: '800',
  },
  osrmNoticeBody: {
    fontSize: 11,
    lineHeight: 15,
  },
  osrmErrorHint: {
    fontSize: 10.5,
    lineHeight: 14,
    marginTop: 2,
  },
  retryRouteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
  },
  retryRouteBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  fallbackOriginBox: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 7,
  },
  fallbackOriginTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  fallbackOriginTitle: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 15,
  },
  enableGpsInlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  enableGpsInlineText: {
    fontSize: 11,
    fontWeight: '800',
  },
  landmarkFallbackRow: {
    gap: 6,
  },
  landmarkFallbackChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  landmarkFallbackChipText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  uberOptionsStrip: {
    gap: 8,
    paddingVertical: 2,
  },
  uberOptionCard: {
    width: 138,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 2,
  },
  uberOptionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  uberOptionRoute: {
    fontFamily: MONO_FONT,
    fontSize: 11,
    fontWeight: '900',
  },
  uberOptionWalk: {
    fontFamily: MONO_FONT,
    fontSize: 10,
    fontWeight: '700',
  },
  uberOptionDest: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
  uberOptionFare: {
    fontSize: 11,
  },
  utilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  utilityBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 11,
    borderWidth: 1,
  },
  utilityBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  voiceBox: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  voiceText: {
    fontSize: 12,
    lineHeight: 17,
  },
  stepsList: {
    maxHeight: 165,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 11,
    borderWidth: 1,
  },
  stepNumCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    fontFamily: MONO_FONT,
    fontSize: 10.5,
    fontWeight: '800',
  },
  stepInstrText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  stepSubText: {
    fontSize: 11,
  },
  stepDistText: {
    fontFamily: MONO_FONT,
    fontSize: 11,
    fontWeight: '800',
  },
  ctaButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  directionsInAppBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 13,
    borderRadius: 14,
  },
  uberConfirmCtaText: {
    fontSize: 14.5,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  googleMapsSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
  },
  googleMapsSecondaryText: {
    fontSize: 13,
    fontWeight: '800',
  },
});
