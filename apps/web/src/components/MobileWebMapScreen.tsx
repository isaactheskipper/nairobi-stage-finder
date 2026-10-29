import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Compass,
  Crosshair,
  Footprints,
  Loader2,
  MapPin,
  Maximize2,
  Minimize2,
  Minus,
  Navigation,
  Plus,
  RefreshCw,
  RotateCcw,
  Shrink,
  User,
  Volume1,
  Volume2,
  VolumeX,
  WifiOff,
} from 'lucide-react';
import {
  buildGoogleMapsWalkingUrl,
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

/** Re-route only after the user has moved this far from the last routed origin (matches Android). */
const REROUTE_METERS = 40;
const PEEK_HEIGHT = 108;

function formatWalkDistance(meters: number): string {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)} km`
    : `${Math.round(meters)} m`;
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
  const sheetRef = useRef<HTMLDivElement>(null);

  const [isExpanded, setIsExpanded] = useState(true);
  const isExpandedRef = useRef(isExpanded);
  isExpandedRef.current = isExpanded;

  const [dragOffsetY, setDragOffsetY] = useState(0);
  const dragStateRef = useRef<{
    active: boolean;
    startY: number;
    startX: number;
    moved: boolean;
  }>({
    active: false,
    startY: 0,
    startX: 0,
    moved: false,
  });

  const [osrm, setOsrm] = useState<OsrmResolvedWalkRoute | null>(null);
  const [routing, setRouting] = useState(true);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [useDark, setUseDark] = useState(isDarkTheme);
  const [showSteps, setShowSteps] = useState(false);
  const [manualStepIndex, setManualStepIndex] = useState<number | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapKey, setMapKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [voiceEnabled, setVoiceEnabled] = useState(true);

  useEffect(() => {
    setUseDark(isDarkTheme);
  }, [isDarkTheme]);

  // Reset mapReady & manual step index whenever the map iframe key dependencies change
  useEffect(() => {
    setMapReady(false);
    setMapFailed(false);
    setManualStepIndex(null);
  }, [useDark, stage.id, mapKey]);

  const {
    speechSupported,
    isSpeaking,
    latestInstruction,
    activeStepNumber,
    lastAnnouncementType,
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

  const stageShort = useMemo(
    () => stage.name.replace(/\s*\((?:Unverified\s+)?Demo\)/gi, '').trim(),
    [stage.name]
  );

  const displayInstruction = useMemo(() => {
    if (!latestInstruction) return null;
    return cleanSpokenInstruction(
      latestInstruction,
      `Walk toward ${stageShort}.`
    );
  }, [latestInstruction, stageShort]);

  // Avoid duplicating instructions already visible in the expanded direction card (matches Android)
  const isInstructionDuplicatedOnCard = useMemo(() => {
    if (!displayInstruction || !isExpanded) return false;
    if (
      osrm &&
      osrm.steps.length > 0 &&
      (lastAnnouncementType === 'initial' || lastAnnouncementType === 'turn')
    ) {
      return true;
    }
    if (
      (!osrm || osrm.steps.length === 0) &&
      lastAnnouncementType === 'initial'
    ) {
      return true;
    }
    return false;
  }, [displayInstruction, isExpanded, osrm, lastAnnouncementType]);

  const showVoiceBanner = Boolean(
    voiceEnabled && displayInstruction && !isInstructionDuplicatedOnCard
  );

  // Start point is either the live GPS fix or the chosen CBD landmark
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
    if (import.meta.env.DEV) {
      console.info('[STAGE Map] Selected stage & origin:', {
        destinationName: route.destinationName,
        routeNumber: route.routeNumber,
        stageId: stage.id,
        stageName: stage.name,
        stageCoords: stage.coordinates,
        originSource: usingGps ? 'GPS' : 'selected starting point',
        originName: startLabel,
        originCoords: startCoords,
      });
    }

    if (!startCoords || !isValidCoordinates(stage.coordinates)) {
      setOsrm(null);
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
    if (osrm && sameStage && moved < REROUTE_METERS && retryTick === 0) {
      return; // GPS jitter: keep the current route
    }

    // Clear stale route when stage or origin changes so a stale line is never left on the map
    if (!sameStage || moved >= REROUTE_METERS) {
      setOsrm(null);
      setManualStepIndex(null);
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
        const errMsg =
          e instanceof Error ? e.message : 'Walking route could not be loaded.';
        if (import.meta.env.DEV) {
          console.warn('[STAGE Map] Routing exception:', {
            stageId: stage.id,
            error: errMsg,
          });
        }
        setRouteError(errMsg);
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
  const bottomPad = isExpanded ? 250 : 126;

  // ---- Direct-DOM MapLibre instance: built once per stage/style; updates are injected ----
  const initialRef = useRef({
    start: startCoords,
    label: startLabel,
    polyline: osrm?.polyline ?? [],
    minutes,
    distLabel,
    bottomPad,
  });
  initialRef.current = {
    start: startCoords,
    label: startLabel,
    polyline: osrm?.polyline ?? [],
    minutes,
    distLabel,
    bottomPad,
  };

  const latestMapSyncRef = useRef({
    osrm,
    minutes,
    distLabel,
    startCoords,
    startLabel,
    bottomPad,
  });
  latestMapSyncRef.current = {
    osrm,
    minutes,
    distLabel,
    startCoords,
    startLabel,
    bottomPad,
  };

  const onSelectStageRef = useRef(onSelectStageById);
  onSelectStageRef.current = onSelectStageById;

  const sendMapCmd = useCallback(
    (cmd: 'apply' | 'zoomIn' | 'zoomOut', payload?: StageMapApplyMessage) => {
      const ctrl = mapCtrlRef.current;
      if (!ctrl) return;
      if (cmd === 'apply' && payload) {
        ctrl.apply(payload);
      } else if (cmd === 'zoomIn') {
        ctrl.zoomIn();
      } else if (cmd === 'zoomOut') {
        ctrl.zoomOut();
      }
    },
    []
  );

  const apply = useCallback(
    (msg: StageMapApplyMessage) => {
      sendMapCmd('apply', msg);
    },
    [sendMapCmd]
  );

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
        const cur = latestMapSyncRef.current;
        ctrl.apply({
          type: 'user',
          user: cur.startCoords
            ? {
                lat: cur.startCoords.lat,
                lng: cur.startCoords.lng,
                label: cur.startLabel,
              }
            : null,
          fit: false,
        });
        ctrl.apply({
          type: 'route',
          line: cur.osrm
            ? cur.osrm.polyline.map((c) => [c.lng, c.lat])
            : [],
          minutes: cur.minutes,
          dist: cur.distLabel,
          bottomPad: cur.bottomPad,
          fit: true,
        });
      },
      onMapError: () => {
        setMapFailed(true);
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
  }, [useDark, stage, route.routeNumber, mapKey, mapFailed]);

  useEffect(() => {
    if (!mapReady) return;
    apply({
      type: 'route',
      line: osrm ? osrm.polyline.map((c) => [c.lng, c.lat]) : [],
      minutes,
      dist: distLabel,
      bottomPad,
      fit: true,
    });
  }, [mapReady, osrm, minutes, distLabel, bottomPad, apply]);

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

  // Active turn-by-turn step resolution (manual selection or live GPS progress)
  const steps = osrm?.steps ?? [];
  const resolvedStepIndex = useMemo(() => {
    if (steps.length === 0) return 0;
    if (
      manualStepIndex !== null &&
      manualStepIndex >= 0 &&
      manualStepIndex < steps.length
    ) {
      return manualStepIndex;
    }
    if (activeStepNumber !== null) {
      const idx = steps.findIndex((s) => s.stepNumber === activeStepNumber);
      if (idx !== -1) return idx;
    }
    return 0;
  }, [steps, manualStepIndex, activeStepNumber]);

  const currentStep = steps[resolvedStepIndex] ?? null;

  // Fullscreen listener & toggle (with fallback to collapsing the bottom sheet on iOS Safari)
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleToggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (el && typeof el.requestFullscreen === 'function') {
      try {
        if (!document.fullscreenElement) {
          await el.requestFullscreen();
          return;
        } else if (typeof document.exitFullscreen === 'function') {
          await document.exitFullscreen();
          return;
        }
      } catch {
        // Fall through to sheet collapse/expand toggle on browsers that block element fullscreen (e.g. iPhone Safari)
      }
    }
    setIsExpanded((prev) => !prev);
  }, []);

  // Touch drag handlers for the collapsible bottom sheet
  const handleSheetTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length !== 1) return;
      dragStateRef.current = {
        active: true,
        startY: e.touches[0].clientY,
        startX: e.touches[0].clientX,
        moved: false,
      };
    },
    []
  );

  const handleSheetTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const state = dragStateRef.current;
      if (!state.active || e.touches.length !== 1) return;
      const dy = e.touches[0].clientY - state.startY;
      const dx = e.touches[0].clientX - state.startX;
      if (Math.abs(dy) > 6 && Math.abs(dy) > Math.abs(dx)) {
        state.moved = true;
        const sheetHeight = sheetRef.current?.offsetHeight ?? 360;
        const maxCollapse = Math.max(0, sheetHeight - PEEK_HEIGHT);
        const base = isExpandedRef.current ? 0 : maxCollapse;
        const clamped = Math.max(0, Math.min(maxCollapse, base + dy));
        setDragOffsetY(
          isExpandedRef.current ? clamped : clamped - maxCollapse
        );
      }
    },
    []
  );

  const handleSheetTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const state = dragStateRef.current;
      dragStateRef.current.active = false;
      setDragOffsetY(0);
      if (!state.moved || e.changedTouches.length !== 1) return;
      const dy = e.changedTouches[0].clientY - state.startY;
      if (dy > 42) {
        setIsExpanded(false);
      } else if (dy < -42) {
        setIsExpanded(true);
      }
    },
    []
  );

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const locationProblem =
    locationStatus === 'denied' ||
    locationStatus === 'disabled' ||
    locationStatus === 'error';

  const googleMapsUrl = buildGoogleMapsWalkingUrl(
    startCoords ?? origin.coordinates,
    stage.coordinates,
    stage.name
  );

  const numLen = route.routeNumber.length;
  const badgeFontSize = Math.round(
    44 * (numLen > 3 ? 0.3 : numLen > 2 ? 0.36 : 0.46)
  );

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
            aria-label={`Walking map to ${stage.name}`}
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

      {/* Top Overlay: Back button + Stage Summary Pill + Map/Dark switcher + Voice Banner */}
      <div className="m-map-top-overlay">
        <div className="m-map-top-row">
          <button
            type="button"
            className="m-map-fab"
            onClick={onBack}
            aria-label="Back to Route Details"
          >
            <ArrowLeft size={20} />
          </button>

          <button
            type="button"
            className="m-map-header-pill"
            onClick={() => apply({ type: 'fit', bottomPad })}
            title="Fit route on map"
          >
            <span className="m-map-header-pill__route">#{route.routeNumber}</span>
            <span className="m-map-header-pill__text">
              <span className="m-map-header-pill__stage">{stageShort}</span>
              <span className="m-map-header-pill__dest">
                → {route.destinationName}
              </span>
            </span>
          </button>

          <div
            className="m-map-seg m-map-seg--compact"
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

        {showVoiceBanner && displayInstruction && (
          <div
            className="m-voice-banner"
            role="region"
            aria-label={`Voice instruction: ${displayInstruction}`}
          >
            <div className="m-voice-banner__icon">
              {isSpeaking ? (
                <Volume2 size={14} color="#FFFFFF" />
              ) : (
                <Navigation size={14} color="#FFFFFF" />
              )}
            </div>
            <div className="m-voice-banner__text">{displayInstruction}</div>
            {speechSupported && (
              <button
                type="button"
                className="m-voice-banner__btn"
                onClick={replayLastInstruction}
                aria-label="Replay voice instruction"
                title="Replay voice instruction"
              >
                <RotateCcw size={14} />
              </button>
            )}
            <button
              type="button"
              className="m-voice-banner__btn"
              onClick={handleToggleVoice}
              aria-label="Mute voice guidance"
              title="Mute voice guidance"
            >
              <VolumeX size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Right-side Floating Map Action Controls (auto-positioned above the bottom sheet) */}
      <div
        className={`m-map-side-fabs ${
          isExpanded
            ? 'm-map-side-fabs--sheet-open'
            : 'm-map-side-fabs--sheet-collapsed'
        }`}
      >
        <button
          type="button"
          className="m-map-fab"
          aria-label="Fit entire route in view"
          title="Fit entire route in view"
          onClick={() => apply({ type: 'fit', bottomPad })}
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

        <button
          type="button"
          className="m-map-fab"
          aria-label={
            voiceEnabled ? 'Mute voice guidance' : 'Enable voice guidance'
          }
          title={voiceEnabled ? 'Mute voice guidance' : 'Enable voice guidance'}
          onClick={handleToggleVoice}
        >
          {voiceEnabled ? (
            isSpeaking ? (
              <Volume2 size={19} color="var(--stage-accent-electric)" />
            ) : (
              <Volume1 size={19} color="var(--stage-accent-electric)" />
            )
          ) : (
            <VolumeX size={19} color="var(--stage-ink-muted)" />
          )}
        </button>

        <button
          type="button"
          className="m-map-fab"
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen map'}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen map'}
          onClick={handleToggleFullscreen}
        >
          {isFullscreen || !isExpanded ? (
            <Minimize2 size={18} />
          ) : (
            <Shrink size={18} />
          )}
        </button>

        <button
          type="button"
          className="m-map-fab"
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => sendMapCmd('zoomIn')}
        >
          <Plus size={20} />
        </button>

        <button
          type="button"
          className="m-map-fab"
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => sendMapCmd('zoomOut')}
        >
          <Minus size={20} />
        </button>
      </div>

      {/* Collapsible / Draggable Frosted-Glass Directions Bottom Sheet */}
      <div
        ref={sheetRef}
        className={`m-map-sheet ${
          isExpanded ? 'm-map-sheet--expanded' : 'm-map-sheet--collapsed'
        }`}
        style={
          dragOffsetY !== 0
            ? { transform: `translateY(${dragOffsetY}px)`, transition: 'none' }
            : undefined
        }
      >
        {/* Drag Handle & Peek Header */}
        <div
          className="m-map-sheet__drag-zone"
          onTouchStart={handleSheetTouchStart}
          onTouchMove={handleSheetTouchMove}
          onTouchEnd={handleSheetTouchEnd}
        >
          <button
            type="button"
            className="m-map-sheet__grab-hit"
            onClick={toggleExpand}
            aria-label={
              isExpanded ? 'Collapse directions' : 'Expand directions'
            }
          >
            <span className="m-map-sheet__grab" />
          </button>

          <button
            type="button"
            className="m-map-sheet__peek"
            onClick={toggleExpand}
            aria-label={
              isExpanded ? 'Collapse directions' : 'Expand directions'
            }
          >
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
            <div className="m-map-sheet__peek-body">
              <div className="m-map-sheet__dest">{route.destinationName}</div>
              <div className="m-map-sheet__stage">
                Board at <strong>{stageShort}</strong> · {stage.streetAddress}
              </div>
            </div>
            <div className="m-map-sheet__peek-badge">
              <Footprints size={13} />
              <span>{minutes ? `${minutes} min` : distLabel || 'Walk'}</span>
            </div>
          </button>
        </div>

        {/* Sheet Body (hidden when collapsed to peek height) */}
        {isExpanded && (
          <div className="m-map-sheet__body">
            {/* Origin selector + Route Overview metrics bar */}
            <div className="m-map-sheet__overview-row">
              <button
                type="button"
                className="m-map-sheet__from-row"
                onClick={onChangeOrigin}
                aria-label="Change starting point"
              >
                {usingGps ? (
                  <Crosshair size={13} color="var(--stage-accent-electric)" />
                ) : (
                  <MapPin size={13} color="var(--stage-accent-electric)" />
                )}
                <span className="m-map-sheet__from-text">
                  From:{' '}
                  <strong>
                    {usingGps ? 'Your live GPS' : origin.name}
                  </strong>
                </span>
                <span className="m-map-sheet__from-change">Change</span>
              </button>

              {routing ? (
                <div className="m-map-sheet__status">
                  <Loader2
                    size={15}
                    color="var(--stage-accent-electric)"
                    className="m-spin"
                  />
                  <span>Calculating walking route on Nairobi streets…</span>
                </div>
              ) : osrm ? (
                <div className="m-map-sheet__metrics">
                  <div className="m-map-metric-pill m-map-metric-pill--accent">
                    <User size={13} />
                    <span>{minutes} min walk</span>
                  </div>
                  <div className="m-map-metric-pill">
                    <span>{distLabel}</span>
                  </div>
                  <div className="m-map-metric-pill">
                    <span>{steps.length} steps</span>
                  </div>
                </div>
              ) : (
                <div className="m-map-sheet__error">
                  <div>
                    {routeError ?? 'Walking route unavailable.'} No fake line is
                    drawn until a real walking route is found.
                  </div>
                  <button
                    type="button"
                    className="m-map-sheet__retry-inline"
                    onClick={retry}
                  >
                    <RefreshCw size={13} />
                    Retry route
                  </button>
                </div>
              )}
            </div>

            {/* Active / Next Turn Callout Card with Step Progress */}
            {osrm && currentStep && (
              <div className="m-map-next-turn">
                <div className="m-map-next-turn__top">
                  <span className="m-map-next-turn__badge">
                    <Navigation size={12} />
                    Step {resolvedStepIndex + 1} of {steps.length}
                  </span>
                  <span className="m-map-next-turn__dist">
                    {formatWalkDistance(currentStep.distanceMeters)}
                    {currentStep.compassBearing
                      ? ` · ${currentStep.compassBearing}`
                      : ''}
                  </span>
                  <div className="m-map-next-turn__controls">
                    <button
                      type="button"
                      className="m-map-step-nav-btn"
                      disabled={resolvedStepIndex <= 0}
                      onClick={() => {
                        const prevIdx = Math.max(0, resolvedStepIndex - 1);
                        setManualStepIndex(prevIdx);
                        if (steps[prevIdx]) speakStepInstruction(steps[prevIdx]);
                      }}
                      aria-label="Previous step"
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <button
                      type="button"
                      className="m-map-step-nav-btn"
                      disabled={resolvedStepIndex >= steps.length - 1}
                      onClick={() => {
                        const nextIdx = Math.min(
                          steps.length - 1,
                          resolvedStepIndex + 1
                        );
                        setManualStepIndex(nextIdx);
                        if (steps[nextIdx]) speakStepInstruction(steps[nextIdx]);
                      }}
                      aria-label="Next step"
                    >
                      <ChevronRight size={15} />
                    </button>
                    {speechSupported && (
                      <button
                        type="button"
                        className="m-map-step-nav-btn"
                        onClick={() => speakStepInstruction(currentStep)}
                        aria-label="Read current step aloud"
                        title="Read current step aloud"
                      >
                        <Volume2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="m-map-next-turn__instruction">
                  {cleanSpokenInstruction(
                    currentStep.instruction,
                    currentStep.instruction
                  )}
                </div>
                {currentStep.landmarkCue && (
                  <div className="m-map-next-turn__hint">
                    {currentStep.landmarkCue}
                  </div>
                )}
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

            {!speechSupported && voiceEnabled && (
              <div
                style={{
                  fontSize: 11.5,
                  color: 'var(--stage-ink-muted)',
                }}
              >
                Audio speech synthesis is not supported by this browser; showing
                live visual instructions above.
              </div>
            )}

            {/* Expandable Turn-by-Turn Steps List */}
            {showSteps && osrm && (
              <div className="m-map-sheet__steps">
                {steps.length > 0 ? (
                  steps.map((s, idx) => {
                    const isActiveStep = idx === resolvedStepIndex;
                    const cleanStepText = cleanSpokenInstruction(
                      s.instruction,
                      s.instruction
                    ).replace(/\.$/, '');
                    return (
                      <button
                        key={s.stepNumber}
                        type="button"
                        className={`m-map-sheet__step ${
                          isActiveStep ? 'm-map-sheet__step--active' : ''
                        }`}
                        onClick={() => {
                          setManualStepIndex(idx);
                          speakStepInstruction(s);
                        }}
                      >
                        <span className="m-map-sheet__step-num">
                          {s.stepNumber}
                        </span>
                        <span className="m-map-sheet__step-text">
                          {cleanStepText}
                        </span>
                        <span className="m-map-sheet__step-dist">
                          {Math.round(s.distanceMeters)} m
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="m-map-sheet__step">
                    Turn-by-turn steps were not provided. Follow the highlighted
                    green route line.
                  </div>
                )}
              </div>
            )}

            <div className="m-map-sheet__actions">
              {routeError && !routing ? (
                <button
                  type="button"
                  className="m-btn-solid"
                  onClick={retry}
                >
                  <RefreshCw size={16} />
                  Retry walking route
                </button>
              ) : (
                <button
                  type="button"
                  className="m-btn-solid"
                  disabled={routing || !osrm}
                  style={{ opacity: routing || !osrm ? 0.6 : 1 }}
                  onClick={() => setShowSteps((v) => !v)}
                >
                  {showSteps ? (
                    <ChevronDown size={16} />
                  ) : (
                    <ChevronUp size={16} />
                  )}
                  {showSteps
                    ? 'Hide all steps'
                    : `Show all ${steps.length || ''} steps`.trim()}
                </button>
              )}

              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="m-btn-outline"
              >
                <Compass size={16} color="var(--stage-accent-electric)" />
                Google Maps
              </a>
            </div>

            <div className="m-map-sheet__attrib">
              {STAGE_MAP_CONFIG.attributionText}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


