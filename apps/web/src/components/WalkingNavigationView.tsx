import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Info,
  Loader2,
  Navigation,
  RefreshCw,
  Volume1,
  Volume2,
  VolumeX,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  buildExternalMapsDirectionsUrl,
  fetchMultiModeRoute,
  getTransportModeMeta,
  MultiModeRouteResult,
  ResolvedRouteOption,
  SearchMatchResult,
  TRANSPORT_MODE_OPTIONS,
  TransportMode,
  WalkingStep,
} from '@stage/shared';
import { WebTransportModeIcon } from './MobileWebMapScreen';

interface WalkingNavigationViewProps {
  selectedMatch: SearchMatchResult;
}

function formatWalkDistance(meters: number): string {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)} km`
    : `${Math.round(meters)} m`;
}

export const WalkingNavigationView: React.FC<WalkingNavigationViewProps> = ({
  selectedMatch,
}) => {
  const { origin, stage, route, walking } = selectedMatch;
  const [transportMode, setTransportMode] = useState<TransportMode>('walking');
  const [routeResult, setRouteResult] = useState<MultiModeRouteResult | null>(
    null
  );
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);
  const [routing, setRouting] = useState<boolean>(true);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [isNavigating, setIsNavigating] = useState<boolean>(false);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(true);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);

  const modeMeta = useMemo(
    () => getTransportModeMeta(transportMode),
    [transportMode]
  );

  // Sync transport mode with OsrmStreetMap on desktop web
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

  const handleSelectMode = useCallback((nextMode: TransportMode) => {
    setTransportMode(nextMode);
    window.dispatchEvent(
      new CustomEvent('stage:transport-mode', { detail: { mode: nextMode } })
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    setRouting(true);
    setRouteError(null);

    fetchMultiModeRoute(
      origin.coordinates,
      stage.coordinates,
      stage.name,
      transportMode,
      { forceRefresh: retryTick > 0 }
    )
      .then((res) => {
        if (cancelled) return;
        setRouteResult(res);
        setSelectedOptionIndex(0);
        setActiveStepIndex(0);
        setRouting(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRouteResult(null);
        setRouteError(
          err instanceof Error
            ? err.message
            : `${modeMeta.label} route could not be loaded.`
        );
        setRouting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    origin.coordinates,
    stage.id,
    stage.coordinates,
    stage.name,
    transportMode,
    retryTick,
    modeMeta.label,
  ]);

  const activeRouteOption: ResolvedRouteOption | null = useMemo(() => {
    if (!routeResult || routeResult.routes.length === 0) return null;
    return (
      routeResult.routes[selectedOptionIndex] ?? routeResult.quickestRoute
    );
  }, [routeResult, selectedOptionIndex]);

  const steps: WalkingStep[] = activeRouteOption?.steps ?? walking.steps;
  const minutes =
    activeRouteOption?.estimatedMinutes ?? walking.estimatedMinutes;
  const totalDistanceMeters =
    activeRouteOption?.totalDistanceMeters ?? walking.totalDistanceMeters;
  const distLabel = formatWalkDistance(totalDistanceMeters);
  const stageShort = stage.name.replace(/\s*\((?:Unverified\s+)?Demo\)/gi, '');

  const stopSpeech = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  useEffect(() => {
    setActiveStepIndex(0);
    setIsNavigating(false);
    stopSpeech();
  }, [stage.id, origin.id, route.id, stopSpeech]);

  useEffect(() => {
    return () => {
      stopSpeech();
    };
  }, [stopSpeech]);

  const speakText = useCallback(
    (textToSpeak: string) => {
      if (
        !voiceEnabled ||
        typeof window === 'undefined' ||
        !('speechSynthesis' in window)
      ) {
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.rate = 0.98;
      utterance.pitch = 1.0;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    },
    [voiceEnabled]
  );

  const handleToggleVoice = useCallback(() => {
    setVoiceEnabled((prev) => {
      const next = !prev;
      if (!next) {
        stopSpeech();
      }
      return next;
    });
  }, [stopSpeech]);

  const handleStartNavigation = useCallback(() => {
    setIsNavigating(true);
    setActiveStepIndex(0);
    const firstStep = steps[0];
    if (firstStep) {
      speakText(
        `Step 1. ${firstStep.instruction}. ${firstStep.landmarkCue || ''}`
      );
    }
  }, [steps, speakText]);

  const handleEndNavigation = useCallback(() => {
    setIsNavigating(false);
    stopSpeech();
  }, [stopSpeech]);

  const handleStepSelect = useCallback(
    (step: WalkingStep, index: number) => {
      setActiveStepIndex(index);
      speakText(
        `Step ${step.stepNumber}. ${step.instruction}. ${step.landmarkCue || ''}`
      );
    },
    [speakText]
  );

  const googleMapsUrl = buildExternalMapsDirectionsUrl(
    origin.coordinates,
    stage.coordinates,
    transportMode,
    stage.name
  );

  return (
    <section
      className="detail-sheet walking-nav"
      aria-label={`Directions from ${origin.shortName} to ${stage.name}`}
    >
      {/* Compact Header: Destination + Stage + Expand/Collapse */}
      <div
        className="detail-sheet__header"
        style={{ alignItems: 'center', gap: 12 }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="detail-sheet__code">
            ROUTE #{route.routeNumber} · BOARD AT {stageShort.toUpperCase()}
          </span>
          <h2 className="detail-sheet__title" style={{ marginTop: 2 }}>
            {route.destinationName}
          </h2>
          <p className="detail-sheet__subtitle">
            {origin.shortName} → {stageShort} ({stage.streetAddress})
          </p>
        </div>

        <button
          type="button"
          className="m-map-sheet__collapse-btn"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
          aria-label={
            isExpanded
              ? 'Collapse directions panel'
              : 'Expand directions panel'
          }
          title={
            isExpanded
              ? 'Collapse directions panel'
              : 'Expand directions panel'
          }
        >
          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>

      {/* Icon-Only Transport Mode Selector + Travel Time & Distance */}
      <div className="m-map-sheet__mode-metrics-row" style={{ marginTop: 4 }}>
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
                <WebTransportModeIcon mode={option.id} size={19} />
              </button>
            );
          })}
        </div>

        <div className="m-map-sheet__metrics-right">
          {routing ? (
            <span className="m-map-sheet__inline-loading">
              <Loader2
                size={15}
                color="var(--stage-accent-electric)"
                className="m-spin"
              />
              <span>Routing…</span>
            </span>
          ) : (
            <span className="m-map-sheet__time-dist">
              <span className="m-map-sheet__duration">{minutes} min</span>
              <span className="m-map-sheet__distance">· {distLabel}</span>
            </span>
          )}
        </div>
      </div>

      {/* Single Primary Navigation Action + Compact Voice Toggle */}
      <div className="m-map-sheet__action-row" style={{ marginTop: 4 }}>
        {routeError && !routing ? (
          <button
            type="button"
            className="m-primary-nav-btn"
            onClick={() => setRetryTick((t) => t + 1)}
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
            disabled={routing}
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
            voiceEnabled ? 'Mute voice guidance' : 'Enable voice guidance'
          }
          title={
            voiceEnabled ? 'Mute voice guidance' : 'Enable voice guidance'
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

      {/* Expandable Turn-by-Turn & Route Summary Section */}
      {isExpanded && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            marginTop: 4,
          }}
        >
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
                          setActiveStepIndex(0);
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

          {/* Independently Scrollable Turn-by-Turn Steps List */}
          <ol
            className="walking-steps"
            style={{ maxHeight: 320, overflowY: 'auto', paddingRight: 4 }}
          >
            {steps.map((step, index) => {
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
                      {step.landmarkCue || step.streetName}
                    </div>
                  </div>
                  <div className="walking-step__telemetry">
                    <div>{formatWalkDistance(step.distanceMeters)}</div>
                    {isCurrent && (
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          color: 'var(--stage-accent-electric)',
                        }}
                      >
                        {isNavigating ? 'ACTIVE' : 'NEXT'}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
};
