import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Crosshair,
  RefreshCw,
} from 'lucide-react';
import {
  BoardingStage,
  fetchMultiModeRoute,
  getOpenFreeMapStyleUrl,
  getTransportModeMeta,
  MultiModeRouteResult,
  NAIROBI_DEMO_STAGES,
  OpenFreeMapStylePreset,
  OriginLandmark,
  STAGE_MAP_CONFIG,
  TRANSPORT_MODE_OPTIONS,
  TransportMode,
  WalkingRoute,
} from '@stage/shared';
import { WebTransportModeIcon } from './MobileWebMapScreen';
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
  const [transportMode, setTransportMode] = useState<TransportMode>('walking');
  const [routeResult, setRouteResult] = useState<MultiModeRouteResult | null>(
    null
  );
  const [loadingRoute, setLoadingRoute] = useState<boolean>(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [mapReady, setMapReady] = useState<boolean>(false);
  const [stylePreset, setStylePreset] =
    useState<OpenFreeMapStylePreset>('liberty');
  const [internalCollapsed, setInternalCollapsed] =
    useState<boolean>(collapsedInfo);

  useEffect(() => {
    setInternalCollapsed(collapsedInfo);
  }, [collapsedInfo]);

  // Sync transport mode with WalkingNavigationView on desktop web
  useEffect(() => {
    const onModeEvent = (evt: Event) => {
      const custom = evt as CustomEvent<{ mode?: TransportMode }>;
      if (custom.detail?.mode) {
        setTransportMode(custom.detail.mode);
      }
    };
    window.addEventListener('stage:transport-mode', onModeEvent);
    return () =>
      window.removeEventListener('stage:transport-mode', onModeEvent);
  }, []);

  const handleSelectMode = (mode: TransportMode) => {
    setTransportMode(mode);
    window.dispatchEvent(
      new CustomEvent('stage:transport-mode', { detail: { mode } })
    );
  };

  useEffect(() => {
    setMapReady(false);
  }, [
    stylePreset,
    selectedStage.id,
    origin.coordinates.lat,
    origin.coordinates.lng,
  ]);

  useEffect(() => {
    let cancelled = false;
    setRouteError(null);
    setLoadingRoute(true);

    fetchMultiModeRoute(
      origin.coordinates,
      selectedStage.coordinates,
      selectedStage.name,
      transportMode,
      { forceRefresh: retryCount > 0 }
    )
      .then((res) => {
        if (!cancelled) {
          setRouteResult(res);
          setLoadingRoute(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setRouteResult(null);
          const errMsg =
            err instanceof Error ? err.message : 'Route could not be loaded.';
          setRouteError(errMsg);
          setLoadingRoute(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    origin.coordinates,
    selectedStage.id,
    selectedStage.coordinates,
    selectedStage.name,
    transportMode,
    retryCount,
  ]);

  const activeRoute = routeResult?.quickestRoute ?? null;
  const modeMeta = getTransportModeMeta(transportMode);
  const activeMinutes = activeRoute?.estimatedMinutes ?? null;
  const activeDistance =
    activeRoute?.totalDistanceMeters ?? walking.totalDistanceMeters;
  const formattedDistance =
    activeDistance >= 1000
      ? `${(activeDistance / 1000).toFixed(1)} km`
      : `${Math.round(activeDistance)} m`;

  const applyToMap = useCallback((payload: StageMapApplyMessage) => {
    mapCtrlRef.current?.apply(payload);
  }, []);

  const styleUrl = useMemo(
    () => getOpenFreeMapStyleUrl(stylePreset),
    [stylePreset]
  );
  const onSelectStageRef = useRef(onSelectStageById);
  onSelectStageRef.current = onSelectStageById;

  const latestSyncRef = useRef({
    activeRoute,
    activeMinutes,
    formattedDistance,
    modeShort: modeMeta.shortLabel,
    originCoords: origin.coordinates,
    originLabel: isLiveGpsActive ? 'My GPS' : origin.shortName,
  });
  latestSyncRef.current = {
    activeRoute,
    activeMinutes,
    formattedDistance,
    modeShort: modeMeta.shortLabel,
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
        cur.activeRoute && cur.activeRoute.polyline.length >= 2
          ? cur.activeRoute.polyline
          : [],
      initialMinutes: cur.activeMinutes,
      initialDistanceLabel: cur.activeRoute ? cur.formattedDistance : '',
      initialBottomPad: 110,
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
            latest.activeRoute && latest.activeRoute.polyline.length >= 2
              ? latest.activeRoute.polyline.map((c) => [c.lng, c.lat])
              : [],
          modeShort: latest.modeShort,
          minutes: latest.activeMinutes,
          dist: latest.activeRoute ? latest.formattedDistance : '',
          bottomPad: 110,
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
        activeRoute && activeRoute.polyline.length >= 2
          ? activeRoute.polyline.map((c) => [c.lng, c.lat])
          : [],
      modeShort: modeMeta.shortLabel,
      minutes: activeMinutes,
      dist: activeRoute ? formattedDistance : '',
      bottomPad: 110,
      fit: true,
    });
  }, [
    mapReady,
    activeRoute,
    modeMeta.shortLabel,
    activeMinutes,
    formattedDistance,
    applyToMap,
  ]);

  const toggleDarkStyle = () => {
    setStylePreset((prev) => (prev === 'dark' ? 'liberty' : 'dark'));
  };

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
      {/* Simplified Telemetry & Icon-Only Mode Bar */}
      {!internalCollapsed && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'var(--stage-surface-elevated)',
            borderBottom: '1px solid var(--stage-border-subtle)',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
                    onClick={() => handleSelectMode(option.id)}
                  >
                    <WebTransportModeIcon mode={option.id} size={17} />
                  </button>
                );
              })}
            </div>

            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11.5,
                fontWeight: 800,
              }}
            >
              {loadingRoute
                ? 'CALCULATING ROUTE…'
                : activeRoute
                  ? `${activeMinutes} MIN · ${formattedDistance}`
                  : routeError ?? 'ROUTE UNAVAILABLE'}
            </span>

            {routeError && !loadingRoute && (
              <button
                type="button"
                onClick={() => setRetryCount((c) => c + 1)}
                className="origin-pill"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <RefreshCw size={12} />
                Retry
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={toggleDarkStyle}
              className="origin-pill"
              aria-label="Toggle map style"
              title="Toggle map style"
            >
              {stylePreset === 'dark' ? 'Dark' : 'Map'}
            </button>

            {onRequestLiveGps && (
              <button
                type="button"
                onClick={onRequestLiveGps}
                className="origin-pill"
                aria-label="Center on my GPS location"
                title="Center on my GPS location"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '5px 8px',
                  background: isLiveGpsActive
                    ? '#00B84C'
                    : 'var(--stage-surface-secondary)',
                  color: isLiveGpsActive
                    ? '#FFFFFF'
                    : 'var(--stage-ink-primary)',
                }}
              >
                <Crosshair size={13} />
              </button>
            )}

            <button
              type="button"
              onClick={toggleInfo}
              aria-label="Collapse map info panel"
              title="Collapse map info panel"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                color: 'var(--stage-ink-primary)',
              }}
            >
              <ChevronUp size={16} />
            </button>
          </div>
        </div>
      )}

      {internalCollapsed && (
        <button
          type="button"
          onClick={toggleInfo}
          aria-label="Expand map info panel"
          title="Expand map info panel"
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: 'rgba(13, 19, 16, 0.85)',
            color: '#FFFFFF',
            border: '1px solid var(--stage-border-subtle)',
            borderRadius: 8,
            padding: '4px 6px',
            cursor: 'pointer',
            zIndex: 30,
          }}
        >
          <ChevronDown size={16} />
        </button>
      )}

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
