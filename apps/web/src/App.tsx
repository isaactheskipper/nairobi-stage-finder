import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from 'framer-motion';
import {
  Bookmark,
  Bus,
  Compass,
  Footprints,
  LayoutDashboard,
  MapPin,
  Moon,
  Search,
  Sun,
} from 'lucide-react';
import {
  Coordinates,
  NAIROBI_CBD_ORIGINS,
  NAIROBI_DEMO_ROUTES,
  SearchMatchResult,
  searchRoutesAndStages,
  StageViewMode,
  VehicleType,
} from '@stage/shared';
import { StageLogo } from './components/StageLogo';
import { DemoNoticeBanner } from './components/DemoNoticeBanner';
import { DestinationSearchConsole } from './components/DestinationSearchConsole';
import { RouteResultsList } from './components/RouteResultsList';
import { StageDetailsPanel } from './components/StageDetailsPanel';
import { WalkingNavigationView } from './components/WalkingNavigationView';
import { WebLandingScreen } from './components/WebLandingScreen';
import { OsrmStreetMap } from './components/OsrmStreetMap';
import { MobileWebExperience } from './components/MobileWebExperience';

const StageBeacon3D = React.lazy(() =>
  import('./components/StageBeacon3D').then((m) => ({
    default: m.StageBeacon3D,
  }))
);

const SAVED_ROUTES_KEY = 'stage.mobile.savedRoutes.v1';
const THEME_STORAGE_KEY = 'stage.web.theme.v1';

function loadInitialSavedRoutes(): string[] {
  try {
    const raw = window.localStorage.getItem(SAVED_ROUTES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((id): id is string => typeof id === 'string');
      }
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

function loadInitialSurfaceTheme(): 'daylight' | 'night' {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'daylight' || saved === 'night') {
      return saved;
    }
  } catch {
    // ignore storage errors
  }
  return 'night';
}

const VIEW_MODES: Array<{
  id: StageViewMode;
  label: string;
  icon: React.ReactNode;
}> = [
  {
    id: 'overview',
    label: 'Home',
    icon: <LayoutDashboard size={14} />,
  },
  {
    id: 'search',
    label: 'Plan Stage',
    icon: <Search size={14} />,
  },
  {
    id: 'results',
    label: 'Routes',
    icon: <Bus size={14} />,
  },
  {
    id: 'saved',
    label: 'Saved',
    icon: <Bookmark size={14} />,
  },
  {
    id: 'walking-nav',
    label: 'OSRM Map',
    icon: <Footprints size={14} />,
  },
];

