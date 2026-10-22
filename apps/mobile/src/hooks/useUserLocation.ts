import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import * as Location from 'expo-location';
import { Coordinates, isValidCoordinates } from '@stage/shared';

export type LocationPermissionState =
  | 'idle' // permission not requested yet
  | 'loading' // acquiring a fix
  | 'granted'
  | 'denied'
  | 'disabled' // device location services are off
  | 'error'; // timeout / unavailable / invalid reading

export interface UseUserLocationResult {
  status: LocationPermissionState;
  coordinates: Coordinates | null;
  /** Horizontal accuracy of the latest fix in metres, when the device reports it. */
  accuracyMeters: number | null;
  statusMessage: string;
  /** True when Android will no longer show the permission prompt (needs system settings). */
  permissionBlocked: boolean;
  requestCurrentLocation: () => Promise<Coordinates | null>;
  clearCurrentLocation: () => void;
  openSystemSettings: () => void;
}

const LOCATION_TIMEOUT_MS = 12000;
const IDLE_MESSAGE =
  'Location not requested. Using the selected Nairobi CBD starting point.';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('LOCATION_TIMEOUT')), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

function toCoords(pos: Location.LocationObject): Coordinates | null {
  const c = {
    lat: Number(pos.coords.latitude.toFixed(6)),
    lng: Number(pos.coords.longitude.toFixed(6)),
  };
  return isValidCoordinates(c) ? c : null;
}

export function useUserLocation(): UseUserLocationResult {
  const [status, setStatus] = useState<LocationPermissionState>('idle');
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState(IDLE_MESSAGE);
  const [permissionBlocked, setPermissionBlocked] = useState(false);

  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const inFlightRef = useRef<Promise<Coordinates | null> | null>(null);

  const stopWatching = useCallback(() => {
    watchRef.current?.remove();
    watchRef.current = null;
  }, []);

  useEffect(() => stopWatching, [stopWatching]);

  // Permission is requested once; later position updates reuse the grant.
  const startWatching = useCallback(async () => {
    if (watchRef.current) return;
    try {
      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 25,
          timeInterval: 8000,
        },
        (pos) => {
          const next = toCoords(pos);
          if (!next) return;
          setCoordinates(next);
          setAccuracyMeters(pos.coords.accuracy ?? null);
        }
      );
    } catch {
      // Updates are a bonus; the first fix is already stored.
    }
  }, []);

  const acquire = useCallback(async (): Promise<Coordinates | null> => {
    setStatus('loading');
    setStatusMessage('Finding your location…');
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        if (perm.status === 'denied' && perm.canAskAgain === false) {
          setCoordinates(null);
          setStatus('denied');
          setPermissionBlocked(true);
          setStatusMessage(
            'Location permission is blocked. Enable it for STAGE in Android Settings.'
          );
          return null;
        }
        perm = await Location.requestForegroundPermissionsAsync();
      }
      if (perm.status !== 'granted') {
        setCoordinates(null);
        setStatus('denied');
        setPermissionBlocked(perm.canAskAgain === false);
        setStatusMessage(
          'Location permission was denied. You can still choose a starting point manually.'
        );
        return null;
      }
      setPermissionBlocked(false);

      if (!(await Location.hasServicesEnabledAsync())) {
        setCoordinates(null);
        setStatus('disabled');
        setStatusMessage(
          'Location services are turned off. Turn on GPS in Android settings, or choose a starting point manually.'
        );
        return null;
      }

      const pos = await withTimeout(
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        LOCATION_TIMEOUT_MS
      );
      const fix = toCoords(pos);
      if (!fix) {
        setCoordinates(null);
        setStatus('error');
        setStatusMessage('The device returned an invalid position. Please retry.');
        return null;
      }
      setCoordinates(fix);
      setAccuracyMeters(pos.coords.accuracy ?? null);
      setStatus('granted');
      setStatusMessage('Using your live location.');
      startWatching();
      return fix;
    } catch (e) {
      setCoordinates(null);
      setStatus('error');
      setStatusMessage(
        e instanceof Error && e.message === 'LOCATION_TIMEOUT'
          ? 'Could not get a GPS fix in time. Try near a window or outdoors, then retry.'
          : 'Location is unavailable right now. Retry, or choose a starting point manually.'
      );
      return null;
    }
  }, [startWatching]);

  const requestCurrentLocation = useCallback(() => {
    // Avoid duplicate prompts / requests from rapid taps.
    if (!inFlightRef.current) {
      inFlightRef.current = acquire().finally(() => {
        inFlightRef.current = null;
      });
    }
    return inFlightRef.current;
  }, [acquire]);

  const clearCurrentLocation = useCallback(() => {
    stopWatching();
    setCoordinates(null);
    setAccuracyMeters(null);
    setStatus('idle');
    setStatusMessage(IDLE_MESSAGE);
  }, [stopWatching]);

  const openSystemSettings = useCallback(() => {
    Linking.openSettings().catch(() => undefined);
  }, []);

  return {
    status,
    coordinates,
    accuracyMeters,
    statusMessage,
    permissionBlocked,
    requestCurrentLocation,
    clearCurrentLocation,
    openSystemSettings,
  };
}
