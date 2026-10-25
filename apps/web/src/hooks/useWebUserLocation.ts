import { useCallback, useEffect, useRef, useState } from 'react';
import {
  calculateDistanceMeters,
  Coordinates,
  isValidCoordinates,
} from '@stage/shared';

export type WebLocationPermissionState =
  | 'idle' // permission not requested yet
  | 'loading' // acquiring a fix
  | 'granted'
  | 'denied'
  | 'disabled' // geolocation unsupported or insecure context
  | 'error'; // timeout / unavailable / invalid reading

export interface UseWebUserLocationResult {
  status: WebLocationPermissionState;
  coordinates: Coordinates | null;
  accuracyMeters: number | null;
  statusMessage: string;
  permissionBlocked: boolean;
  permissionHelpVisible: boolean;
  requestCurrentLocation: () => Promise<Coordinates | null>;
  clearCurrentLocation: () => void;
  openSystemSettings: () => void;
  closePermissionHelp: () => void;
}

const LOCATION_TIMEOUT_MS = 12000;
const MIN_WATCH_DISTANCE_METERS = 25;
const IDLE_MESSAGE =
  'Location not requested. Using the selected Nairobi CBD starting point.';

function toCoords(pos: GeolocationPosition): Coordinates | null {
  const c = {
    lat: Number(pos.coords.latitude.toFixed(6)),
    lng: Number(pos.coords.longitude.toFixed(6)),
  };
  return isValidCoordinates(c) ? c : null;
}

export function useWebUserLocation(): UseWebUserLocationResult {
  const [status, setStatus] = useState<WebLocationPermissionState>('idle');
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>(IDLE_MESSAGE);
  const [permissionBlocked, setPermissionBlocked] = useState<boolean>(false);
  const [permissionHelpVisible, setPermissionHelpVisible] =
    useState<boolean>(false);

  const watchIdRef = useRef<number | null>(null);
  const lastWatchedCoordsRef = useRef<Coordinates | null>(null);
  const inFlightRef = useRef<Promise<Coordinates | null> | null>(null);

  const stopWatching = useCallback(() => {
    if (
      watchIdRef.current !== null &&
      typeof navigator !== 'undefined' &&
      navigator.geolocation
    ) {
      try {
        navigator.geolocation.clearWatch(watchIdRef.current);
      } catch {
        // ignore
      }
      watchIdRef.current = null;
    }
  }, []);

  useEffect(() => stopWatching, [stopWatching]);

  const startWatching = useCallback(() => {
    if (
      watchIdRef.current !== null ||
      typeof navigator === 'undefined' ||
      !navigator.geolocation
    ) {
      return;
    }
    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const next = toCoords(pos);
          if (!next) return;
          // Apply 25m distance interval filter matching Android Location.watchPositionAsync
          if (lastWatchedCoordsRef.current) {
            const moved = calculateDistanceMeters(
              lastWatchedCoordsRef.current,
              next
            );
            if (moved < MIN_WATCH_DISTANCE_METERS) {
              return;
            }
          }
          lastWatchedCoordsRef.current = next;
          setCoordinates(next);
          setAccuracyMeters(
            typeof pos.coords.accuracy === 'number'
              ? Math.round(pos.coords.accuracy)
              : null
          );
          setStatus('granted');
          setStatusMessage('Using your live location.');
        },
        () => {
          // Keep existing fix if background watch encounters a transient error
        },
        {
          enableHighAccuracy: true,
          maximumAge: 8000,
          timeout: LOCATION_TIMEOUT_MS,
        }
      );
    } catch {
      // Ignore watch setup errors; initial fix is already stored
    }
  }, []);

  const acquire = useCallback(async (): Promise<Coordinates | null> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setCoordinates(null);
      setStatus('disabled');
      setStatusMessage(
        'Location services are not supported by this browser. Choose a starting point manually.'
      );
      return null;
    }

    setStatus('loading');
    setStatusMessage('Finding your location…');

    try {
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const perm = await navigator.permissions.query({
            name: 'geolocation',
          });
          if (perm.state === 'denied') {
            setCoordinates(null);
            setStatus('denied');
            setPermissionBlocked(true);
            setStatusMessage(
              'Location permission is blocked in your browser. Enable it in site settings, or choose a starting point manually.'
            );
            return null;
          }
        } catch {
          // Safari versions that do not support permissions.query('geolocation') fall through to getCurrentPosition
        }
      }

      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: LOCATION_TIMEOUT_MS,
          maximumAge: 10000,
        });
      });

      const fix = toCoords(pos);
      if (!fix) {
        setCoordinates(null);
        setStatus('error');
        setStatusMessage(
          'The browser returned an invalid position. Please retry.'
        );
        return null;
      }

      lastWatchedCoordsRef.current = fix;
      setCoordinates(fix);
      setAccuracyMeters(
        typeof pos.coords.accuracy === 'number'
          ? Math.round(pos.coords.accuracy)
          : null
      );
      setPermissionBlocked(false);
      setStatus('granted');
      setStatusMessage('Using your live location.');
      startWatching();
      return fix;
    } catch (err: unknown) {
      setCoordinates(null);
      const geoErr = err as { code?: number; message?: string } | undefined;
      if (geoErr && geoErr.code === 1) {
        setStatus('denied');
        setPermissionBlocked(true);
        setStatusMessage(
          'Location permission was denied. You can still choose a starting point manually.'
        );
        return null;
      }
      if (geoErr && geoErr.code === 3) {
        setStatus('error');
        setStatusMessage(
          'Could not get a GPS fix in time. Try near a window or outdoors, then retry.'
        );
        return null;
      }
      setStatus('error');
      setStatusMessage(
        'Location is unavailable right now. Retry, or choose a starting point manually.'
      );
      return null;
    }
  }, [startWatching]);

  const requestCurrentLocation = useCallback(() => {
    if (!inFlightRef.current) {
      inFlightRef.current = acquire().finally(() => {
        inFlightRef.current = null;
      });
    }
    return inFlightRef.current;
  }, [acquire]);

  const clearCurrentLocation = useCallback(() => {
    stopWatching();
    lastWatchedCoordsRef.current = null;
    setCoordinates(null);
    setAccuracyMeters(null);
    setStatus('idle');
    setStatusMessage(IDLE_MESSAGE);
  }, [stopWatching]);

  const openSystemSettings = useCallback(() => {
    setPermissionHelpVisible(true);
  }, []);

  const closePermissionHelp = useCallback(() => {
    setPermissionHelpVisible(false);
  }, []);

  return {
    status,
    coordinates,
    accuracyMeters,
    statusMessage,
    permissionBlocked,
    permissionHelpVisible,
    requestCurrentLocation,
    clearCurrentLocation,
    openSystemSettings,
    closePermissionHelp,
  };
}

