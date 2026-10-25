import { useCallback, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SAVED_ROUTES_KEY = 'stage.mobile.savedRoutes.v1';

/** Load saved route ids from storage (AsyncStorage on native, localStorage on web). */
async function loadSavedIds(): Promise<string[]> {
  try {
    if (Platform.OS === 'web') {
      const raw = (globalThis as unknown as { localStorage?: Storage }).localStorage?.getItem(SAVED_ROUTES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter((i): i is string => typeof i === 'string');
      }
      return [];
    }
    const raw = await AsyncStorage.getItem(SAVED_ROUTES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((i): i is string => typeof i === 'string');
    }
    return [];
  } catch {
    return [];
  }
}

/** Persist saved route ids. */
async function persistSavedIds(ids: string[]): Promise<void> {
  try {
    const payload = JSON.stringify(ids);
    if (Platform.OS === 'web') {
      (globalThis as unknown as { localStorage?: Storage }).localStorage?.setItem(SAVED_ROUTES_KEY, payload);
    } else {
      await AsyncStorage.setItem(SAVED_ROUTES_KEY, payload);
    }
  } catch {
    // ignore write errors
  }
}

export function useSavedRoutes() {
  const [savedRouteIds, setSavedRouteIds] = useState<string[]>([]);

  // Load once on mount
  useEffect(() => {
    let cancelled = false;
    loadSavedIds().then((ids) => {
      if (!cancelled) setSavedRouteIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const isRouteSaved = useCallback(
    (routeId: string) => savedRouteIds.includes(routeId),
    [savedRouteIds]
  );

  const toggleSaveRoute = useCallback((routeId: string) => {
    setSavedRouteIds((prev) => {
      const set = new Set(prev);
      if (set.has(routeId)) {
        set.delete(routeId);
      } else {
        set.add(routeId);
      }
      const next = Array.from(set);
      // Persist asynchronously (fire-and-forget)
      persistSavedIds(next);
      return next;
    });
  }, []);

  return { savedRouteIds, isRouteSaved, toggleSaveRoute };
}
