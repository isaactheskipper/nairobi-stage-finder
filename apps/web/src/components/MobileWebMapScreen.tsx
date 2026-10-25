import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Compass,
  Crosshair,
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
import {
  cleanSpokenInstruction,
  useWebWalkingVoiceAssistant,
} from '../hooks/useWebWalkingVoiceAssistant';
import { WebLocationPermissionState } from '../hooks/useWebUserLocation';

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
const PEEK_HEIGHT = 104;

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
  const iframeRef = useRef<HTMLIFrameElement>(null);
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
  const [mapFailed, setMapFailed] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapKey, setMapKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [voiceEnabled, setVoiceEnabled] = useState(true);

  useEffect(() => {
    setUseDark(isDarkTheme);
  }, [isDarkTheme]);

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

  const displayInstruction = useMemo(() => {
    if (!latestInstruction) return null;
    const stageShort = stage.name
      .replace(/\s*\((?:Unverified\s+)?Demo\)/gi, '')
      .trim();
    return cleanSpokenInstruction(
      latestInstruction,
      `Walk toward ${stageShort}.`
    );
  }, [latestInstruction, stage.name]);

  // Avoid duplicating instructions already visible in the expanded direction card (matches Android)
  const isInstructionDuplicatedOnCard = useMemo(() => {
    if (!displayInstruction || !isExpanded) return false;
    if (
      showSteps &&
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
  }, [displayInstruction, isExpanded, showSteps, osrm, lastAnnouncementType]);

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
    if (osrm && sameStage && moved < REROUTE_METERS && retryTick === 0) {
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
  initialRef.current = { start: startCoords, label: startLabel };

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [useDark, stage.id, route.routeNumber, mapKey]
  );

  const sendMapCmd = useCallback((cmd: string, payload?: object) => {
    const win = iframeRef.current?.contentWindow as
      | (Window & {
          __stageApply?: (msg: object) => void;
          __stageMap?: { zoomIn: () => void; zoomOut: () => void };
        })
      | null
      | undefined;
    if (!win) return;
    try {
      if (cmd === 'apply' && payload && typeof win.__stageApply === 'function') {
        win.__stageApply(payload);
        return;
      }
      if (cmd === 'zoomIn' && win.__stageMap) {
        win.__stageMap.zoomIn();
        return;
      }
      if (cmd === 'zoomOut' && win.__stageMap) {
        win.__stageMap.zoomOut();
        return;
      }
    } catch {
      // Fallback to postMessage below
    }
    try {
      win.postMessage(JSON.stringify({ __stageCmd: cmd, payload }), '*');
    } catch {
      // ignore
    }
  }, []);

  const apply = useCallback(
    (msg: object) => {
      sendMapCmd('apply', msg);
    },
    [sendMapCmd]
  );

  // Listen for MAP_LOADED, MAP_ERROR, and SELECT_STAGE messages from the map iframe
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      try {
        const parsed = JSON.parse(event.data) as {
          type?: string;
          stageId?: string;
        };
        if (parsed.type === 'MAP_LOADED') {
          setMapReady(true);
        } else if (parsed.type === 'MAP_ERROR') {
          setMapFailed(true);
        } else if (parsed.type === 'SELECT_STAGE' && parsed.stageId) {
          onSelectStageById?.(parsed.stageId);
        }
      } catch {
        if (event.data.includes('MAP_LOADED')) setMapReady(true);
        else if (event.data.includes('MAP_ERROR')) setMapFailed(true);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onSelectStageById]);

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
        const sheetHeight = sheetRef.current?.offsetHeight ?? 340;
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
          <iframe
            ref={iframeRef}
            key={`${useDark ? 'dark' : 'light'}-${stage.id}-${mapKey}`}
            title={`Walking map to ${stage.name}`}
            srcDoc={html}
            className="m-map-iframe"
            onLoad={() => {
              // MapLibre inside iframe also posts MAP_LOADED once style loads
            }}
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

      {/* Top Overlay: Back button + Map/Dark switcher + Non-overlapping Voice Instruction Banner */}
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
                    setMapReady(false);
                    setUseDark(dark);
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

      {/* Right-side Floating Map Action Controls */}
      <div className="m-map-side-fabs">
        <button
          type="button"
          className="m-map-fab"
          aria-label="Show whole route"
          title="Show whole route"
          onClick={() => apply({ type: 'fit' })}
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

      {/* Collapsible / Draggable Directions Bottom Sheet */}
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
                {stage.name.replace(' (Demo)', '')} · {stage.streetAddress}
              </div>
            </div>
            <div className="m-map-sheet__peek-badge">
              <User size={12} />
              <span>{minutes ? `${minutes}m` : distLabel || 'Route'}</span>
            </div>
          </button>
        </div>

        {/* Sheet Body (hidden when collapsed to peek height) */}
        {isExpanded && (
          <div className="m-map-sheet__body">
            <button
              type="button"
              className="m-map-sheet__from-row"
              onClick={onChangeOrigin}
              aria-label="Change starting point"
            >
              {usingGps ? (
                <Crosshair size={13} color="var(--stage-ink-secondary)" />
              ) : (
                <MapPin size={13} color="var(--stage-ink-secondary)" />
              )}
              <span className="m-map-sheet__from-text">
                From: {usingGps ? 'your live location' : origin.name}
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
                <span>Finding walking route…</span>
              </div>
            ) : osrm ? (
              <div className="m-map-sheet__status m-map-sheet__status--ok">
                <User size={14} color="var(--stage-ink-secondary)" />
                <span>
                  {minutes} min ({distLabel}) walking
                </span>
              </div>
            ) : (
              <div className="m-map-sheet__error">
                {routeError ?? 'Walking route unavailable.'} No route is drawn
                until a real one is found.
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

            {showSteps && osrm && (
              <div className="m-map-sheet__steps">
                {osrm.steps.length > 0 ? (
                  osrm.steps.map((s) => {
                    const isActiveStep = s.stepNumber === activeStepNumber;
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
                        onClick={() => speakStepInstruction(s)}
                      >
                        {s.stepNumber}. {cleanStepText} (
                        {Math.round(s.distanceMeters)} m)
                      </button>
                    );
                  })
                ) : (
                  <div className="m-map-sheet__step">
                    Turn-by-turn steps were not provided. Follow the green line.
                  </div>
                )}
              </div>
            )}

            {routeError && !routing ? (
              <button
                type="button"
                className="m-btn-solid"
                onClick={retry}
              >
                <RefreshCw size={16} />
                Try again
              </button>
            ) : (
              <button
                type="button"
                className="m-btn-solid"
                disabled={routing || !osrm}
                style={{ opacity: routing || !osrm ? 0.6 : 1 }}
                onClick={() => setShowSteps((v) => !v)}
              >
                <Navigation size={16} />
                {showSteps ? 'Hide steps' : 'Walk there'}
              </button>
            )}

            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="m-btn-outline"
            >
              <Compass size={16} color="var(--stage-accent-electric)" />
              Open Maps
            </a>

            <div className="m-map-sheet__attrib">
              {STAGE_MAP_CONFIG.attributionText}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

