import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Compass,
  Crosshair,
  Flag,
  Globe,
  Home,
  Layers,
  Loader2,
  MapPin,
  Moon,
  Navigation,
  Search,
  Shield,
  Sun,
  Trash2,
  User,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react';
import {
  BoardingStage,
  buildGoogleMapsWalkingUrl,
  Coordinates,
  getOriginById,
  matchPlaceToStageDatabase,
  NAIROBI_CBD_ORIGINS,
  NAIROBI_DEMO_STAGES,
  NominatimPlaceResult,
  NominatimSearchOutcome,
  QUICK_DESTINATION_SUGGESTIONS,
  searchNominatimPlacesKenya,
  SearchMatchResult,
  StageViewMode,
  UNVERIFIED_DEMO_BANNER,
  VehicleType,
} from '@stage/shared';
import { StageBrandMark } from './StageLogo';
import { MobileWebMapScreen } from './MobileWebMapScreen';
import { WebLocationPermissionState } from '../hooks/useWebUserLocation';

const POPULAR_DESTINATIONS = ['Juja', 'Ngong', 'Kikuyu', 'Westlands'] as const;

/** Muted, distinct tones per destination matching apps/mobile/src/components/MobileHomeScreen.tsx */
const DESTINATION_TONES: Record<string, { bg: string; fg: string }> = {
  Juja: { bg: '#24463A', fg: '#7FD1AC' },
  Ngong: { bg: '#2B3F52', fg: '#8FB8DA' },
  Kikuyu: { bg: '#4A3F28', fg: '#D9BC7A' },
  Westlands: { bg: '#3F3350', fg: '#B9A0DC' },
};

/** Ordered main bottom-navigation tabs for horizontal swipe navigation: Home -> Search -> Routes -> Saved */
export const MAIN_MOBILE_TABS: readonly StageViewMode[] = [
  'overview',
  'search',
  'results',
  'saved',
] as const;

type SearchFilter = 'All' | 'Routes' | 'Stages' | 'Destinations';
const SEARCH_FILTERS: SearchFilter[] = ['All', 'Routes', 'Stages', 'Destinations'];

type RoutesTabFilter = 'ALL' | 'CITY_BUS' | 'MATATU_14' | 'STAGES';

const SAVED_STAGES_KEY = 'stage.mobile.savedStages.v1';
const RECENT_SEARCHES_KEY = 'stage.mobile.recentSearches.v1';

