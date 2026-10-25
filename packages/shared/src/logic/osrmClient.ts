import { STAGE_MAP_CONFIG } from '../config/mapConfig';
import { Coordinates, TurnDirection, WalkingStep } from '../types/transport';
import { isValidCoordinates } from './nominatimClient';
import {
  calculateCompassDegrees,
  degreesToCompassLabel,
} from './routeFinder';

/**
 * Project-OSRM (https://github.com/Project-OSRM/osrm-backend) Road Routing Client
 * Documentation: https://project-osrm.org/
 *
 * Uses the configurable OSRM endpoint pattern (foot profile):
 * `${baseUrl}/route/v1/foot/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson&steps=true`
 *
 * IMPORTANT:
 * - The public OSRM server (`https://router.project-osrm.org`) is a demonstration service,
 *   not an unlimited production API.
 * - OSRM driving directions represent road routing, not verified pedestrian directions
 *   or guaranteed safe walking paths.
 */

export interface OsrmGeometryGeoJson {
  type: 'LineString';
  coordinates: [number, number][]; // [longitude, latitude][]
}

export interface OsrmStepManeuver {
  type: string;
  modifier?: string;
  location: [number, number]; // [longitude, latitude]
  bearing_before?: number;
  bearing_after?: number;
}

export interface OsrmRouteStep {
  distance: number;
  duration: number;
  name: string;
  mode: string;
  maneuver: OsrmStepManeuver;
}

export interface OsrmRouteLeg {
  distance: number;
  duration: number;
  summary: string;
  steps: OsrmRouteStep[];
}

export interface OsrmWaypoint {
  name: string;
  location: [number, number]; // [longitude, latitude]
  distance: number;
  hint?: string;
}

export interface OsrmRouteResponse {
  code: string;
  routes?: Array<{
    distance: number;
    duration: number;
    geometry: OsrmGeometryGeoJson;
    legs: OsrmRouteLeg[];
  }>;
  waypoints?: OsrmWaypoint[];
  message?: string;
}

export interface OsrmResolvedWalkRoute {
  source: 'osrm-live' | 'fallback-grid';
  endpointUsed: string;
  routingModeNotice: string;
  errorMessage?: string;
  totalDistanceMeters: number;
  estimatedDurationSeconds: number;
  estimatedMinutes: number;
  compassBearing: string;
  /** Raw GeoJSON LineString for MapLibre ShapeSource */
  geometryGeoJson: OsrmGeometryGeoJson;
  /** Ordered array of { lat, lng } points along the road network */
  polyline: Coordinates[];
  snappedOrigin: Coordinates;
  snappedStage: Coordinates;
  originStreetName: string;
  stageStreetName: string;
  steps: WalkingStep[];
}

const routeCache = new Map<string, OsrmResolvedWalkRoute>();
const inFlightRoutes = new Map<string, Promise<OsrmResolvedWalkRoute>>();

function formatManeuverInstruction(
  step: OsrmRouteStep,
  index: number,
  totalSteps: number,
  stageName: string
): string {
  const cleanStage = stageName.replace(/\s*\((?:Unverified\s+)?Demo\)/gi, '').trim();
  const rawName = step.name ? step.name.trim() : '';
  const hasStreet =
    rawName.length > 0 &&
    !/^(?:unnamed\s+road|nairobi\s+road\s+segment|origin\s+road)$/i.test(rawName);
  const street = hasStreet ? rawName : '';
  const type = step.maneuver?.type ?? 'continue';
  const modifier = (step.maneuver?.modifier ?? '').trim();

  if (type === 'depart' || index === 0) {
    if (street) {
      return `Head ${modifier || 'along'} on ${street}`;
    }
    return `Follow the walkway toward ${cleanStage}`;
  }
  if (type === 'arrive' || index === totalSteps - 1) {
    if (street) {
      return `Arrive at ${cleanStage} along ${street}`;
    }
    return `Arrive at ${cleanStage}`;
  }
  if (type === 'turn') {
    if (street) {
      return `Turn ${modifier || 'ahead'} onto ${street}`;
    }
    return `Turn ${modifier || 'ahead'}`;
  }
  if (type === 'new name' || type === 'continue') {
    if (street) {
      return `Continue ${modifier ? `${modifier} ` : ''}along ${street}`;
    }
    return `Continue ${modifier || 'straight'} ahead`;
  }
  if (type === 'end of road') {
    if (street) {
      return `At the end of the road, turn ${modifier || 'ahead'} onto ${street}`;
    }
    return `At the end of the road, turn ${modifier || 'ahead'}`;
  }
  if (street) {
    return `Follow ${street}`;
  }
  return `Continue toward ${cleanStage}`;
}

