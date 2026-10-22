import { useCallback, useState } from 'react';

const SAVED_ROUTES_KEY = 'stage.mobile.savedRoutes.v1';
let memorySavedIds: string[] = ['rt-111-ngong', 'rt-105-kikuyu'];

function loadInitialSavedRouteIds(): string[] {
  try {
    const g = globalThis as unknown as {
      localStorage?: { getItem: (k: string) => string | null };
    };
    const raw = g.localStorage?.getItem(SAVED_ROUTES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        memorySavedIds = parsed.filter((id): id is string => typeof id === 'string');
        return memorySavedIds;
      }
    }
  } catch {
    // Fallback to in-memory saved routes
  }
  return memorySavedIds;
}

function persistSavedRouteIds(ids: string[]): void {
  memorySavedIds = ids;
  try {
    const g = globalThis as unknown as {
      localStorage?: { setItem: (k: string, v: string) => void };
    };
    g.localStorage?.setItem(SAVED_ROUTES_KEY, JSON.stringify(ids));
  } catch {
    // Ignore storage write errors
  }
}

export function useSavedRoutes() {
  const [savedRouteIds, setSavedRouteIds] = useState<string[]>(() =>
    loadInitialSavedRouteIds()
  );

  const isRouteSaved = useCallback(
    (routeId: string) => savedRouteIds.includes(routeId),
    [savedRouteIds]
  );

  const toggleSaveRoute = useCallback((routeId: string) => {
    setSavedRouteIds((prev) => {
      const next = prev.includes(routeId)
        ? prev.filter((id) => id !== routeId)
        : [routeId, ...prev];
      persistSavedRouteIds(next);
      return next;
    });
  }, []);

  return {
    savedRouteIds,
    isRouteSaved,
    toggleSaveRoute,
  };
}