function loadInitialSavedStages(): string[] {
  try {
    const raw = window.localStorage.getItem(SAVED_STAGES_KEY);
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

function loadInitialRecentSearches(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          .slice(0, 6);
      }
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

function routeText(m: SearchMatchResult): string {
  const r = m.route;
  return `${r.destinationName} ${r.destinationArea} ${r.corridorName}`.toLowerCase();
}

function countRoutesFor(matches: SearchMatchResult[], keyword: string): number {
  const k = keyword.toLowerCase();
  return matches.filter((m) => routeText(m).includes(k)).length;
}

function formatWalkDistance(meters: number): string {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)} km`
    : `${Math.round(meters)} m`;
}

function isSwipeIgnoredTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], .m-popular-scroll, .m-filter-pills, .m-map-container, .spatial-card, .leaflet-container, iframe, .m-modal-backdrop, [data-no-tab-swipe="true"]'
    )
  );
}

interface MobileRouteCardWebProps {
  match: SearchMatchResult;
  onPress: () => void;
  variant?: 'nearby' | 'result';
  selected?: boolean;
  saved: boolean;
  onToggleSave: () => void;
}

const MobileRouteCardWeb: React.FC<MobileRouteCardWebProps> = ({
  match,
  onPress,
  variant = 'nearby',
  selected = false,
  saved,
  onToggleSave,
}) => {
  const { route, stage, walking, origin } = match;
  const stageShort = stage.name.replace(' (Demo)', '');
  const farAway = walking.totalDistanceMeters > 2500;
  const proximity = farAway
    ? `${(walking.totalDistanceMeters / 1000).toFixed(1)} km away`
    : `${walking.estimatedMinutes} min walk`;
  const operators = route.saccoExamples.slice(0, 2).join(' · ');

  const badgeSize = 48;
  const numLen = route.routeNumber.length;
  const fontSize = Math.round(
    badgeSize * (numLen > 3 ? 0.3 : numLen > 2 ? 0.36 : 0.46)
  );

  return (
    <div
      role="button"
      tabIndex={0}
      className={`m-route-card ${selected ? 'm-route-card--selected' : ''}`}
      onClick={onPress}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPress();
        }
      }}
      aria-label={`Route ${route.routeNumber} to ${route.destinationName}, board at ${stageShort}, ${proximity}`}
    >
      <div
        className="m-route-badge"
        style={{ fontSize: `${fontSize}px` }}
        aria-hidden="true"
      >
        {route.routeNumber}
      </div>

      <div className="m-route-card__body">
        <div className="m-route-card__header">
          <div className="m-route-card__title">{route.destinationName}</div>
          <div className="m-route-card__origin">
            {origin.shortName} → {route.destinationName}
          </div>
        </div>

        <div className="m-route-card__boarding">
          <MapPin size={13} className="m-route-card__pin" />
          <div className="m-route-card__boarding-text">
            <span className="m-route-card__board-at">Board at </span>
            <span className="m-route-card__stage-name">{stageShort}</span>
            {variant === 'nearby' && stage.streetAddress
              ? ` · ${stage.streetAddress}`
              : ''}
          </div>
        </div>

        {variant === 'result' && operators.length > 0 && (
          <div className="m-route-card__operators">Operators: {operators}</div>
        )}

        <div className="m-route-card__meta">
          <span className="m-route-card__walk">
            <User size={12} />
            {proximity}
          </span>
          <span
            className="m-verify-badge"
            aria-label="Needs verification: unverified demo route data"
          >
            <AlertTriangle size={10} />
            Needs verification
          </span>
        </div>
      </div>

      <div
        className="m-route-card__action"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={`m-bookmark-btn ${saved ? 'm-bookmark-btn--saved' : ''}`}
          onClick={onToggleSave}
          aria-label={saved ? 'Remove from saved' : 'Save route'}
          aria-pressed={saved}
        >
          <Bookmark size={20} fill={saved ? 'currentColor' : 'none'} />
        </button>
      </div>
    </div>
  );
};

interface MobileStageCardWebProps {
  stage: BoardingStage;
  matchesForStage: SearchMatchResult[];
  saved: boolean;
  onToggleSave: () => void;
  onOpenStageRoute: (match: SearchMatchResult) => void;
  onWalkToStage: (match: SearchMatchResult) => void;
}

const MobileStageCardWeb: React.FC<MobileStageCardWebProps> = ({
  stage,
  matchesForStage,
  saved,
  onToggleSave,
  onOpenStageRoute,
  onWalkToStage,
}) => {
  const primaryMatch = matchesForStage[0];
  const stageShort = stage.name.replace(' (Demo)', '');
  const walkLabel = primaryMatch
    ? primaryMatch.walking.totalDistanceMeters > 2500
      ? `${(primaryMatch.walking.totalDistanceMeters / 1000).toFixed(1)} km away`
      : `${primaryMatch.walking.estimatedMinutes} min walk (${formatWalkDistance(
          primaryMatch.walking.totalDistanceMeters
        )})`
    : 'Walk estimate unavailable';

  return (
    <div
      role="button"
      tabIndex={0}
      className="m-stage-card"
      onClick={() => primaryMatch && onOpenStageRoute(primaryMatch)}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && primaryMatch) {
          e.preventDefault();
          onOpenStageRoute(primaryMatch);
        }
      }}
      aria-label={`Boarding stage ${stageShort}, ${matchesForStage.length} routes`}
    >
      <div className="m-stage-code-tile" aria-hidden="true">
        <MapPin size={15} color="var(--stage-accent-electric)" />
        <span>{stage.code.replace('STG-', '')}</span>
      </div>

      <div className="m-stage-card__body">
        <div className="m-stage-card__title">{stageShort}</div>
        <div className="m-stage-card__address">{stage.streetAddress}</div>
        <div className="m-stage-card__landmark">{stage.nearestLandmark}</div>

        {matchesForStage.length > 0 && (
          <div className="m-stage-card__routes">
            {matchesForStage.map((m) => (
              <span key={m.route.id} className="m-stage-route-pill">
                #{m.route.routeNumber} {m.route.destinationName}
              </span>
            ))}
          </div>
        )}

        <div className="m-route-card__meta" style={{ marginTop: 4 }}>
          <span className="m-route-card__walk">
            <User size={12} />
            {walkLabel}
          </span>
          <span className="m-verify-badge">
            <AlertTriangle size={10} />
            Needs verification
          </span>
        </div>

        {primaryMatch && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              gap: 8,
              marginTop: 6,
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="m-chip"
              onClick={() => onOpenStageRoute(primaryMatch)}
            >
              Details
            </button>
            <button
              type="button"
              className="m-chip"
              style={{
                borderColor: 'var(--stage-accent-electric)',
                color: 'var(--stage-accent-electric)',
              }}
              onClick={() => onWalkToStage(primaryMatch)}
            >
              <Navigation size={12} />
              Walk there
            </button>
          </div>
        )}
      </div>

      <div
        className="m-route-card__action"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={`m-bookmark-btn ${saved ? 'm-bookmark-btn--saved' : ''}`}
          onClick={onToggleSave}
          aria-label={saved ? 'Remove stage from saved' : 'Save boarding stage'}
          aria-pressed={saved}
        >
          <Bookmark size={20} fill={saved ? 'currentColor' : 'none'} />
        </button>
      </div>
    </div>
  );
};

export interface MobileWebExperienceProps {
  query: string;
  onQueryChange: (q: string) => void;
  selectedOriginId: string;
  onSelectOrigin: (id: string) => void;
  vehicleFilter: VehicleType | 'ALL';
  onSelectVehicleFilter: (v: VehicleType | 'ALL') => void;
  viewMode: StageViewMode;
  onChangeViewMode: (next: StageViewMode) => void;
  surfaceTheme: 'daylight' | 'night';
  onToggleTheme: () => void;
  userGpsCoords: Coordinates | null;
  isGpsLoading: boolean;
  gpsError: string | null;
  locationStatus?: WebLocationPermissionState;
  locationMessage?: string;
  permissionBlocked?: boolean;
  permissionHelpVisible?: boolean;
  onOpenSettings?: () => void;
  onClosePermissionHelp?: () => void;
  onRequestGps: () => void;
  onClearGps: () => void;
  searchResults: SearchMatchResult[];
  allRoutesFromOrigin: SearchMatchResult[];
  activeMatch: SearchMatchResult;
  onSelectRouteId: (routeId: string) => void;
  onSelectStageOnRadar: (stageId: string) => void;
  savedRouteIds: string[];
  isRouteSaved: (routeId: string) => boolean;
  onToggleSaveRoute: (routeId: string) => void;
}

export const MobileWebExperience: React.FC<MobileWebExperienceProps> = ({
  query,
  onQueryChange,
  selectedOriginId,
  onSelectOrigin,
  viewMode,
  onChangeViewMode,
  surfaceTheme,
  onToggleTheme,
  userGpsCoords,
  isGpsLoading,
  gpsError,
  locationStatus,
  locationMessage,
  permissionBlocked,
  permissionHelpVisible,
  onOpenSettings,
  onClosePermissionHelp,
  onRequestGps,
  onClearGps,
  searchResults,
  allRoutesFromOrigin,
  activeMatch,
  onSelectRouteId,
  onSelectStageOnRadar,
  savedRouteIds,
  isRouteSaved,
  onToggleSaveRoute,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const [prevMode, setPrevMode] = useState<StageViewMode>('overview');
  const [slideDirection, setSlideDirection] = useState<number>(0);
  const [searchFocused, setSearchFocused] = useState(false);
  const [showOriginPicker, setShowOriginPicker] = useState(false);
  const [demoNoticeExpanded, setDemoNoticeExpanded] = useState(false);

  // Saved boarding stages (complements saved routes)
  const [savedStageIds, setSavedStageIds] = useState<string[]>(
    loadInitialSavedStages
  );

  // Persistent recent searches
  const [recentSearches, setRecentSearches] = useState<string[]>(
    loadInitialRecentSearches
  );

  const recordRecentSearch = useCallback((term: string) => {
    const clean = term.trim();
    if (clean.length < 2) return;
    setRecentSearches((prev) => {
      const next = [
        clean,
        ...prev.filter((item) => item.toLowerCase() !== clean.toLowerCase()),
      ].slice(0, 6);
      try {
        window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    try {
      window.localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch {
      // ignore storage errors
    }
  }, []);

  // Search tab state (mirrors apps/mobile/src/components/MobileSearchCard.tsx)
  const [searchFilter, setSearchFilter] = useState<SearchFilter>('All');
  const [osmOutcome, setOsmOutcome] = useState<NominatimSearchOutcome | null>(
    null
  );
  const [osmLoading, setOsmLoading] = useState(false);
  const requestIdRef = useRef(0);
  const lastQueryRef = useRef<string | null>(null);

  // Routes tab filter state
  const [routesTabFilter, setRoutesTabFilter] =
    useState<RoutesTabFilter>('ALL');

  // Horizontal swipe gesture tracking state
  const swipeStateRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    startTime: number;
    lockedVertical: boolean;
    lockedHorizontal: boolean;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    startTime: 0,
    lockedVertical: false,
    lockedHorizontal: false,
  });

  const origin = getOriginById(selectedOriginId);
  const isGpsActive = Boolean(userGpsCoords);

  const isStageSaved = useCallback(
    (stageId: string) => savedStageIds.includes(stageId),
    [savedStageIds]
  );

  const toggleSaveStage = useCallback((stageId: string) => {
    setSavedStageIds((prev) => {
      const next = prev.includes(stageId)
        ? prev.filter((id) => id !== stageId)
        : [...prev, stageId];
      try {
        window.localStorage.setItem(SAVED_STAGES_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const go = useCallback(
    (next: StageViewMode) => {
      if (next === viewMode) return;
      const curIdx = MAIN_MOBILE_TABS.indexOf(viewMode);
      const nextIdx = MAIN_MOBILE_TABS.indexOf(next);
      if (curIdx !== -1 && nextIdx !== -1) {
        setSlideDirection(nextIdx > curIdx ? 1 : -1);
      } else if (next === 'stage-details' || next === 'walking-nav') {
        setSlideDirection(1);
      } else {
        setSlideDirection(-1);
      }
      setPrevMode(viewMode);
      onChangeViewMode(next);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [viewMode, onChangeViewMode]
  );

  const openRoute = useCallback(
    (match: SearchMatchResult) => {
      onSelectRouteId(match.route.id);
      go('stage-details');
    },
    [onSelectRouteId, go]
  );

  const startWalkToStage = useCallback(
    (match: SearchMatchResult) => {
      onSelectRouteId(match.route.id);
      go('walking-nav');
    },
    [onSelectRouteId, go]
  );

  // Horizontal touch swipe handlers for Home -> Search -> Routes -> Saved
  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (showOriginPicker || e.touches.length !== 1) {
        swipeStateRef.current.active = false;
        return;
      }
      // Do not swipe tabs on the interactive map screen
      if (viewMode === 'walking-nav') {
        swipeStateRef.current.active = false;
        return;
      }
      if (isSwipeIgnoredTarget(e.target)) {
        swipeStateRef.current.active = false;
        return;
      }
      const selection = window.getSelection?.();
      if (selection && selection.toString().length > 0) {
        swipeStateRef.current.active = false;
        return;
      }
      const touch = e.touches[0];
      swipeStateRef.current = {
        active: true,
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: Date.now(),
        lockedVertical: false,
        lockedHorizontal: false,
      };
    },
    [showOriginPicker, viewMode]
  );

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const state = swipeStateRef.current;
    if (!state.active || state.lockedVertical || e.touches.length !== 1) return;

    const touch = e.touches[0];
    const dx = touch.clientX - state.startX;
    const dy = touch.clientY - state.startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    // Wait for a small deadzone before locking axis
    if (!state.lockedHorizontal && (absX > 10 || absY > 10)) {
      if (absY >= absX * 0.85) {
        // User is scrolling vertically; lock out tab swipe for the rest of this touch
        state.lockedVertical = true;
        return;
      }
      if (absX > absY * 1.55) {
        state.lockedHorizontal = true;
      }
    }
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const state = swipeStateRef.current;
      swipeStateRef.current.active = false;

      if (!state.active || state.lockedVertical || e.changedTouches.length !== 1) {
        return;
      }

      const touch = e.changedTouches[0];
      const dx = touch.clientX - state.startX;
      const dy = touch.clientY - state.startY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      const elapsed = Math.max(1, Date.now() - state.startTime);
      const velocityX = absX / elapsed; // px/ms

      // Must be predominantly horizontal and exceed threshold (56px, or 40px fast flick)
      const meetsDistance =
        absX >= 56 || (absX >= 40 && velocityX >= 0.42 && elapsed <= 320);
      const clearlyHorizontal = absX > absY * 1.65;

      if (!meetsDistance || !clearlyHorizontal) {
        return;
      }

      // If on Route Details, a right-swipe from left edge or across screen goes back
      if (viewMode === 'stage-details') {
        if (dx > 0) {
          go(
            prevMode === 'stage-details' || prevMode === 'walking-nav'
              ? 'results'
              : prevMode
          );
        }
        return;
      }

      const currentTabIndex = MAIN_MOBILE_TABS.indexOf(viewMode);
      if (currentTabIndex === -1) return;

      if (dx < 0) {
        // Swiping left moves to the next tab (Home -> Search -> Routes -> Saved), no wrap-around
        if (currentTabIndex < MAIN_MOBILE_TABS.length - 1) {
          go(MAIN_MOBILE_TABS[currentTabIndex + 1]);
        }
      } else if (dx > 0) {
        // Swiping right returns to the previous tab (Saved -> Routes -> Search -> Home), no wrap-around
        if (currentTabIndex > 0) {
          go(MAIN_MOBILE_TABS[currentTabIndex - 1]);
        }
      }
    },
    [viewMode, prevMode, go]
  );

  const handleTouchCancel = useCallback(() => {
    swipeStateRef.current.active = false;
  }, []);

  const nearbyRoutes = useMemo(
    () => allRoutesFromOrigin.slice(0, 3),
    [allRoutesFromOrigin]
  );

  const savedMatches = useMemo(
    () => allRoutesFromOrigin.filter((m) => savedRouteIds.includes(m.route.id)),
    [allRoutesFromOrigin, savedRouteIds]
  );

  const stagesWithRoutes = useMemo(() => {
    return NAIROBI_DEMO_STAGES.map((stage) => ({
      stage,
      matches: allRoutesFromOrigin.filter((m) => m.stage.id === stage.id),
    }));
  }, [allRoutesFromOrigin]);

  const savedStagesList = useMemo(
    () => stagesWithRoutes.filter((item) => savedStageIds.includes(item.stage.id)),
    [stagesWithRoutes, savedStageIds]
  );

  const totalSavedCount = savedMatches.length + savedStagesList.length;

  const filteredRoutesTabMatches = useMemo(() => {
    if (routesTabFilter === 'CITY_BUS') {
      return allRoutesFromOrigin.filter(
        (m) => m.route.vehicleType === 'City Bus (33–60 Seater)'
      );
    }
    if (routesTabFilter === 'MATATU_14') {
      return allRoutesFromOrigin.filter(
        (m) =>
          m.route.vehicleType === 'Matatu (14-Seater)' ||
          m.route.vehicleType === 'Express Shuttle'
      );
    }
    return allRoutesFromOrigin;
  }, [allRoutesFromOrigin, routesTabFilter]);

  // Nominatim place search (matches MobileSearchCard.tsx)
  const submitPlaceSearch = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) {
      requestIdRef.current += 1;
      lastQueryRef.current = null;
      setOsmOutcome(null);
      setOsmLoading(false);
      return;
    }
    if (
      lastQueryRef.current === q.toLowerCase() &&
      (osmLoading || osmOutcome?.status === 'ok')
    ) {
      return;
    }
    lastQueryRef.current = q.toLowerCase();
    const id = ++requestIdRef.current;
    setOsmLoading(true);
    try {
      const outcome = await searchNominatimPlacesKenya(q);
      if (id === requestIdRef.current) {
        setOsmOutcome(outcome);
      }
    } catch {
      if (id === requestIdRef.current) {
        lastQueryRef.current = null;
        setOsmOutcome({
          status: 'error',
          places: [],
          fromCache: false,
          errorMessage: 'Check your connection and try again.',
        });
      }
    } finally {
      if (id === requestIdRef.current) {
        setOsmLoading(false);
      }
    }
  }, [query, osmLoading, osmOutcome]);

  // Auto-trigger Nominatim place search after brief debounce when on Search tab and local results are sparse
  useEffect(() => {
    if (viewMode !== 'search') return;
    const trimmed = query.trim();
    if (trimmed.length < 3) return;
    const timer = window.setTimeout(() => {
      submitPlaceSearch();
    }, 520);
    return () => window.clearTimeout(timer);
  }, [query, viewMode, submitPlaceSearch]);

  const destinationsSummary = useMemo(() => {
    const map = new Map<string, number>();
    searchResults.forEach((m) =>
      map.set(
        m.route.destinationArea,
        (map.get(m.route.destinationArea) ?? 0) + 1
      )
    );
    return Array.from(map.entries());
  }, [searchResults]);

  const stagesSummary = useMemo(() => {
    const map = new Map<string, { id: string; addr: string; n: number }>();
    searchResults.forEach((m) => {
      const cur = map.get(m.stage.name);
      map.set(m.stage.name, {
        id: m.stage.id,
        addr: m.stage.streetAddress,
        n: (cur?.n ?? 0) + 1,
      });
    });
    return Array.from(map.entries());
  }, [searchResults]);

  const shouldShowSearchGroup = (f: SearchFilter) =>
    searchFilter === 'All' || searchFilter === f;

  const renderPlaceRow = (place: NominatimPlaceResult) => {
    const { matchedRoutes } = matchPlaceToStageDatabase(
      place,
      selectedOriginId,
      userGpsCoords
    );
    const first = matchedRoutes[0];
    return (
      <button
        key={place.placeId}
        type="button"
        disabled={!first}
        onClick={() => first && openRoute(first)}
        className="m-list-row"
        style={{ opacity: first ? 1 : 0.65 }}
      >
        <Globe size={18} color="var(--stage-accent-electric)" />
        <div className="m-list-row__body">
          <div className="m-list-row__title">{place.title}</div>
          <div className="m-list-row__sub">
            {first
              ? `Place on the map. ${matchedRoutes.length} unverified demo route(s) mention it.`
              : 'Place found on the map, but it is not a confirmed boarding stage. STAGE has no route data for it yet.'}
          </div>
        </div>
        {first && <ChevronRight size={18} color="var(--stage-ink-secondary)" />}
      </button>
    );
  };

  const navItems: Array<{
    id: StageViewMode;
    label: string;
    icon: React.ReactNode;
    matches: StageViewMode[];
    badgeCount?: number;
  }> = [
    {
      id: 'overview',
      label: 'Home',
      icon: <Home size={20} />,
      matches: ['overview'],
    },
    {
      id: 'search',
      label: 'Search',
      icon: <Search size={20} />,
      matches: ['search'],
    },
    {
      id: 'results',
      label: 'Routes',
      icon: <Layers size={20} />,
      matches: ['results', 'stage-details', 'walking-nav'],
    },
    {
      id: 'saved',
      label: 'Saved',
      icon: <Bookmark size={20} />,
      matches: ['saved'],
      badgeCount: totalSavedCount,
    },
  ];

  const screenMotionProps = shouldReduceMotion
    ? {}
    : {
        initial: {
          opacity: 0,
          x: slideDirection === 0 ? 0 : slideDirection > 0 ? 22 : -22,
        },
        animate: { opacity: 1, x: 0 },
        exit: {
          opacity: 0,
          x: slideDirection === 0 ? 0 : slideDirection > 0 ? -18 : 18,
        },
        transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const },
      };

  return (
    <div
      className="stage-mobile-shell"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      {/* Top Header (consistent across all tabs) */}
      <header className="m-header">
        <div className="m-header__brand-col">
          <button
            type="button"
            className="m-brand-lockup"
            onClick={() => go('overview')}
            aria-label="STAGE — Return to Home"
          >
            <StageBrandMark size={26} />
            <span className="m-brand-lockup__word">STAGE</span>
          </button>

          <button
            type="button"
            className="m-loc-selector"
            onClick={() => setShowOriginPicker(true)}
            aria-label="Change starting location"
          >
            {isGpsActive ? (
              <Crosshair size={12} className="m-loc-selector__icon" />
            ) : (
              <MapPin size={12} className="m-loc-selector__icon" />
            )}
            <span>{isGpsActive ? 'Live GPS' : `${origin.shortName} CBD`}</span>
            <ChevronDown size={13} className="m-loc-selector__chev" />
          </button>
        </div>

        <button
          type="button"
          className="m-theme-btn"
          onClick={onToggleTheme}
          aria-label={`Switch to ${
            surfaceTheme === 'night' ? 'light' : 'dark'
          } theme`}
        >
          {surfaceTheme === 'night' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </header>

      {/* Main Mobile Content with directional tab transitions */}
      <main className="m-content">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={viewMode}
            className="m-tab-view"
            {...screenMotionProps}
          >
            {/* 1. HOME TAB (matches MobileHomeScreen.tsx) */}
            {viewMode === 'overview' && (
              <>
                <div className="m-hero">
                  <h1 className="m-hero__title">Where to?</h1>
                  <p className="m-hero__subtitle">
                    Find a place, route or stage
                  </p>
                </div>

                <div className="m-search-stack">
                  <form
                    className={`m-search-field ${
                      searchFocused ? 'm-search-field--focused' : ''
                    }`}
                    onSubmit={(e) => {
                      e.preventDefault();
                      recordRecentSearch(query);
                      go('search');
                    }}
                  >
                    <Search size={19} className="m-search-field__icon" />
                    <input
                      type="search"
                      className="m-search-field__input"
                      value={query}
                      onChange={(e) => onQueryChange(e.target.value)}
                      onFocus={() => setSearchFocused(true)}
                      onBlur={() => setSearchFocused(false)}
                      placeholder="e.g. Ngong, Westlands, 25…"
                      aria-label="Search destination, corridor, route or stage"
                    />
                    {query.length > 0 && (
                      <button
                        type="button"
                        className="m-search-field__clear"
                        onClick={() => onQueryChange('')}
                        aria-label="Clear search"
                      >
                        <XCircle size={18} />
                      </button>
                    )}
                  </form>

                  <button
                    type="button"
                    className={`m-loc-btn ${
                      isGpsActive ? 'm-loc-btn--active' : ''
                    }`}
                    onClick={
                      isGpsActive
                        ? () => setShowOriginPicker(true)
                        : onRequestGps
                    }
                    aria-label="My location"
                  >
                    <Crosshair
                      size={17}
                      color={
                        isGpsActive
                          ? 'var(--stage-accent-electric)'
                          : 'var(--stage-ink-secondary)'
                      }
                    />
                    <span className="m-loc-btn__label">
                      {isGpsLoading
                        ? 'Finding location…'
                        : isGpsActive
                        ? 'Live GPS active'
                        : 'My location'}
                    </span>
                    {!isGpsActive && !isGpsLoading && (
                      <ChevronRight size={17} color="var(--stage-ink-muted)" />
                    )}
                  </button>

                  {gpsError && (
                    <div className="m-gps-warning">
                      {gpsError} Using selected landmark.
                    </div>
                  )}
                </div>

                <hr className="m-divider" />

                {/* Popular Section */}
                <section className="m-section" aria-label="Popular destinations">
                  <div className="m-section__row">
                    <h2 className="m-section__title">Popular</h2>
                    <button
                      type="button"
                      className="m-section__link"
                      onClick={() => go('results')}
                    >
                      See all
                    </button>
                  </div>

                  <div className="m-popular-scroll" data-no-tab-swipe="true">
                    {POPULAR_DESTINATIONS.map((name) => {
                      const n = countRoutesFor(allRoutesFromOrigin, name);
                      const tone =
                        DESTINATION_TONES[name] ?? DESTINATION_TONES.Juja;
                      return (
                        <button
                          key={name}
                          type="button"
                          className="m-dest-card"
                          onClick={() => {
                            recordRecentSearch(name);
                            onQueryChange(name);
                            go('search');
                          }}
                          aria-label={`${name}, ${n} ${
                            n === 1 ? 'route' : 'routes'
                          }`}
                        >
                          <div
                            className="m-dest-card__art"
                            style={{
                              backgroundColor: tone.bg,
                              color: tone.fg,
                            }}
                          >
                            <span className="m-dest-card__arc1" />
                            <span className="m-dest-card__arc2" />
                            <span
                              className="m-dest-card__pin"
                              style={{ backgroundColor: tone.fg }}
                            />
                          </div>
                          <div className="m-dest-card__body">
                            <span className="m-dest-card__name">{name}</span>
                            <span className="m-dest-card__count">
                              {n} {n === 1 ? 'route' : 'routes'}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <hr className="m-divider" />

                {/* Nearby Boarding Stages & Routes Section */}
                <section className="m-section" aria-label="Nearby routes">
                  <div className="m-section__row">
                    <h2 className="m-section__title">Nearby</h2>
                    <button
                      type="button"
                      className="m-section__link"
                      onClick={() => go('results')}
                    >
                      All {allRoutesFromOrigin.length} routes
                    </button>
                  </div>

                  <div className="m-route-stack">
                    {nearbyRoutes.map((m) => (
                      <MobileRouteCardWeb
                        key={m.route.id}
                        match={m}
                        variant="nearby"
                        onPress={() => openRoute(m)}
                        saved={isRouteSaved(m.route.id)}
                        onToggleSave={() => onToggleSaveRoute(m.route.id)}
                      />
                    ))}
                  </div>
                </section>
              </>
            )}

            {/* 2. SEARCH TAB (matches MobileSearchCard.tsx) */}
            {viewMode === 'search' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="m-page-header">
                  <div>
                    <h1 className="m-page-title">Search</h1>
                    <p className="m-page-subtitle">
                      Search destinations, route numbers or CBD boarding stages
                    </p>
                  </div>
                </div>

                <form
                  className="m-search-field m-search-field--focused"
                  onSubmit={(e) => {
                    e.preventDefault();
                    recordRecentSearch(query);
                    submitPlaceSearch();
                  }}
                >
                  <button
                    type="button"
                    onClick={() => go('overview')}
                    aria-label="Back to Home"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--stage-ink-primary)',
                    }}
                  >
                    <ArrowLeft size={20} />
                  </button>
                  <input
                    type="search"
                    className="m-search-field__input"
                    value={query}
                    onChange={(e) => {
                      onQueryChange(e.target.value);
                      requestIdRef.current += 1;
                      lastQueryRef.current = null;
                      setOsmLoading(false);
                      setOsmOutcome(null);
                    }}
                    placeholder="Find a place, route or stage"
                    aria-label="Find a place, route or stage"
                  />
                  {query.length > 0 && (
                    <button
                      type="button"
                      className="m-search-field__clear"
                      onClick={() => {
                        onQueryChange('');
                        requestIdRef.current += 1;
                        lastQueryRef.current = null;
                        setOsmLoading(false);
                        setOsmOutcome(null);
                      }}
                      aria-label="Clear search"
                    >
                      <X size={18} />
                    </button>
                  )}
                </form>

                {/* Recent Searches */}
                {query.trim().length === 0 && recentSearches.length > 0 && (
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div className="m-group-label">Recent searches</div>
                      <button
                        type="button"
                        className="m-section__link"
                        style={{ fontSize: 12 }}
                        onClick={clearRecentSearches}
                      >
                        Clear
                      </button>
                    </div>
                    <div className="m-chip-grid">
                      {recentSearches.map((item) => (
                        <button
                          key={item}
                          type="button"
                          className="m-chip"
                          onClick={() => {
                            recordRecentSearch(item);
                            onQueryChange(item);
                          }}
                        >
                          <Clock
                            size={12}
                            color="var(--stage-ink-secondary)"
                          />
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick Destination Suggestions when query is empty */}
                {query.trim().length === 0 && (
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                  >
                    <div className="m-group-label">Suggested destinations</div>
                    <div className="m-chip-grid">
                      {QUICK_DESTINATION_SUGGESTIONS.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          className="m-chip"
                          onClick={() => {
                            recordRecentSearch(suggestion);
                            onQueryChange(suggestion);
                          }}
                        >
                          <MapPin
                            size={12}
                            color="var(--stage-accent-electric)"
                          />
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div
                  className="m-filter-pills"
                  role="group"
                  aria-label="Search filters"
                  data-no-tab-swipe="true"
                >
                  {SEARCH_FILTERS.map((f) => {
                    const active = f === searchFilter;
                    return (
                      <button
                        key={f}
                        type="button"
                        className={`m-filter-pill ${
                          active ? 'm-filter-pill--active' : ''
                        }`}
                        onClick={() => setSearchFilter(f)}
                        aria-pressed={active}
                      >
                        {f}
                      </button>
                    );
                  })}
                </div>

                {shouldShowSearchGroup('Destinations') &&
                  destinationsSummary.length > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div className="m-group-label">Destinations</div>
                      {destinationsSummary.map(([name, n]) => (
                        <button
                          key={name}
                          type="button"
                          className="m-list-row"
                          onClick={() => onQueryChange(name)}
                        >
                          <MapPin
                            size={18}
                            color="var(--stage-accent-electric)"
                          />
                          <div className="m-list-row__body">
                            <div className="m-list-row__title">{name}</div>
                            <div className="m-list-row__sub">
                              {n} {n === 1 ? 'route' : 'routes'}
                            </div>
                          </div>
                          <ChevronRight
                            size={18}
                            color="var(--stage-ink-secondary)"
                          />
                        </button>
                      ))}
                    </div>
                  )}

                {shouldShowSearchGroup('Stages') && stagesSummary.length > 0 && (
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                  >
                    <div className="m-group-label">Stages</div>
                    {stagesSummary.map(([name, s]) => (
                      <button
                        key={name}
                        type="button"
                        className="m-list-row"
                        onClick={() => onQueryChange(name.replace(' (Demo)', ''))}
                      >
                        <Flag size={18} color="var(--stage-accent-electric)" />
                        <div className="m-list-row__body">
                          <div className="m-list-row__title">
                            {name.replace(' (Demo)', '')}
                          </div>
                          <div className="m-list-row__sub">
                            {s.addr} · {s.n} {s.n === 1 ? 'route' : 'routes'}
                          </div>
                        </div>
                        <ChevronRight
                          size={18}
                          color="var(--stage-ink-secondary)"
                        />
                      </button>
                    ))}
                  </div>
                )}

                {shouldShowSearchGroup('Routes') && searchResults.length > 0 && (
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                  >
                    <div className="m-group-label">
                      Routes ({searchResults.length})
                    </div>
                    <div className="m-route-stack">
                      {searchResults.map((m) => (
                        <MobileRouteCardWeb
                          key={m.route.id}
                          match={m}
                          variant="result"
                          selected={m.route.id === activeMatch.route.id}
                          onPress={() => openRoute(m)}
                          saved={isRouteSaved(m.route.id)}
                          onToggleSave={() => onToggleSaveRoute(m.route.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {osmLoading && (
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                  >
                    <div className="m-group-label">Places · OpenStreetMap</div>
                    {[0, 1].map((i) => (
                      <div key={i} className="m-skeleton">
                        <div className="m-skeleton__line m-skeleton__line--short" />
                        <div className="m-skeleton__line m-skeleton__line--long" />
                      </div>
                    ))}
                  </div>
                )}

                {osmOutcome &&
                  osmOutcome.status === 'ok' &&
                  osmOutcome.places.length > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div className="m-group-label">
                        Places · OpenStreetMap (not boarding stages)
                      </div>
                      {osmOutcome.places.slice(0, 5).map(renderPlaceRow)}
                    </div>
                  )}

                {osmOutcome && osmOutcome.status !== 'ok' && !osmLoading && (
                  <div className="m-empty-box">
                    <WifiOff size={20} color="var(--stage-ink-muted)" />
                    <div className="m-empty-box__title">
                      {osmOutcome.status === 'empty'
                        ? 'No places found'
                        : 'Search unavailable'}
                    </div>
                    <div className="m-empty-box__sub">
                      {osmOutcome.errorMessage ??
                        'Try another place or landmark.'}
                    </div>
                    {osmOutcome.status !== 'empty' && (
                      <button
                        type="button"
                        className="m-empty-box__cta"
                        onClick={submitPlaceSearch}
                      >
                        Try again
                      </button>
                    )}
                  </div>
                )}

                {searchResults.length === 0 && !osmLoading && (
                  <div className="m-empty-box">
                    <Compass size={22} color="var(--stage-ink-muted)" />
                    <div className="m-empty-box__title">No matching routes</div>
                    <div className="m-empty-box__sub">
                      Try another destination, corridor or stage name, or press
                      Enter to search Kenya map places.
                    </div>
                    {query.trim().length > 0 && (
                      <button
                        type="button"
                        className="m-empty-box__cta"
                        onClick={() => onQueryChange('')}
                      >
                        Reset search
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 3. ROUTES TAB (Android-style Routes & Boarding Stages directory) */}
            {viewMode === 'results' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="m-page-header">
                  <div>
                    <h1 className="m-page-title">
                      {routesTabFilter === 'STAGES'
                        ? 'Boarding stages'
                        : 'All routes'}
                    </h1>
                    <p className="m-page-subtitle">
                      From {isGpsActive ? 'your live GPS' : origin.name}
                    </p>
                  </div>
                  <span className="m-page-count">
                    {routesTabFilter === 'STAGES'
                      ? `${stagesWithRoutes.length} stages`
                      : `${filteredRoutesTabMatches.length} routes`}
                  </span>
                </div>

                {/* Vehicle & Stage view filter pills */}
                <div
                  className="m-filter-pills"
                  role="group"
                  aria-label="Filter routes or boarding stages"
                  data-no-tab-swipe="true"
                >
                  {(
                    [
                      { id: 'ALL', label: 'All Routes' },
                      { id: 'CITY_BUS', label: 'City Bus' },
                      { id: 'MATATU_14', label: '14-Seater / Shuttle' },
                      { id: 'STAGES', label: 'Boarding Stages' },
                    ] as Array<{ id: RoutesTabFilter; label: string }>
                  ).map((pill) => {
                    const active = routesTabFilter === pill.id;
                    return (
                      <button
                        key={pill.id}
                        type="button"
                        className={`m-filter-pill ${
                          active ? 'm-filter-pill--active' : ''
                        }`}
                        onClick={() => setRoutesTabFilter(pill.id)}
                        aria-pressed={active}
                      >
                        {pill.label}
                      </button>
                    );
                  })}
                </div>

                {routesTabFilter === 'STAGES' ? (
                  <div className="m-route-stack">
                    {stagesWithRoutes.map(({ stage, matches }) => (
                      <MobileStageCardWeb
                        key={stage.id}
                        stage={stage}
                        matchesForStage={matches}
                        saved={isStageSaved(stage.id)}
                        onToggleSave={() => toggleSaveStage(stage.id)}
                        onOpenStageRoute={openRoute}
                        onWalkToStage={startWalkToStage}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="m-route-stack">
                    {filteredRoutesTabMatches.map((m) => (
                      <MobileRouteCardWeb
                        key={m.route.id}
                        match={m}
                        variant="result"
                        selected={m.route.id === activeMatch.route.id}
                        onPress={() => openRoute(m)}
                        saved={isRouteSaved(m.route.id)}
                        onToggleSave={() => onToggleSaveRoute(m.route.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 4. SAVED TAB (matches MobileSavedScreen.tsx + saved boarding stages) */}
            {viewMode === 'saved' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="m-page-header">
                  <div>
                    <h1 className="m-page-title">Saved</h1>
                    <p className="m-page-subtitle">
                      Bookmarked routes and boarding stages for quick access
                    </p>
                  </div>
                  {totalSavedCount > 0 && (
                    <span className="m-page-count">
                      {totalSavedCount} saved
                    </span>
                  )}
                </div>

                {totalSavedCount === 0 ? (
                  <div className="m-empty-box">
                    <Bookmark size={26} color="var(--stage-ink-muted)" />
                    <div className="m-empty-box__title">Nothing saved yet</div>
                    <div className="m-empty-box__sub">
                      Tap the bookmark icon on any route or boarding stage to
                      keep it here for quick access.
                    </div>
                    <button
                      type="button"
                      className="m-empty-box__cta"
                      onClick={() => go('results')}
                    >
                      <Layers size={15} />
                      Browse routes &amp; stages
                    </button>
                  </div>
                ) : (
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
                  >
                    {savedMatches.length > 0 && (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <div className="m-group-label">
                          Saved routes ({savedMatches.length})
                        </div>
                        <div className="m-route-stack">
                          {savedMatches.map((m) => (
                            <MobileRouteCardWeb
                              key={m.route.id}
                              match={m}
                              variant="nearby"
                              onPress={() => openRoute(m)}
                              saved
                              onToggleSave={() => onToggleSaveRoute(m.route.id)}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {savedStagesList.length > 0 && (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <div className="m-group-label">
                          Saved boarding stages ({savedStagesList.length})
                        </div>
                        <div className="m-route-stack">
                          {savedStagesList.map(({ stage, matches }) => (
                            <MobileStageCardWeb
                              key={stage.id}
                              stage={stage}
                              matchesForStage={matches}
                              saved
                              onToggleSave={() => toggleSaveStage(stage.id)}
                              onOpenStageRoute={openRoute}
                              onWalkToStage={startWalkToStage}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      className="m-btn-outline"
                      onClick={() => {
                        savedMatches.forEach((m) =>
                          onToggleSaveRoute(m.route.id)
                        );
                        setSavedStageIds([]);
                        try {
                          window.localStorage.removeItem(SAVED_STAGES_KEY);
                        } catch {
                          // ignore
                        }
                      }}
                      aria-label="Clear all saved routes and stages"
                    >
                      <Trash2 size={15} color="var(--stage-ink-secondary)" />
                      Clear all saved items
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 5. ROUTE DETAILS VIEW (matches MobileStageDetailAndNav.tsx) */}
            {viewMode === 'stage-details' && activeMatch && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="m-detail-topbar">
                  <button
                    type="button"
                    onClick={() =>
                      go(prevMode === 'stage-details' ? 'overview' : prevMode)
                    }
                    aria-label="Back"
                    style={{
                      width: 36,
                      height: 36,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      color: 'var(--stage-ink-primary)',
                    }}
                  >
                    <ArrowLeft size={22} />
                  </button>
                  <span className="m-detail-topbar__title">Route Details</span>
                  <button
                    type="button"
                    className={`m-bookmark-btn ${
                      isRouteSaved(activeMatch.route.id)
                        ? 'm-bookmark-btn--saved'
                        : ''
                    }`}
                    onClick={() => onToggleSaveRoute(activeMatch.route.id)}
                    aria-label={
                      isRouteSaved(activeMatch.route.id)
                        ? 'Remove from saved'
                        : 'Save route'
                    }
                  >
                    <Bookmark
                      size={21}
                      fill={
                        isRouteSaved(activeMatch.route.id)
                          ? 'currentColor'
                          : 'none'
                      }
                    />
                  </button>
                </div>

                <div className="m-detail-card m-detail-card--row">
                  <div
                    className="m-route-badge"
                    style={{
                      width: 58,
                      height: 58,
                      borderRadius: 17.4,
                      fontSize: 22,
                    }}
                  >
                    {activeMatch.route.routeNumber}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 800,
                        color: 'var(--stage-ink-primary)',
                      }}
                    >
                      {activeMatch.route.destinationName}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: 'var(--stage-ink-secondary)',
                      }}
                    >
                      {activeMatch.origin.shortName} →{' '}
                      {activeMatch.route.destinationName}
                    </div>
                    <div>
                      <span className="m-verify-badge">
                        <AlertTriangle size={11} />
                        Needs verification
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <h2
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: 'var(--stage-ink-primary)',
                    }}
                  >
                    Boarding stage
                  </h2>
                  <button
                    type="button"
                    className="m-section__link"
                    onClick={() => toggleSaveStage(activeMatch.stage.id)}
                  >
                    {isStageSaved(activeMatch.stage.id)
                      ? 'Stage saved ✓'
                      : 'Save stage'}
                  </button>
                </div>

                <div className="m-detail-card">
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      gap: 12,
                      alignItems: 'flex-start',
                    }}
                  >
                    <MapPin
                      size={22}
                      color="var(--stage-accent-electric)"
                      style={{ marginTop: 2, flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 700,
                          color: 'var(--stage-ink-primary)',
                        }}
                      >
                        {activeMatch.stage.name.replace(' (Demo)', '')}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: 'var(--stage-ink-secondary)',
                          marginTop: 2,
                        }}
                      >
                        {activeMatch.stage.streetAddress}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      gap: 8,
                      alignItems: 'center',
                    }}
                  >
                    <User size={14} color="var(--stage-ink-secondary)" />
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--stage-ink-primary)',
                      }}
                    >
                      {activeMatch.walking.totalDistanceMeters > 2500
                        ? `${formatWalkDistance(
                            activeMatch.walking.totalDistanceMeters
                          )} away`
                        : `About ${
                            activeMatch.walking.estimatedMinutes
                          } min (${formatWalkDistance(
                            activeMatch.walking.totalDistanceMeters
                          )})`}
                    </span>
                  </div>

                  <p
                    style={{
                      fontSize: 14,
                      lineHeight: '20px',
                      color: 'var(--stage-ink-secondary)',
                    }}
                  >
                    {activeMatch.stage.bayDescription}
                  </p>

                  <button
                    type="button"
                    className="m-btn-outline m-btn-outline--hero"
                    onClick={() => go('walking-nav')}
                  >
                    <Globe size={16} color="var(--stage-accent-electric)" />
                    Show map
                  </button>
                </div>

                <h2
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: 'var(--stage-ink-primary)',
                  }}
                >
                  About this route
                </h2>
                <p
                  style={{
                    fontSize: 14,
                    lineHeight: '20px',
                    color: 'var(--stage-ink-secondary)',
                  }}
                >
                  {activeMatch.route.boardingTip} Via{' '}
                  {activeMatch.route.corridorName}.
                </p>
                <p
                  style={{
                    fontSize: 12.5,
                    lineHeight: '17px',
                    fontWeight: 500,
                    color: 'var(--stage-amber)',
                  }}
                >
                  {activeMatch.route.verificationNote}
                </p>

                <h2
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: 'var(--stage-ink-primary)',
                  }}
                >
                  Stops
                </h2>
                <div className="m-stops-timeline">
                  {activeMatch.route.popularStops.map((stop, idx) => {
                    const isLast =
                      idx === activeMatch.route.popularStops.length - 1;
                    return (
                      <div key={stop} className="m-stop-row">
                        <div className="m-stop-rail">
                          <span className="m-stop-dot" />
                          {!isLast && <span className="m-stop-line" />}
                        </div>
                        <div className="m-stop-name">{stop}</div>
                      </div>
                    );
                  })}
                </div>

                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
                >
                  <a
                    href={buildGoogleMapsWalkingUrl(
                      activeMatch.origin.coordinates,
                      activeMatch.stage.coordinates,
                      activeMatch.stage.name
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="m-btn-outline"
                  >
                    <Compass size={16} color="var(--stage-accent-electric)" />
                    Open Maps
                  </a>
                  <button
                    type="button"
                    className="m-btn-solid"
                    onClick={() => go('walking-nav')}
                  >
                    <Navigation size={16} />
                    Walk there
                  </button>
                </div>
              </div>
            )}

            {/* 6. MAP & WALKING NAVIGATION VIEW (Full-screen Android MobileMapScreen equivalent) */}
            {viewMode === 'walking-nav' && activeMatch && (
              <MobileWebMapScreen
                selectedMatch={activeMatch}
                userCoords={userGpsCoords}
                isDarkTheme={surfaceTheme === 'night'}
                onBack={() => go('stage-details')}
                onRequestLocation={onRequestGps}
                onChangeOrigin={() => setShowOriginPicker(true)}
                onSelectStageById={onSelectStageOnRadar}
                onOpenSettings={onOpenSettings}
                permissionBlocked={permissionBlocked}
                locationStatus={locationStatus}
                locationMessage={locationMessage ?? gpsError ?? undefined}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Unverified Demo Data Notice Bar (matches MobileHeader DemoDataNoticeBar) */}
        <button
          type="button"
          className="m-demo-notice"
          onClick={() => setDemoNoticeExpanded((p) => !p)}
          aria-label="Unverified demo data notice. Tap to expand."
        >
          <Shield size={13} style={{ flexShrink: 0 }} />
          <span
            className={`m-demo-notice__text ${
              demoNoticeExpanded ? '' : 'm-demo-notice__text--clamped'
            }`}
          >
            {UNVERIFIED_DEMO_BANNER}
          </span>
        </button>
      </main>

      {/* Fixed Bottom Navigation Bar (Home, Search, Routes, Saved — hidden on full-screen map) */}
      {viewMode !== 'walking-nav' && (
        <nav
          className="m-bottom-nav"
          role="tablist"
          aria-label="Primary navigation"
        >
          {navItems.map((item) => {
            const active = item.matches.includes(viewMode);
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={`${item.label} tab`}
                className={`m-bottom-nav__tab ${
                  active ? 'm-bottom-nav__tab--active' : ''
                }`}
                onClick={() => go(item.id)}
              >
                <span className="m-bottom-nav__pill">
                  {item.icon}
                  {typeof item.badgeCount === 'number' &&
                    item.badgeCount > 0 && (
                      <span
                        className="m-bottom-nav__badge"
                        aria-label={`${item.badgeCount} saved`}
                      >
                        {item.badgeCount}
                      </span>
                    )}
                </span>
                <span className="m-bottom-nav__label">{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      {/* Origin Picker Modal Sheet (matches apps/mobile/src/components/OriginPicker.tsx) */}
      {showOriginPicker && (
        <div
          className="m-modal-backdrop"
          onClick={() => setShowOriginPicker(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Select starting location"
          data-no-tab-swipe="true"
        >
          <div
            className="m-origin-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="m-origin-sheet__grab" />
            <div className="m-origin-sheet__title">Start from</div>

            <div className="m-origin-sheet__list">
              <button
                type="button"
                className="m-origin-row"
                onClick={() => {
                  onRequestGps();
                  setShowOriginPicker(false);
                }}
              >
                {isGpsLoading ? (
                  <Loader2
                    size={18}
                    color="var(--stage-accent-electric)"
                    className="m-spin"
                  />
                ) : (
                  <Crosshair size={18} color="var(--stage-accent-electric)" />
                )}
                <div style={{ flex: 1 }}>
                  <div className="m-origin-row__name">My location</div>
                  {gpsError && (
                    <div
                      className="m-origin-row__sub"
                      style={{ color: 'var(--stage-amber)' }}
                    >
                      {gpsError}
                    </div>
                  )}
                </div>
                {isGpsActive && (
                  <Check size={18} color="var(--stage-accent-electric)" />
                )}
              </button>

              {permissionBlocked && onOpenSettings && (
                <button
                  type="button"
                  onClick={() => {
                    setShowOriginPicker(false);
                    onOpenSettings();
                  }}
                  style={{
                    padding: '10px 4px 10px 30px',
                    textAlign: 'left',
                    fontSize: 13.5,
                    fontWeight: 700,
                    color: 'var(--stage-accent-electric)',
                  }}
                >
                  Open location settings help
                </button>
              )}

              {NAIROBI_CBD_ORIGINS.map((o) => {
                const active = !isGpsActive && o.id === selectedOriginId;
                return (
                  <button
                    key={o.id}
                    type="button"
                    className="m-origin-row"
                    onClick={() => {
                      onClearGps();
                      onSelectOrigin(o.id);
                      setShowOriginPicker(false);
                    }}
                  >
                    <MapPin size={18} color="var(--stage-ink-secondary)" />
                    <div style={{ flex: 1 }}>
                      <div className="m-origin-row__name">{o.name}</div>
                      <div className="m-origin-row__sub">{o.streetContext}</div>
                    </div>
                    {active && (
                      <Check size={18} color="var(--stage-accent-electric)" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Browser Location Permission Help Modal */}
      {permissionHelpVisible && (
        <div
          className="m-modal-backdrop"
          onClick={onClosePermissionHelp}
          role="dialog"
          aria-modal="true"
          aria-label="How to enable browser location permission"
          data-no-tab-swipe="true"
        >
          <div
            className="m-origin-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="m-origin-sheet__grab" />
            <div className="m-origin-sheet__title">Enable Location Access</div>
            <p
              style={{
                fontSize: 13.5,
                lineHeight: '19px',
                color: 'var(--stage-ink-secondary)',
              }}
            >
              Browser security prevents web apps from opening device settings
              directly. To enable live GPS in STAGE:
            </p>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                fontSize: 13,
                lineHeight: '18px',
                color: 'var(--stage-ink-primary)',
                padding: '8px 0',
              }}
            >
              <div>
                <strong>iPhone Safari:</strong> Tap the <strong>aA</strong> or{' '}
                <strong>Website Settings</strong> icon in the address bar →{' '}
                <strong>Location</strong> → <strong>Allow</strong>, or check{' '}
                <em>Settings → Privacy &amp; Security → Location Services → Safari Websites</em>.
              </div>
              <div>
                <strong>Android Chrome:</strong> Tap the{' '}
                <strong>Lock / Tune</strong> icon next to the URL →{' '}
                <strong>Permissions</strong> → <strong>Location</strong> →{' '}
                <strong>Allow</strong>.
              </div>
            </div>
            <button
              type="button"
              className="m-btn-solid"
              onClick={() => {
                onClosePermissionHelp?.();
                onRequestGps();
              }}
            >
              Retry Location
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