export const App: React.FC = () => {
  const [showLanding, setShowLanding] = useState<boolean>(true);
  const [query, setQuery] = useState<string>('');
  const [selectedOriginId, setSelectedOriginId] = useState<string>(
    NAIROBI_CBD_ORIGINS[0].id
  );
  const [vehicleFilter, setVehicleFilter] = useState<VehicleType | 'ALL'>(
    'ALL'
  );
  const [selectedRouteId, setSelectedRouteId] = useState<string>(
    NAIROBI_DEMO_ROUTES[0].id
  );
  const [viewMode, setViewMode] = useState<StageViewMode>('overview');
  // State for collapsing map info panel
  const [mapInfoCollapsed] = useState<boolean>(false);
  const [rightPanelTab, setRightPanelTab] = useState<
    'stage-details' | 'walking-nav'
  >('walking-nav');
  const [surfaceTheme, setSurfaceTheme] = useState<'daylight' | 'night'>(
    loadInitialSurfaceTheme
  );
  const [userGpsCoords, setUserGpsCoords] = useState<Coordinates | null>(null);
  const [isGpsLoading, setIsGpsLoading] = useState<boolean>(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [savedRouteIds, setSavedRouteIds] = useState<string[]>(
    loadInitialSavedRoutes
  );
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 768px)').matches
      : false
  );

  const shouldReduceMotion = useReducedMotion();
  const isPoppingHistoryRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setIsMobileViewport(e.matches);
    setIsMobileViewport(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Browser History Synchronization for Back/Forward navigation across tabs & screens
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const initialState = {
      stageApp: true,
      showLanding,
      viewMode,
      selectedRouteId,
    };
    window.history.replaceState(initialState, '');

    const onPopState = (event: PopStateEvent) => {
      const state = event.state;
      if (state && state.stageApp) {
        isPoppingHistoryRef.current = true;
        if (typeof state.showLanding === 'boolean') {
          setShowLanding(state.showLanding);
        }
        if (state.viewMode) {
          setViewMode(state.viewMode as StageViewMode);
        }
        if (typeof state.selectedRouteId === 'string') {
          setSelectedRouteId(state.selectedRouteId);
        }
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isPoppingHistoryRef.current) {
      isPoppingHistoryRef.current = false;
      return;
    }
    const cur = window.history.state;
    if (
      cur &&
      cur.stageApp &&
      cur.showLanding === showLanding &&
      cur.viewMode === viewMode &&
      cur.selectedRouteId === selectedRouteId
    ) {
      return;
    }
    window.history.pushState(
      {
        stageApp: true,
        showLanding,
        viewMode,
        selectedRouteId,
      },
      ''
    );
  }, [showLanding, viewMode, selectedRouteId]);

  useEffect(() => {
    if (surfaceTheme === 'night') {
      document.documentElement.setAttribute('data-theme', 'night');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, surfaceTheme);
    } catch {
      // ignore storage errors
    }
  }, [surfaceTheme]);

  const toggleTheme = useCallback(() => {
    setSurfaceTheme((prev) => (prev === 'daylight' ? 'night' : 'daylight'));
  }, []);

  const isRouteSaved = useCallback(
    (routeId: string) => savedRouteIds.includes(routeId),
    [savedRouteIds]
  );

  const toggleSaveRoute = useCallback((routeId: string) => {
    setSavedRouteIds((prev) => {
      const next = prev.includes(routeId)
        ? prev.filter((id) => id !== routeId)
        : [...prev, routeId];
      try {
        window.localStorage.setItem(SAVED_ROUTES_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const handleRequestBrowserGps = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsError('Location is not supported by this browser.');
      return;
    }
    setIsGpsLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserGpsCoords({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        });
        setIsGpsLoading(false);
        setGpsError(null);
      },
      (err) => {
        setUserGpsCoords(null);
        setIsGpsLoading(false);
        setGpsError(
          err.code === 1
            ? 'Location permission denied.'
            : 'Could not determine your live GPS position.'
        );
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  const handleClearGps = useCallback(() => {
    setUserGpsCoords(null);
    setGpsError(null);
  }, []);

  const searchResults = useMemo(() => {
    return searchRoutesAndStages(
      query,
      selectedOriginId,
      vehicleFilter,
      userGpsCoords
    );
  }, [query, selectedOriginId, vehicleFilter, userGpsCoords]);

  const allRoutesFromOrigin = useMemo(() => {
    return searchRoutesAndStages('', selectedOriginId, 'ALL', userGpsCoords);
  }, [selectedOriginId, userGpsCoords]);

  const activeMatch: SearchMatchResult = useMemo(() => {
    const inFiltered = searchResults.find(
      (r) => r.route.id === selectedRouteId
    );
    if (inFiltered) return inFiltered;
    if (searchResults.length > 0) return searchResults[0];
    return allRoutesFromOrigin[0];
  }, [searchResults, selectedRouteId, allRoutesFromOrigin]);

  const handleSelectRoute = (match: SearchMatchResult) => {
    setSelectedRouteId(match.route.id);
  };

  const handleInspectStage = (match: SearchMatchResult) => {
    setSelectedRouteId(match.route.id);
    setRightPanelTab('stage-details');
    if (viewMode !== 'overview') {
      setViewMode('stage-details');
    }
  };

  const handleStartWalking = (match: SearchMatchResult) => {
    setSelectedRouteId(match.route.id);
    setRightPanelTab('walking-nav');
    if (viewMode !== 'overview') {
      setViewMode('walking-nav');
    }
  };

  const handleSelectStageOnRadar = (stageId: string) => {
    const matchForStage = allRoutesFromOrigin.find(
      (m) => m.stage.id === stageId
    );
    if (matchForStage) {
      setSelectedRouteId(matchForStage.route.id);
    }
  };

  const savedMatches = useMemo(
    () => allRoutesFromOrigin.filter((m) => savedRouteIds.includes(m.route.id)),
    [allRoutesFromOrigin, savedRouteIds]
  );

  if (showLanding) {
    return (
      <WebLandingScreen
        surfaceTheme={surfaceTheme}
        onEnterApp={() => setShowLanding(false)}
      />
    );
  }

  if (isMobileViewport) {
    return (
      <MobileWebExperience
        query={query}
        onQueryChange={setQuery}
        selectedOriginId={selectedOriginId}
        onSelectOrigin={setSelectedOriginId}
        vehicleFilter={vehicleFilter}
        onSelectVehicleFilter={setVehicleFilter}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        surfaceTheme={surfaceTheme}
        onToggleTheme={toggleTheme}
        userGpsCoords={userGpsCoords}
        isGpsLoading={isGpsLoading}
        gpsError={gpsError}
        onRequestGps={handleRequestBrowserGps}
        onClearGps={handleClearGps}
        searchResults={searchResults}
        allRoutesFromOrigin={allRoutesFromOrigin}
        activeMatch={activeMatch}
        onSelectRouteId={setSelectedRouteId}
        onSelectStageOnRadar={handleSelectStageOnRadar}
        savedRouteIds={savedRouteIds}
        isRouteSaved={isRouteSaved}
        onToggleSaveRoute={toggleSaveRoute}
      />
    );
  }

  return (
    <div className="stage-shell stage-desktop-shell">
      <DemoNoticeBanner />

      <header className="stage-topbar">
        <div className="stage-topbar__inner">
          <div className="stage-topbar__left">
            <StageLogo onClick={() => setViewMode('overview')} />
            <span className="stage-topbar__city-tag">
              <span className="stage-topbar__pulse" />
              Nairobi CBD · OSRM Live
            </span>
          </div>

          <LayoutGroup>
            <nav
              className="stage-flow-tabs"
              aria-label="STAGE Core Experience Screens"
            >
              {VIEW_MODES.map((tab) => {
                const isActive = viewMode === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={`stage-flow-tab ${
                      isActive ? 'stage-flow-tab--active' : ''
                    }`}
                    onClick={() => setViewMode(tab.id)}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="activeViewTab"
                        className="stage-flow-tab__bg"
                        transition={{
                          type: 'spring',
                          stiffness: 450,
                          damping: 34,
                        }}
                      />
                    )}
                    <span className="stage-flow-tab__label">
                      {tab.icon}
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </nav>
          </LayoutGroup>

          <div className="stage-topbar__actions">
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={() => setShowLanding(true)}
              aria-label="Replay startup animation"
            >
              <Bus size={14} color="var(--stage-accent-electric, #1ED777)" />
              Intro
            </button>
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={() =>
                setSurfaceTheme((prev) =>
                  prev === 'daylight' ? 'night' : 'daylight'
                )
              }
              aria-label="Toggle outdoor daylight or night contrast surface"
            >
              {surfaceTheme === 'daylight' ? (
                <>
                  <Moon size={14} />
                  Night
                </>
              ) : (
                <>
                  <Sun size={14} color="#16E065" />
                  Daylight
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="stage-main">
        <AnimatePresence mode="wait">
          {viewMode === 'overview' && (
            <motion.div
              key="overview"
              initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 0.18 }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-lg)',
              }}
            >
              <DestinationSearchConsole
                query={query}
                onQueryChange={setQuery}
                selectedOriginId={selectedOriginId}
                onSelectOrigin={setSelectedOriginId}
                vehicleFilter={vehicleFilter}
                onSelectVehicleFilter={setVehicleFilter}
                totalResultsCount={searchResults.length}
                userGpsCoords={userGpsCoords}
                onRequestGps={handleRequestBrowserGps}
                onClearGps={() => setUserGpsCoords(null)}
              />

              <div className="stage-workspace-grid">
                <div className="stage-column-primary">
                  <RouteResultsList
                    results={searchResults}
                    selectedRouteId={activeMatch.route.id}
                    onSelectRoute={handleSelectRoute}
                    onInspectStage={handleInspectStage}
                    onStartWalking={handleStartWalking}
                    isRouteSaved={isRouteSaved}
                    onToggleSaveRoute={toggleSaveRoute}
                    onResetSearch={() => {
                      setQuery('');
                      setVehicleFilter('ALL');
                    }}
                  />
                </div>

                <aside
                  className="stage-column-secondary"
                  aria-label="OSRM Street Map and Stage Navigation"
                >


                  <OsrmStreetMap
                    origin={activeMatch.origin}
                    selectedStage={activeMatch.stage}
                    walking={activeMatch.walking}
                    onSelectStageById={handleSelectStageOnRadar}
                    onRequestLiveGps={handleRequestBrowserGps}
                    isLiveGpsActive={Boolean(userGpsCoords)}
                    collapsedInfo={mapInfoCollapsed}
                  />

                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      backgroundColor: 'var(--stage-surface-secondary)',
                      padding: 5,
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--stage-border-subtle)',
                    }}
                    role="tablist"
                    aria-label="Walking directions or stage detail view"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={rightPanelTab === 'walking-nav'}
                      className="btn-stage-secondary"
                      style={{
                        flex: 1,
                        justifyContent: 'center',
                        backgroundColor:
                          rightPanelTab === 'walking-nav'
                            ? 'var(--stage-ink-primary)'
                            : 'transparent',
                        color:
                          rightPanelTab === 'walking-nav'
                            ? 'var(--stage-surface-primary)'
                            : 'var(--stage-ink-primary)',
                        border: 'none',
                      }}
                      onClick={() => setRightPanelTab('walking-nav')}
                    >
                      <Compass size={14} />
                      OSRM Walk ({activeMatch.walking.estimatedMinutes}m)
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={rightPanelTab === 'stage-details'}
                      className="btn-stage-secondary"
                      style={{
                        flex: 1,
                        justifyContent: 'center',
                        backgroundColor:
                          rightPanelTab === 'stage-details'
                            ? 'var(--stage-ink-primary)'
                            : 'transparent',
                        color:
                          rightPanelTab === 'stage-details'
                            ? 'var(--stage-surface-primary)'
                            : 'var(--stage-ink-primary)',
                        border: 'none',
                      }}
                      onClick={() => setRightPanelTab('stage-details')}
                    >
                      <MapPin size={14} />
                      Stage Bay Details
                    </button>
                  </div>

                  {rightPanelTab === 'stage-details' ? (
                    <StageDetailsPanel
                      selectedMatch={activeMatch}
                      onStartWalkingNav={() => setRightPanelTab('walking-nav')}
                    />
                  ) : (
                    <WalkingNavigationView selectedMatch={activeMatch} />
                  )}
                </aside>
              </div>
            </motion.div>
          )}

          {viewMode === 'search' && (
            <motion.div
              key="search"
              className="stage-focused-container"
              initial={
                shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }
              }
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <DestinationSearchConsole
                query={query}
                onQueryChange={setQuery}
                selectedOriginId={selectedOriginId}
                onSelectOrigin={setSelectedOriginId}
                vehicleFilter={vehicleFilter}
                onSelectVehicleFilter={setVehicleFilter}
                totalResultsCount={searchResults.length}
                userGpsCoords={userGpsCoords}
                onRequestGps={handleRequestBrowserGps}
                onClearGps={() => setUserGpsCoords(null)}
              />
              <RouteResultsList
                results={searchResults}
                selectedRouteId={activeMatch.route.id}
                onSelectRoute={handleSelectRoute}
                onInspectStage={handleInspectStage}
                isRouteSaved={isRouteSaved}
                onToggleSaveRoute={toggleSaveRoute}
                onStartWalking={(match) => {
                  handleSelectRoute(match);
                  setViewMode('walking-nav');
                }}
                onResetSearch={() => {
                  setQuery('');
                  setVehicleFilter('ALL');
                }}
              />
            </motion.div>
          )}

          {viewMode === 'results' && (
            <motion.div
              key="results"
              className="stage-focused-container"
              initial={
                shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }
              }
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <RouteResultsList
                results={searchResults}
                selectedRouteId={activeMatch.route.id}
                onSelectRoute={handleSelectRoute}
                onInspectStage={handleInspectStage}
                isRouteSaved={isRouteSaved}
                onToggleSaveRoute={toggleSaveRoute}
                onStartWalking={(match) => {
                  handleSelectRoute(match);
                  setViewMode('walking-nav');
                }}
                onResetSearch={() => {
                  setQuery('');
                  setVehicleFilter('ALL');
                }}
              />
            </motion.div>
          )}

          {viewMode === 'saved' && (
            <motion.div
              key="saved"
              className="stage-focused-container"
              initial={
                shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }
              }
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <RouteResultsList
                results={savedMatches}
                selectedRouteId={activeMatch.route.id}
                onSelectRoute={handleSelectRoute}
                onInspectStage={handleInspectStage}
                isRouteSaved={isRouteSaved}
                onToggleSaveRoute={toggleSaveRoute}
                onStartWalking={(match) => {
                  handleSelectRoute(match);
                  setViewMode('walking-nav');
                }}
                onResetSearch={() => setViewMode('results')}
              />
            </motion.div>
          )}

          {viewMode === 'stage-details' && (
            <motion.div
              key="stage-details"
              className="stage-focused-container"
              initial={
                shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }
              }
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <Suspense fallback={null}>
                <StageBeacon3D
                  origin={activeMatch.origin}
                  selectedStage={activeMatch.stage}
                  walking={activeMatch.walking}
                  onSelectStageById={handleSelectStageOnRadar}
                />
              </Suspense>
              <StageDetailsPanel
                selectedMatch={activeMatch}
                onStartWalkingNav={() => setViewMode('walking-nav')}
              />
            </motion.div>
          )}

          {viewMode === 'walking-nav' && (
            <motion.div
              key="walking-nav"
              className="stage-focused-container"
              initial={
                shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }
              }
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >


              <OsrmStreetMap
                origin={activeMatch.origin}
                selectedStage={activeMatch.stage}
                walking={activeMatch.walking}
                onSelectStageById={handleSelectStageOnRadar}
                onRequestLiveGps={handleRequestBrowserGps}
                isLiveGpsActive={Boolean(userGpsCoords)}
                collapsedInfo={mapInfoCollapsed}
              />
              <WalkingNavigationView selectedMatch={activeMatch} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="stage-footer">
        <div className="stage-footer__inner">
          <span>
            <strong>STAGE</strong> — Nairobi Public Transport &amp; Boarding
            Stage Discovery (Powered by Project-OSRM)
          </span>
          <span>
            No registration required · Unverified demo dataset for architectural
            &amp; UI validation
          </span>
        </div>
      </footer>
    </div>
  );
};
