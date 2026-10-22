import React, { Suspense, useEffect, useMemo, useState } from 'react';
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from 'framer-motion';
import {
  Bus,
  Cloud,
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
import { StageLandingHero } from './components/StageLandingHero';
import { OsrmStreetMap } from './components/OsrmStreetMap';

const StageBeacon3D = React.lazy(() =>
  import('./components/StageBeacon3D').then((m) => ({
    default: m.StageBeacon3D,
  }))
);

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
  const [rightPanelTab, setRightPanelTab] = useState<
    'stage-details' | 'walking-nav'
  >('walking-nav');
  const [surfaceTheme, setSurfaceTheme] = useState<'daylight' | 'night'>(
    'daylight'
  );
  const [userGpsCoords, setUserGpsCoords] = useState<Coordinates | null>(null);

  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (surfaceTheme === 'night') {
      document.documentElement.setAttribute('data-theme', 'night');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [surfaceTheme]);

  const handleRequestBrowserGps = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserGpsCoords({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        });
      },
      () => {
        setUserGpsCoords(null);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

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

  if (showLanding) {
    return (
      <StageLandingHero
        surfaceTheme={surfaceTheme}
        onToggleSurfaceTheme={() =>
          setSurfaceTheme((prev) =>
            prev === 'daylight' ? 'night' : 'daylight'
          )
        }
        onEnterWorkspace={(initialQuery?: string) => {
          if (typeof initialQuery === 'string') {
            setQuery(initialQuery);
          }
          setShowLanding(false);
        }}
      />
    );
  }

  return (
    <div className="stage-shell">
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
              aria-label="Open 3D Chrome Sky Landing Page"
            >
              <Cloud size={14} color="#16E065" />
              Sky Intro
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