export type OsrmErrorKind = 'network' | 'rate-limit' | 'http' | 'no-route' | 'invalid';

export class OsrmRoutingError extends Error {
  kind: OsrmErrorKind;
  constructor(message: string, kind: OsrmErrorKind) {
    super(message);
    this.name = 'OsrmRoutingError';
    this.kind = kind;
  }
}

/**
 * router.project-osrm.org only serves the CAR profile (a `/foot/` URL there
 * silently returns driving routes at car speed), so it is never used for
 * walking. We use the FOSSGIS OSRM instance with a real foot profile instead.
 */
const WALKING_DEFAULT_BASE = 'https://routing.openstreetmap.de/routed-foot';
function resolveWalkingBaseUrl(configured: string): string {
  const trimmed = configured.replace(/\/+$/, '');
  if (trimmed.includes('router.project-osrm.org')) {
    return WALKING_DEFAULT_BASE;
  }
  return trimmed;
}

export function clearOsrmRouteCache(): void {
  routeCache.clear();
}

/**
 * Requests a road route from Project-OSRM (`osrm-backend` HTTP API):
 * `${baseUrl}/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson&steps=true`
 *
 * Deduplicates concurrent requests and caches successful responses to avoid
 * spamming the public OSRM demonstration server.
 */
export async function fetchOsrmWalkingRoute(
  userOrigin: Coordinates,
  stageDestination: Coordinates,
  stageName: string,
  _unusedLegacySteps: WalkingStep[] = [],
  options?: { forceRefresh?: boolean; baseUrl?: string }
): Promise<OsrmResolvedWalkRoute> {
  if (!isValidCoordinates(userOrigin) || !isValidCoordinates(stageDestination)) {
    throw new Error(
      'Invalid or missing coordinates for user origin or boarding stage.'
    );
  }

  const baseUrl = resolveWalkingBaseUrl(
    options?.baseUrl || STAGE_MAP_CONFIG.osrmBaseUrl
  );
  const profile = STAGE_MAP_CONFIG.osrmProfile;
  const coordPair = `${userOrigin.lng.toFixed(6)},${userOrigin.lat.toFixed(
    6
  )};${stageDestination.lng.toFixed(6)},${stageDestination.lat.toFixed(6)}`;
  const cacheKey = `${baseUrl}|${profile}|${coordPair}`;

  if (!options?.forceRefresh) {
    const cached = routeCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const existing = inFlightRoutes.get(cacheKey);
    if (existing) {
      return existing;
    }
  }

  const requestUrl = `${baseUrl}/route/v1/${profile}/${coordPair}?overview=full&geometries=geojson&steps=true`;

  const promise = (async (): Promise<OsrmResolvedWalkRoute> => {
    let lastErrorReason =
      'The walking-route service could not be reached.';
    let lastErrorKind: OsrmErrorKind = 'network';

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(requestUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.status === 429) {
        lastErrorKind = 'rate-limit';
        lastErrorReason =
          'The walking-route service is busy (HTTP 429). Please retry in a moment.';
      } else if (!response.ok) {
        lastErrorKind = 'http';
        lastErrorReason = `The walking-route service returned HTTP ${response.status}. Retry or open Google Maps.`;
      } else {
        const data = (await response.json()) as OsrmRouteResponse;

        if (
          data.code === 'Ok' &&
          data.routes &&
          data.routes.length > 0 &&
          data.routes[0].geometry?.coordinates?.length
        ) {
          const primaryRoute = data.routes[0];
          const polyCoords: Coordinates[] =
            primaryRoute.geometry.coordinates.map(([lng, lat]) => ({
              lat,
              lng,
            }));

          const wpOrigin = data.waypoints?.[0];
          const wpStage = data.waypoints?.[1];

          const snappedOrigin: Coordinates = wpOrigin?.location
            ? { lat: wpOrigin.location[1], lng: wpOrigin.location[0] }
            : userOrigin;

          const snappedStage: Coordinates = wpStage?.location
            ? { lat: wpStage.location[1], lng: wpStage.location[0] }
            : stageDestination;

          const overallBearing = degreesToCompassLabel(
            calculateCompassDegrees(userOrigin, stageDestination)
          );

          const rawSteps = primaryRoute.legs?.[0]?.steps ?? [];
          const parsedSteps: WalkingStep[] =
            rawSteps.length > 0
              ? rawSteps.map((st, idx) => {
                  const mod = (st.maneuver?.modifier || '').toLowerCase();
                  let turnDir: TurnDirection = 'straight';
                  if (idx === 0 || st.maneuver?.type === 'depart') {
                    turnDir = 'start';
                  } else if (
                    idx === rawSteps.length - 1 ||
                    st.maneuver?.type === 'arrive'
                  ) {
                    turnDir = 'arrive';
                  } else if (mod.includes('left')) {
                    turnDir = 'left';
                  } else if (mod.includes('right')) {
                    turnDir = 'right';
                  }

                  const stepBearing =
                    typeof st.maneuver?.bearing_after === 'number'
                      ? degreesToCompassLabel(st.maneuver.bearing_after)
                      : overallBearing;

                  const cleanStageName = stageName
                    .replace(/\s*\((?:Unverified\s+)?Demo\)/gi, '')
                    .trim();
                  const hasNamedStreet =
                    Boolean(st.name && st.name.trim().length > 0) &&
                    !/^(?:unnamed\s+road|nairobi\s+road\s+segment)$/i.test(
                      st.name.trim()
                    );
                  const stepCoords: Coordinates | undefined =
                    st.maneuver?.location &&
                    st.maneuver.location.length >= 2 &&
                    typeof st.maneuver.location[0] === 'number' &&
                    typeof st.maneuver.location[1] === 'number'
                      ? {
                          lat: st.maneuver.location[1],
                          lng: st.maneuver.location[0],
                        }
                      : undefined;

                  return {
                    stepNumber: idx + 1,
                    instruction: formatManeuverInstruction(
                      st,
                      idx,
                      rawSteps.length,
                      stageName
                    ),
                    streetName: hasNamedStreet
                      ? st.name.trim()
                      : 'Pedestrian Walkway',
                    distanceMeters: Math.max(5, Math.round(st.distance)),
                    durationSeconds: Math.max(5, Math.round(st.duration)),
                    compassBearing: stepBearing,
                    turnDirection: turnDir,
                    landmarkCue:
                      idx === rawSteps.length - 1
                        ? `Boarding stage at ${cleanStageName}`
                        : hasNamedStreet
                        ? `Along ${st.name.trim()}`
                        : `Toward ${cleanStageName}`,
                    coordinates: stepCoords,
                  };
                })
              : [];

          const totalDist = Math.max(15, Math.round(primaryRoute.distance));
          const durationSec = Math.max(15, Math.round(primaryRoute.duration));
          const estMins = Math.max(1, Math.round(durationSec / 60));

          const resolved: OsrmResolvedWalkRoute = {
            source: 'osrm-live',
            endpointUsed: requestUrl,
            routingModeNotice:
              'OSRM foot-profile routing on OpenStreetMap data. Always check the street conditions yourself.',
            totalDistanceMeters: totalDist,
            estimatedDurationSeconds: durationSec,
            estimatedMinutes: estMins,
            compassBearing: overallBearing,
            geometryGeoJson: primaryRoute.geometry,
            polyline: polyCoords,
            snappedOrigin,
            snappedStage,
            originStreetName: wpOrigin?.name || 'Origin Road',
            stageStreetName: wpStage?.name || stageName,
            steps: parsedSteps,
          };

          routeCache.set(cacheKey, resolved);
          return resolved;
        } else {
          lastErrorKind = 'no-route';
          lastErrorReason =
            data.message ||
            `No walking route was found between these points (service code "${data.code}").`;
        }
      }
    } catch {
      lastErrorKind = 'network';
      lastErrorReason =
        'Network error or timeout reaching the walking-route service. Check your connection and retry.';
    }

    // No straight-line or grid "fallback route" is fabricated: callers must
    // show the error and offer a retry / external navigation instead.
    throw new OsrmRoutingError(lastErrorReason, lastErrorKind);
  })();

  inFlightRoutes.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    inFlightRoutes.delete(cacheKey);
  }
}

/**
 * Helper to compute OpenStreetMap slippy tile coordinates (x, y, z) from lat/lng.
 */
export function latLngToTileXY(
  lat: number,
  lng: number,
  zoom: number
): { tileX: number; tileY: number; offsetX: number; offsetY: number } {
  const n = Math.pow(2, zoom);
  const xFloat = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const yFloat =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
    n;

  const tileX = Math.floor(xFloat);
  const tileY = Math.floor(yFloat);
  return {
    tileX,
    tileY,
    offsetX: xFloat - tileX,
    offsetY: yFloat - tileY,
  };
}
