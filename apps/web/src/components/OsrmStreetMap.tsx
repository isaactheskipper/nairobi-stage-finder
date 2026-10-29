import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Crosshair,
  ExternalLink,
  Layers,
  RefreshCw,
} from 'lucide-react';
import {
  BoardingStage,
  buildGoogleMapsWalkingUrl,
  fetchOsrmWalkingRoute,
  getOpenFreeMapStyleUrl,
  NAIROBI_DEMO_STAGES,
  OpenFreeMapStylePreset,
  OriginLandmark,
  OsrmResolvedWalkRoute,
  STAGE_MAP_CONFIG,
  WalkingRoute,
} from '@stage/shared';
import {
  mountStageMapLibre,
  StageMapApplyMessage,
  StageMapController,
} from '../utils/webMapLibre';

interface OsrmStreetMapProps {
  origin: OriginLandmark;
  selectedStage: BoardingStage;
  walking: WalkingRoute;
  onSelectStageById?: (stageId: string) => void;
  onRequestLiveGps?: () => void;
  isLiveGpsActive?: boolean;
  /** When true, hide the top information panel (telemetry bar) */
  collapsedInfo?: boolean;
}

export const OsrmStreetMap: React.FC<OsrmStreetMapProps> = ({
  origin,
  selectedStage,
  walking,
  onSelectStageById,
  onRequestLiveGps,
  isLiveGpsActive = false,
  collapsedInfo = false,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapCtrlRef = useRef<StageMapController | null>(null);
  const [osrmRoute, setOsrmRoute] = useState<OsrmResolvedWalkRoute | null>(null);
  const [loadingOsrm, setLoadingOsrm] = useState<boolean>(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [mapReady, setMapReady] = useState<boolean>(false);
  const [stylePreset, setStylePreset] = useState<OpenFreeMapStylePreset>('liberty');
  const [internalCollapsed, setInternalCollapsed] = useState<boolean>(collapsedInfo);

  // Sync with parent prop
  useEffect(() => {
    setInternalCollapsed(collapsedInfo);
  }, [collapsedInfo]);

  useEffect(() => {
    setMapReady(false);
  }, [stylePreset, selectedStage.id, origin.coordinates.lat, origin.coordinates.lng]);

  // Fetch OSRM route (clear stale route first so a stale line is never left visible)
  useEffect(() => {
    let cancelled = false;
    setOsrmRoute(null);
    setRouteError(null);
    setLoadingOsrm(true);
    if (import.meta.env.DEV) {
      console.info('[STAGE Map] OsrmStreetMap selected stage & origin:', {
        stageId: selectedStage.id,
        stageName: selectedStage.name,
        stageCoords: selectedStage.coordinates,
        originSource: isLiveGpsActive ? 'GPS' : 'selected starting point',
        originName: origin.shortName,
        originCoords: origin.coordinates,
      });
    }
    fetchOsrmWalkingRoute(
      origin.coordinates,
      selectedStage.coordinates,
      selectedStage.name,
      walking.steps,
      { forceRefresh: retryCount > 0 }
    )
      .then((res) => {
        if (!cancelled) {
          setOsrmRoute(res);
          setLoadingOsrm(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setOsrmRoute(null);
          const errMsg =
            err instanceof Error
              ? err.message
              : 'Walking route could not be loaded.';
          if (import.meta.env.DEV) {
            console.warn('[STAGE Map] OsrmStreetMap routing exception:', {
              stageId: selectedStage.id,
              error: errMsg,
            });
          }
          setRouteError(errMsg);
          setLoadingOsrm(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    origin.coordinates.lat,
    origin.coordinates.lng,
    selectedStage.id,
    selectedStage.coordinates.lat,
    selectedStage.coordinates.lng,
    selectedStage.name,
    walking.steps,
    retryCount,
    isLiveGpsActive,
    origin.shortName,
  ]);

  const activeMinutes = osrmRoute?.estimatedMinutes ?? null;
  const activeDistance = osrmRoute?.totalDistanceMeters ?? walking.totalDistanceMeters;
  const formattedDistance =
    activeDistance >= 1000
      ? `${(activeDistance / 1000).toFixed(2)} km`
      : `${Math.round(activeDistance)} m`;

  const applyToMap = useCallback((payload: StageMapApplyMessage) => {
    mapCtrlRef.current?.apply(payload);
  }, []);

  const styleUrl = useMemo(() => getOpenFreeMapStyleUrl(stylePreset), [stylePreset]);
  const onSelectStageRef = useRef(onSelectStageById);
  onSelectStageRef.current = onSelectStageById;

  const latestSyncRef = useRef({
    osrmRoute,
    activeMinutes,
    formattedDistance,
    originCoords: origin.coordinates,
    originLabel: isLiveGpsActive ? 'My GPS' : origin.shortName,
  });
  latestSyncRef.current = {
    osrmRoute,
    activeMinutes,
    formattedDistance,
    originCoords: origin.coordinates,
    originLabel: isLiveGpsActive ? 'My GPS' : origin.shortName,
  };

  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;

    const cur = latestSyncRef.current;
    const ctrl = mountStageMapLibre({
      container: el,
      styleUrl,
      isDark: stylePreset === 'dark',
      originCoords: cur.originCoords,
      originLabel: cur.originLabel,
      selectedStage,
      allStages: NAIROBI_DEMO_STAGES,
      routeNumber: 'CBD',
      initialPolyline:
        cur.osrmRoute && cur.osrmRoute.polyline.length >= 2
          ? cur.osrmRoute.polyline
          : [],
      initialMinutes: cur.activeMinutes,
      initialDistanceLabel: cur.osrmRoute ? cur.formattedDistance : '',
      initialBottomPad: 130,
      onMapReady: () => {
        setMapReady(true);
        const latest = latestSyncRef.current;
        ctrl.apply({
          type: 'user',
          user: {
            lat: latest.originCoords.lat,
            lng: latest.originCoords.lng,
            label: latest.originLabel,
          },
          fit: false,
        });
        ctrl.apply({
          type: 'route',
          line:
            latest.osrmRoute && latest.osrmRoute.polyline.length >= 2
              ? latest.osrmRoute.polyline.map((c) => [c.lng, c.lat])
              : [],
          minutes: latest.activeMinutes,
          dist: latest.osrmRoute ? latest.formattedDistance : '',
          bottomPad: 130,
          fit: true,
        });
      },
      onSelectStageById: (stageId) => {
        onSelectStageRef.current?.(stageId);
      },
    });

    mapCtrlRef.current = ctrl;

    return () => {
      ctrl.destroy();
      if (mapCtrlRef.current === ctrl) {
        mapCtrlRef.current = null;
      }
    };
  }, [
    styleUrl,
    stylePreset,
    selectedStage,
    origin.coordinates.lat,
    origin.coordinates.lng,
    origin.shortName,
    isLiveGpsActive,
  ]);

  useEffect(() => {
    if (!mapReady) return;
    applyToMap({
      type: 'route',
      line:
        osrmRoute && osrmRoute.polyline.length >= 2
          ? osrmRoute.polyline.map((c) => [c.lng, c.lat])
          : [],
      minutes: activeMinutes,
      dist: osrmRoute ? formattedDistance : '',
      bottomPad: 130,
      fit: true,
    });
  }, [mapReady, osrmRoute, activeMinutes, formattedDistance, applyToMap]);

  const cyclePreset = () => {
    setStylePreset((prev) =>
      prev === 'liberty' ? 'positron' : prev === 'positron' ? 'dark' : 'liberty'
    );
  };

  const googleMapsUrl = buildGoogleMapsWalkingUrl(
    origin.coordinates,
    selectedStage.coordinates,
    selectedStage.name
  );

  const toggleInfo = () => setInternalCollapsed((c) => !c);

  return (
    <div
      className="spatial-card"
      style={{
        overflow: 'hidden',
        position: 'relative',
        borderRadius: 20,
        border: '1px solid var(--stage-border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* Telemetry bar – hidden when collapsed */}
      {!internalCollapsed && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            background: 'var(--stage-surface-elevated)',
            borderBottom: '1px solid var(--stage-border-subtle)',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: routeError ? '#F5A623' : '#2BD985',
                display: 'inline-block',
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11.5,
                fontWeight: 800,
              }}
            >
              {loadingOsrm
                ? 'ROUTING WALKING PATH VIA OSRM…'
                : osrmRoute
                ? `OPENFREEMAP + OSRM WALKING ROUTE · ${activeMinutes} MIN (${formattedDistance})`
                : routeError ?? 'WALKING ROUTE UNAVAILABLE'}
            </span>
            {routeError && !loadingOsrm && (
              <button
                type="button"
                onClick={() => setRetryCount((c) => c + 1)}
                className="origin-pill"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <RefreshCw size={12} />
                Retry
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={cyclePreset}
              className="origin-pill"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <Layers size={13} />
              Style: {stylePreset}
            </button>

            {onRequestLiveGps && (
              <button
                type="button"
                onClick={onRequestLiveGps}
                className="origin-pill"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: isLiveGpsActive
                    ? '#00B84C'
                    : 'var(--stage-surface-secondary)',
                  color: isLiveGpsActive ? '#FFFFFF' : 'var(--stage-ink-primary)',
                }}
              >
                <Crosshair size={13} />
                {isLiveGpsActive ? 'GPS Active' : 'Use My GPS'}
              </button>
            )}
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="origin-pill"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                textDecoration: 'none',
              }}
            >
              Google Maps
              <ExternalLink size={12} />
            </a>
            {/* Collapse toggle */}
            <button
              type="button"
              onClick={toggleInfo}
              aria-label="Collapse map info panel"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
              }}
            >
              <ChevronUp size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Expand button when collapsed */}
      {internalCollapsed && (
        <button
          type="button"
          onClick={toggleInfo}
          aria-label="Expand map info panel"
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: 'rgba(255,255,255,0.8)',
            border: '1px solid var(--stage-border-subtle)',
            borderRadius: 4,
            padding: '2px 4px',
            cursor: 'pointer',
            zIndex: 30,
          }}
        >
          <ChevronDown size={16} />
        </button>
      )}

      {/* Map iframe – flexGrow ensures it fills the remaining space */}
      <div
        style={{
          position: 'relative',
          flexGrow: 1,
          background: stylePreset === 'dark' ? '#0B0F0D' : '#E5ECF0',
          overflow: 'hidden',
        }}
      >
        <div
          ref={mapContainerRef}
          key={`web-ofm-${stylePreset}-${selectedStage.id}-${origin.coordinates.lat.toFixed(4)}`}
          aria-label={`OpenFreeMap Nairobi stage map for ${selectedStage.name}`}
          className="m-map-container"
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
          }}
        />

        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: 10,
            zIndex: 25,
            background:
              stylePreset === 'dark'
                ? 'rgba(13, 19, 16, 0.88)'
                : 'rgba(255, 255, 255, 0.92)',
            color: stylePreset === 'dark' ? '#E2E8E4' : '#1E2622',
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: 6,
            border: '1px solid rgba(128,128,128,0.25)',
            pointerEvents: 'none',
          }}
        >
          {STAGE_MAP_CONFIG.attributionText}
        </div>
      </div>
    </div>
  );
};
