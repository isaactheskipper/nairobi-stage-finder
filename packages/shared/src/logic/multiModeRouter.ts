import { STAGE_MAP_CONFIG } from '../config/mapConfig';
import { Coordinates, TurnDirection, WalkingStep } from '../types/transport';
import { isValidCoordinates } from './nominatimClient';
import {
  OsrmErrorKind,
  OsrmGeometryGeoJson,
  OsrmResolvedWalkRoute,
  OsrmRouteResponse,
  OsrmRouteStep,
  OsrmRoutingError,
} from './osrmClient';
import {
  calculateCompassDegrees,
  degreesToCompassLabel,
} from './routeFinder';

export type TransportMode = 'walking' | 'car' | 'motorcycle';

export interface TransportModeOption {
  id: TransportMode;
  label: string;
  shortLabel: string;
  actionVerb: string;
  ongoingLabel: string;
  googleTravelMode: 'walking' | 'driving' | 'two-wheeler';
}

export const TRANSPORT_MODE_OPTIONS: readonly TransportModeOption[] = [
  {
    id: 'walking',
    label: 'Walking',
    shortLabel: 'Walk',
    actionVerb: 'Walk',
    ongoingLabel: 'walking',
    googleTravelMode: 'walking',
  },
  {
    id: 'car',
    label: 'Car',
    shortLabel: 'Car',
    actionVerb: 'Drive',
    ongoingLabel: 'driving',
    googleTravelMode: 'driving',
  },
  {
    id: 'motorcycle',
    label: 'Motorcycle',
    shortLabel: 'Moto',
    actionVerb: 'Ride',
    ongoingLabel: 'motorcycle',
    googleTravelMode: 'two-wheeler',
  },
] as const;

export function getTransportModeMeta(mode: TransportMode): TransportModeOption {
  return (
    TRANSPORT_MODE_OPTIONS.find((m) => m.id === mode) ??
    TRANSPORT_MODE_OPTIONS[0]
  );
}

export type RoutingProviderId =
  | 'osrm-foot'
  | 'osrm-car'
  | 'osrm-motorcycle'
  | 'valhalla-pedestrian'
  | 'valhalla-auto'
  | 'valhalla-motorcycle'
  | 'osrm-car-fallback';

export interface ResolvedRouteOption extends OsrmResolvedWalkRoute {
  /** Unique identifier within the current routing response (e.g. "route-0") */
  id: string;
  /** 0-based index after sorting by quickest duration */
  optionIndex: number;
  /** True for the quickest valid route (index 0) */
  isQuickest: boolean;
  /** Concise street/corridor summary returned by the routing provider */
  viaSummary: string;
  /** Extra seconds compared with the quickest route (0 for the quickest) */
  deltaSecondsFromQuickest: number;
  /** Extra minutes compared with the quickest route (0 for the quickest) */
  deltaMinutesFromQuickest: number;
}

export interface MultiModeRouteResult {
  mode: TransportMode;
  providerId: RoutingProviderId;
  providerLabel: string;
  endpointUsed: string;
  /** True when the provider natively routed for the requested transport mode */
  isGenuineModeProfile: boolean;
  /** True when motorcycle routing fell back to standard motor-vehicle road routing */
  isFallbackProfile: boolean;
  /** Clear user-facing explanation when a fallback profile is used */
  fallbackExplanation: string | null;
  /** Honest disclaimer distinguishing static route duration from live traffic */
  trafficDisclaimer: string;
  /** All valid routes returned by the provider, sorted quickest-first */
  routes: ResolvedRouteOption[];
  /** Convenience reference to routes[0] (the quickest route) */
  quickestRoute: ResolvedRouteOption;
}

function getEnvVar(key: string, fallback = ''): string {
  try {
    const proc = (
      globalThis as unknown as {
        process?: { env?: Record<string, string | undefined> };
      }
    ).process;
    if (proc?.env && proc.env[key] && proc.env[key]!.trim().length > 0) {
      return proc.env[key]!.trim();
    }
  } catch {
    // ignore environment lookup errors
  }
  return fallback;
}

/**
 * Configurable free/open-source routing endpoints.
 * Private keys are never hardcoded; custom endpoints can be supplied via EXPO_PUBLIC_* env vars.
 */
const DEFAULT_OSRM_FOOT_BASE = 'https://routing.openstreetmap.de/routed-foot';
const DEFAULT_OSRM_CAR_BASE = 'https://routing.openstreetmap.de/routed-car';
const SECONDARY_OSRM_CAR_BASE = 'https://router.project-osrm.org';
const DEFAULT_VALHALLA_BASE = 'https://valhalla1.openstreetmap.de';

const multiModeCache = new Map<string, MultiModeRouteResult>();
const inFlightMultiMode = new Map<string, Promise<MultiModeRouteResult>>();

export function clearMultiModeRouteCache(): void {
  multiModeCache.clear();
}

function cleanBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function resolveFootBaseUrl(): string {
  const customFoot = getEnvVar('EXPO_PUBLIC_OSRM_FOOT_BASE_URL');
  if (customFoot) return cleanBaseUrl(customFoot);
  const sharedBase = cleanBaseUrl(STAGE_MAP_CONFIG.osrmBaseUrl);
  if (sharedBase.includes('router.project-osrm.org')) {
    return DEFAULT_OSRM_FOOT_BASE;
  }
  return sharedBase || DEFAULT_OSRM_FOOT_BASE;
}

function resolveCarBaseUrls(): string[] {
  const customCar = getEnvVar('EXPO_PUBLIC_OSRM_CAR_BASE_URL');
  const urls: string[] = [];
  if (customCar) urls.push(cleanBaseUrl(customCar));
  if (!urls.includes(DEFAULT_OSRM_CAR_BASE)) urls.push(DEFAULT_OSRM_CAR_BASE);
  if (!urls.includes(SECONDARY_OSRM_CAR_BASE))
    urls.push(SECONDARY_OSRM_CAR_BASE);
  return urls;
}

function resolveMotorcycleOsrmBaseUrl(): string {
  return cleanBaseUrl(getEnvVar('EXPO_PUBLIC_OSRM_MOTORCYCLE_BASE_URL'));
}

function resolveValhallaBaseUrl(): string {
  return cleanBaseUrl(
    getEnvVar('EXPO_PUBLIC_VALHALLA_BASE_URL', DEFAULT_VALHALLA_BASE)
  );
}

function formatStepInstructionForMode(
  step: OsrmRouteStep,
  index: number,
  totalSteps: number,
  stageName: string,
  mode: TransportMode
): string {
  const cleanStage = stageName
    .replace(/\s*\((?:Unverified\s+)?Demo\)/gi, '')
    .trim();
  const rawName = step.name ? step.name.trim() : '';
  const hasStreet =
    rawName.length > 0 &&
    !/^(?:unnamed\s+road|nairobi\s+road\s+segment|origin\s+road)$/i.test(
      rawName
    );
  const street = hasStreet ? rawName : '';
  const type = step.maneuver?.type ?? 'continue';
  const modifier = (step.maneuver?.modifier ?? '').trim();
  const moveVerb =
    mode === 'walking' ? 'Walk' : mode === 'motorcycle' ? 'Ride' : 'Drive';
  const pathNoun = mode === 'walking' ? 'walkway' : 'road';

  if (type === 'depart' || index === 0) {
    if (street) {
      return `${moveVerb} ${modifier || 'along'} on ${street}`;
    }
    return `Follow the ${pathNoun} toward ${cleanStage}`;
  }
  if (type === 'arrive' || index === totalSteps - 1) {
    if (street) {
      return `Arrive at ${cleanStage} along ${street}`;
    }
    return `Arrive at ${cleanStage}`;
  }
  if (type === 'roundabout' || type === 'rotary') {
    if (street) {
      return `Take the roundabout onto ${street}`;
    }
    return 'Take the roundabout ahead';
  }
  if (type === 'fork' || type === 'off ramp' || type === 'on ramp') {
    if (street) {
      return `Keep ${modifier || 'ahead'} onto ${street}`;
    }
    return `Keep ${modifier || 'ahead'}`;
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

interface RawOsrmRouteCandidate {
  distance: number;
  duration: number;
  geometry: OsrmGeometryGeoJson;
  legs: NonNullable<OsrmRouteResponse['routes']>[number]['legs'];
}

function parseOsrmRoutesIntoOptions(
  data: OsrmRouteResponse,
  userOrigin: Coordinates,
  stageDestination: Coordinates,
  stageName: string,
  mode: TransportMode,
  endpointUsed: string,
  routingModeNotice: string
): ResolvedRouteOption[] {
  if (
    data.code !== 'Ok' ||
    !Array.isArray(data.routes) ||
    data.routes.length === 0
  ) {
    return [];
  }

  const validCandidates: Array<{
    raw: RawOsrmRouteCandidate;
    polyCoords: Coordinates[];
    totalDist: number;
    durationSec: number;
  }> = [];

  for (const candidate of data.routes) {
    const rawCoords = candidate.geometry?.coordinates;
    if (!Array.isArray(rawCoords) || rawCoords.length < 2) continue;

    const polyCoords: Coordinates[] = rawCoords
      .filter(
        (pair): pair is [number, number] =>
          Array.isArray(pair) &&
          pair.length >= 2 &&
          typeof pair[0] === 'number' &&
          typeof pair[1] === 'number' &&
          Number.isFinite(pair[0]) &&
          Number.isFinite(pair[1])
      )
      .map(([lng, lat]) => ({ lat, lng }));

    if (polyCoords.length < 2) continue;

    const totalDist = Math.max(15, Math.round(candidate.distance));
    let durationSec = Math.max(15, Math.round(candidate.duration));

    // Only enforce pedestrian walking pace floor when in walking mode
    if (mode === 'walking') {
      const minPedestrianSec = Math.round(totalDist / 1.35);
      durationSec = Math.max(durationSec, minPedestrianSec);
    }

    validCandidates.push({
      raw: candidate,
      polyCoords,
      totalDist,
      durationSec,
    });
  }

  if (validCandidates.length === 0) {
    return [];
  }

  // Sort by quickest duration first; break ties by shorter distance
  validCandidates.sort((a, b) => {
    if (a.durationSec !== b.durationSec) {
      return a.durationSec - b.durationSec;
    }
    return a.totalDist - b.totalDist;
  });

  const quickestSec = validCandidates[0].durationSec;
  const quickestMin = Math.max(1, Math.round(quickestSec / 60));

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
  const cleanStageName = stageName
    .replace(/\s*\((?:Unverified\s+)?Demo\)/gi, '')
    .trim();

  return validCandidates.map((item, idx) => {
    const rawSteps = item.raw.legs?.[0]?.steps ?? [];
    const parsedSteps: WalkingStep[] =
      rawSteps.length > 0
        ? rawSteps.map((st, stepIdx) => {
            const mod = (st.maneuver?.modifier || '').toLowerCase();
            let turnDir: TurnDirection = 'straight';
            if (stepIdx === 0 || st.maneuver?.type === 'depart') {
              turnDir = 'start';
            } else if (
              stepIdx === rawSteps.length - 1 ||
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

            const stepDist = Math.max(5, Math.round(st.distance));
            const rawStepDur = Math.max(4, Math.round(st.duration));
            const stepDurationSec =
              mode === 'walking'
                ? Math.max(rawStepDur, Math.round(stepDist / 1.35))
                : rawStepDur;

            return {
              stepNumber: stepIdx + 1,
              instruction: formatStepInstructionForMode(
                st,
                stepIdx,
                rawSteps.length,
                stageName,
                mode
              ),
              streetName: hasNamedStreet
                ? st.name.trim()
                : mode === 'walking'
                  ? 'Pedestrian Walkway'
                  : 'Nairobi Street',
              distanceMeters: stepDist,
              durationSeconds: stepDurationSec,
              compassBearing: stepBearing,
              turnDirection: turnDir,
              landmarkCue:
                stepIdx === rawSteps.length - 1
                  ? `Boarding stage at ${cleanStageName}`
                  : hasNamedStreet
                    ? `Along ${st.name.trim()}`
                    : `Toward ${cleanStageName}`,
              coordinates: stepCoords,
            };
          })
        : [];

    const legSummary = item.raw.legs?.[0]?.summary?.trim() || '';
    const firstNamedStreet = parsedSteps.find(
      (s) =>
        s.streetName &&
        s.streetName !== 'Pedestrian Walkway' &&
        s.streetName !== 'Nairobi Street'
    )?.streetName;
    const viaSummary =
      legSummary ||
      firstNamedStreet ||
      (idx === 0 ? 'Direct route' : `Alternative ${idx + 1}`);

    const estMins = Math.max(1, Math.round(item.durationSec / 60));
    const deltaSec = Math.max(0, item.durationSec - quickestSec);
    const deltaMin = Math.max(0, estMins - quickestMin);

    return {
      id: `route-${idx}`,
      optionIndex: idx,
      isQuickest: idx === 0,
      viaSummary,
      deltaSecondsFromQuickest: deltaSec,
      deltaMinutesFromQuickest: deltaMin,
      source: 'osrm-live',
      endpointUsed,
      routingModeNotice,
      totalDistanceMeters: item.totalDist,
      estimatedDurationSeconds: item.durationSec,
      estimatedMinutes: estMins,
      compassBearing: overallBearing,
      geometryGeoJson: {
        type: 'LineString',
        coordinates: item.polyCoords.map((pt) => [pt.lng, pt.lat]),
      },
      polyline: item.polyCoords,
      snappedOrigin,
      snappedStage,
      originStreetName: wpOrigin?.name || 'Origin Road',
      stageStreetName: wpStage?.name || stageName,
      steps: parsedSteps,
    };
  });
}

/**
 * Decodes a Valhalla 6-decimal encoded polyline (`polyline6`) into Coordinates[].
 */
function decodePolyline6(encoded: string): Coordinates[] {
  const points: Coordinates[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && index <= encoded.length);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && index <= encoded.length);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    const cLat = Number((lat / 1e6).toFixed(6));
    const cLng = Number((lng / 1e6).toFixed(6));
    if (Number.isFinite(cLat) && Number.isFinite(cLng)) {
      points.push({ lat: cLat, lng: cLng });
    }
  }
  return points;
}

interface ValhallaManeuver {
  type?: number;
  instruction?: string;
  street_names?: string[];
  length?: number; // in km
  time?: number; // in seconds
  begin_shape_index?: number;
}

interface ValhallaTrip {
  status?: number;
  status_message?: string;
  summary?: {
    length?: number; // km
    time?: number; // seconds
  };
  legs?: Array<{
    summary?: {
      length?: number;
      time?: number;
    };
    shape?: string;
    maneuvers?: ValhallaManeuver[];
  }>;
}

interface ValhallaRouteResponse {
  trip?: ValhallaTrip;
  alternates?: Array<{
    trip?: ValhallaTrip;
  }>;
  error?: string;
}

function parseValhallaTripsIntoOptions(
  response: ValhallaRouteResponse,
  userOrigin: Coordinates,
  stageDestination: Coordinates,
  stageName: string,
  mode: TransportMode,
  endpointUsed: string,
  routingModeNotice: string
): ResolvedRouteOption[] {
  const trips: ValhallaTrip[] = [];
  if (response.trip) trips.push(response.trip);
  if (Array.isArray(response.alternates)) {
    for (const alt of response.alternates) {
      if (alt?.trip) trips.push(alt.trip);
    }
  }

  const overallBearing = degreesToCompassLabel(
    calculateCompassDegrees(userOrigin, stageDestination)
  );
  const cleanStageName = stageName
    .replace(/\s*\((?:Unverified\s+)?Demo\)/gi, '')
    .trim();

  const parsedCandidates: Array<{
    polyCoords: Coordinates[];
    totalDist: number;
    durationSec: number;
    steps: WalkingStep[];
    viaSummary: string;
  }> = [];

  for (const trip of trips) {
    const leg = trip.legs?.[0];
    if (!leg?.shape) continue;
    const polyCoords = decodePolyline6(leg.shape);
    if (polyCoords.length < 2) continue;

    const lengthKm = leg.summary?.length ?? trip.summary?.length ?? 0;
    const rawTimeSec = leg.summary?.time ?? trip.summary?.time ?? 0;
    if (lengthKm <= 0 || rawTimeSec <= 0) continue;

    const totalDist = Math.max(15, Math.round(lengthKm * 1000));
    const durationSec =
      mode === 'walking'
        ? Math.max(Math.round(rawTimeSec), Math.round(totalDist / 1.35))
        : Math.max(15, Math.round(rawTimeSec));

    const maneuvers = leg.maneuvers ?? [];
    const streetCounts = new Map<string, number>();

    const steps: WalkingStep[] = maneuvers.map((m, idx) => {
      const instrRaw = (m.instruction || '').trim().replace(/\.$/, '');
      const streetName = m.street_names?.[0]?.trim() || '';
      if (streetName) {
        streetCounts.set(
          streetName,
          (streetCounts.get(streetName) ?? 0) + (m.length ?? 0.1)
        );
      }

      const lower = instrRaw.toLowerCase();
      let turnDir: TurnDirection = 'straight';
      if (idx === 0) turnDir = 'start';
      else if (
        idx === maneuvers.length - 1 ||
        lower.includes('destination') ||
        lower.includes('arrive')
      ) {
        turnDir = 'arrive';
      } else if (lower.includes('left')) {
        turnDir = 'left';
      } else if (lower.includes('right')) {
        turnDir = 'right';
      }

      const stepDist = Math.max(5, Math.round((m.length ?? 0.01) * 1000));
      const stepDur = Math.max(4, Math.round(m.time ?? 5));
      const shapeIdx =
        typeof m.begin_shape_index === 'number' &&
        m.begin_shape_index >= 0 &&
        m.begin_shape_index < polyCoords.length
          ? m.begin_shape_index
          : undefined;

      const instruction =
        idx === maneuvers.length - 1
          ? `Arrive at ${cleanStageName}`
          : instrRaw || `Continue toward ${cleanStageName}`;

      return {
        stepNumber: idx + 1,
        instruction,
        streetName:
          streetName ||
          (mode === 'walking' ? 'Pedestrian Walkway' : 'Nairobi Street'),
        distanceMeters: stepDist,
        durationSeconds: stepDur,
        compassBearing: overallBearing,
        turnDirection: turnDir,
        landmarkCue:
          idx === maneuvers.length - 1
            ? `Boarding stage at ${cleanStageName}`
            : streetName
              ? `Along ${streetName}`
              : `Toward ${cleanStageName}`,
        coordinates: shapeIdx !== undefined ? polyCoords[shapeIdx] : undefined,
      };
    });

    const topStreets = Array.from(streetCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([name]) => name)
      .join(', ');

    parsedCandidates.push({
      polyCoords,
      totalDist,
      durationSec,
      steps,
      viaSummary: topStreets || 'OpenStreetMap route',
    });
  }

  if (parsedCandidates.length === 0) {
    return [];
  }

  parsedCandidates.sort((a, b) => {
    if (a.durationSec !== b.durationSec) return a.durationSec - b.durationSec;
    return a.totalDist - b.totalDist;
  });

  const quickestSec = parsedCandidates[0].durationSec;
  const quickestMin = Math.max(1, Math.round(quickestSec / 60));

  return parsedCandidates.map((item, idx) => {
    const estMins = Math.max(1, Math.round(item.durationSec / 60));
    const deltaSec = Math.max(0, item.durationSec - quickestSec);
    const deltaMin = Math.max(0, estMins - quickestMin);

    return {
      id: `route-${idx}`,
      optionIndex: idx,
      isQuickest: idx === 0,
      viaSummary: item.viaSummary,
      deltaSecondsFromQuickest: deltaSec,
      deltaMinutesFromQuickest: deltaMin,
      source: 'osrm-live',
      endpointUsed,
      routingModeNotice,
      totalDistanceMeters: item.totalDist,
      estimatedDurationSeconds: item.durationSec,
      estimatedMinutes: estMins,
      compassBearing: overallBearing,
      geometryGeoJson: {
        type: 'LineString',
        coordinates: item.polyCoords.map((pt) => [pt.lng, pt.lat]),
      },
      polyline: item.polyCoords,
      snappedOrigin: item.polyCoords[0] ?? userOrigin,
      snappedStage:
        item.polyCoords[item.polyCoords.length - 1] ?? stageDestination,
      originStreetName: item.steps[0]?.streetName || 'Origin Road',
      stageStreetName: stageName,
      steps: item.steps,
    };
  });
}

async function tryFetchOsrmEndpoint(
  baseUrl: string,
  profile: string,
  userOrigin: Coordinates,
  stageDestination: Coordinates,
  stageName: string,
  mode: TransportMode,
  routingModeNotice: string
): Promise<{
  options: ResolvedRouteOption[];
  endpointUsed: string;
}> {
  const coordPair = `${userOrigin.lng.toFixed(6)},${userOrigin.lat.toFixed(
    6
  )};${stageDestination.lng.toFixed(6)},${stageDestination.lat.toFixed(6)}`;
  const requestUrl = `${baseUrl}/route/v1/${profile}/${coordPair}?alternatives=true&overview=full&geometries=geojson&steps=true`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8500);
  try {
    const response = await fetch(requestUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.status === 429) {
      throw new OsrmRoutingError(
        'The routing service is busy (HTTP 429). Please retry in a moment.',
        'rate-limit'
      );
    }
    if (!response.ok) {
      throw new OsrmRoutingError(
        `The routing service returned HTTP ${response.status}.`,
        'http'
      );
    }

    const data = (await response.json()) as OsrmRouteResponse;
    const options = parseOsrmRoutesIntoOptions(
      data,
      userOrigin,
      stageDestination,
      stageName,
      mode,
      requestUrl,
      routingModeNotice
    );

    if (options.length === 0) {
      throw new OsrmRoutingError(
        data.message ||
          `No valid ${mode} route was found between these points.`,
        'no-route'
      );
    }

    return { options, endpointUsed: requestUrl };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function tryFetchValhallaEndpoint(
  baseUrl: string,
  costing: 'pedestrian' | 'auto' | 'motorcycle',
  userOrigin: Coordinates,
  stageDestination: Coordinates,
  stageName: string,
  mode: TransportMode,
  routingModeNotice: string
): Promise<{
  options: ResolvedRouteOption[];
  endpointUsed: string;
}> {
  const payload = {
    locations: [
      {
        lon: Number(userOrigin.lng.toFixed(6)),
        lat: Number(userOrigin.lat.toFixed(6)),
      },
      {
        lon: Number(stageDestination.lng.toFixed(6)),
        lat: Number(stageDestination.lat.toFixed(6)),
      },
    ],
    costing,
    alternates: 2,
    directions_options: { units: 'kilometers', language: 'en-US' },
  };
  const requestUrl = `${baseUrl}/route?json=${encodeURIComponent(
    JSON.stringify(payload)
  )}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7500);
  try {
    const response = await fetch(requestUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new OsrmRoutingError(
        `Valhalla routing service returned HTTP ${response.status}.`,
        'http'
      );
    }

    const data = (await response.json()) as ValhallaRouteResponse;
    const options = parseValhallaTripsIntoOptions(
      data,
      userOrigin,
      stageDestination,
      stageName,
      mode,
      `${baseUrl}/route (${costing})`,
      routingModeNotice
    );

    if (options.length === 0) {
      throw new OsrmRoutingError(
        data.error || `No valid ${costing} route returned.`,
        'no-route'
      );
    }

    return { options, endpointUsed: `${baseUrl}/route (${costing})` };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Multi-Mode Routing Provider Abstraction for STAGE Nairobi (Android + Web).
 */
export async function fetchMultiModeRoute(
  userOrigin: Coordinates,
  stageDestination: Coordinates,
  stageName: string,
  mode: TransportMode,
  options?: { forceRefresh?: boolean }
): Promise<MultiModeRouteResult> {
  if (!isValidCoordinates(userOrigin) || !isValidCoordinates(stageDestination)) {
    throw new OsrmRoutingError(
      'Invalid or missing coordinates for starting point or boarding stage.',
      'invalid'
    );
  }

  const coordKey = `${userOrigin.lng.toFixed(6)},${userOrigin.lat.toFixed(
    6
  )};${stageDestination.lng.toFixed(6)},${stageDestination.lat.toFixed(6)}`;
  const cacheKey = `${mode}|${coordKey}`;

  if (!options?.forceRefresh) {
    const cached = multiModeCache.get(cacheKey);
    if (cached) return cached;
    const existing = inFlightMultiMode.get(cacheKey);
    if (existing) return existing;
  }

  const promise = (async (): Promise<MultiModeRouteResult> => {
    let lastErrorReason = `Could not calculate a ${mode} route right now. Check your connection and retry.`;
    let lastErrorKind: OsrmErrorKind = 'network';

    // 1. WALKING MODE (Pedestrian Routing)
    if (mode === 'walking') {
      const footBase = resolveFootBaseUrl();
      const notice =
        'Pedestrian routing on OpenStreetMap footpaths & streets. Always check crossings and street conditions yourself.';

      try {
        const { options: routeOpts, endpointUsed } = await tryFetchOsrmEndpoint(
          footBase,
          'foot',
          userOrigin,
          stageDestination,
          stageName,
          'walking',
          notice
        );
        const res: MultiModeRouteResult = {
          mode: 'walking',
          providerId: 'osrm-foot',
          providerLabel: 'OSRM Foot Profile (OpenStreetMap)',
          endpointUsed,
          isGenuineModeProfile: true,
          isFallbackProfile: false,
          fallbackExplanation: null,
          trafficDisclaimer:
            'Estimated walking time at pedestrian pace (~4.7 km/h) · live street crowding not included.',
          routes: routeOpts,
          quickestRoute: routeOpts[0],
        };
        multiModeCache.set(cacheKey, res);
        return res;
      } catch (err) {
        if (err instanceof OsrmRoutingError) {
          lastErrorKind = err.kind;
          lastErrorReason = err.message;
        }
      }

      try {
        const valhallaBase = resolveValhallaBaseUrl();
        const { options: routeOpts, endpointUsed } =
          await tryFetchValhallaEndpoint(
            valhallaBase,
            'pedestrian',
            userOrigin,
            stageDestination,
            stageName,
            'walking',
            notice
          );
        const res: MultiModeRouteResult = {
          mode: 'walking',
          providerId: 'valhalla-pedestrian',
          providerLabel: 'Valhalla Pedestrian (OpenStreetMap)',
          endpointUsed,
          isGenuineModeProfile: true,
          isFallbackProfile: false,
          fallbackExplanation: null,
          trafficDisclaimer:
            'Estimated walking time at pedestrian pace · live street crowding not included.',
          routes: routeOpts,
          quickestRoute: routeOpts[0],
        };
        multiModeCache.set(cacheKey, res);
        return res;
      } catch (err) {
        if (err instanceof OsrmRoutingError) {
          lastErrorKind = err.kind;
          lastErrorReason = err.message;
        }
      }

      throw new OsrmRoutingError(lastErrorReason, lastErrorKind);
    }

    // 2. CAR MODE (Driving Routing)
    if (mode === 'car') {
      const carBases = resolveCarBaseUrls();
      const notice =
        'Driving route on OpenStreetMap road network. Follow local Nairobi traffic rules and one-way restrictions.';

      for (const carBase of carBases) {
        try {
          const { options: routeOpts, endpointUsed } =
            await tryFetchOsrmEndpoint(
              carBase,
              'driving',
              userOrigin,
              stageDestination,
              stageName,
              'car',
              notice
            );
          const res: MultiModeRouteResult = {
            mode: 'car',
            providerId: 'osrm-car',
            providerLabel: 'OSRM Driving Profile (OpenStreetMap)',
            endpointUsed,
            isGenuineModeProfile: true,
            isFallbackProfile: false,
            fallbackExplanation: null,
            trafficDisclaimer:
              'Estimated from OpenStreetMap road speeds — live Nairobi traffic is not included.',
            routes: routeOpts,
            quickestRoute: routeOpts[0],
          };
          multiModeCache.set(cacheKey, res);
          return res;
        } catch (err) {
          if (err instanceof OsrmRoutingError) {
            lastErrorKind = err.kind;
            lastErrorReason = err.message;
          }
        }
      }

      try {
        const valhallaBase = resolveValhallaBaseUrl();
        const { options: routeOpts, endpointUsed } =
          await tryFetchValhallaEndpoint(
            valhallaBase,
            'auto',
            userOrigin,
            stageDestination,
            stageName,
            'car',
            notice
          );
        const res: MultiModeRouteResult = {
          mode: 'car',
          providerId: 'valhalla-auto',
          providerLabel: 'Valhalla Auto Profile (OpenStreetMap)',
          endpointUsed,
          isGenuineModeProfile: true,
          isFallbackProfile: false,
          fallbackExplanation: null,
          trafficDisclaimer:
            'Estimated from OpenStreetMap road speeds — live Nairobi traffic is not included.',
          routes: routeOpts,
          quickestRoute: routeOpts[0],
        };
        multiModeCache.set(cacheKey, res);
        return res;
      } catch (err) {
        if (err instanceof OsrmRoutingError) {
          lastErrorKind = err.kind;
          lastErrorReason = err.message;
        }
      }

      throw new OsrmRoutingError(lastErrorReason, lastErrorKind);
    }

    // 3. MOTORCYCLE MODE (Valhalla Motorcycle or Explicit Road-Routing Fallback)
    const customMotoBase = resolveMotorcycleOsrmBaseUrl();
    if (customMotoBase) {
      const notice =
        'Motorcycle routing via configured OSRM motorcycle server.';
      try {
        const { options: routeOpts, endpointUsed } = await tryFetchOsrmEndpoint(
          customMotoBase,
          'motorcycle',
          userOrigin,
          stageDestination,
          stageName,
          'motorcycle',
          notice
        );
        const res: MultiModeRouteResult = {
          mode: 'motorcycle',
          providerId: 'osrm-motorcycle',
          providerLabel: 'OSRM Motorcycle Profile',
          endpointUsed,
          isGenuineModeProfile: true,
          isFallbackProfile: false,
          fallbackExplanation: null,
          trafficDisclaimer:
            'Estimated from OpenStreetMap road speeds — live traffic is not included.',
          routes: routeOpts,
          quickestRoute: routeOpts[0],
        };
        multiModeCache.set(cacheKey, res);
        return res;
      } catch (err) {
        if (err instanceof OsrmRoutingError) {
          lastErrorKind = err.kind;
          lastErrorReason = err.message;
        }
      }
    }

    try {
      const valhallaBase = resolveValhallaBaseUrl();
      const notice =
        'Motorcycle routing via OpenStreetMap Valhalla (motorcycle costing profile).';
      const { options: routeOpts, endpointUsed } =
        await tryFetchValhallaEndpoint(
          valhallaBase,
          'motorcycle',
          userOrigin,
          stageDestination,
          stageName,
          'motorcycle',
          notice
        );
      const res: MultiModeRouteResult = {
        mode: 'motorcycle',
        providerId: 'valhalla-motorcycle',
        providerLabel: 'Valhalla Motorcycle Profile (OpenStreetMap)',
        endpointUsed,
        isGenuineModeProfile: true,
        isFallbackProfile: false,
        fallbackExplanation: null,
        trafficDisclaimer:
          'Estimated from OpenStreetMap motorcycle road speeds — live traffic is not included.',
        routes: routeOpts,
        quickestRoute: routeOpts[0],
      };
      multiModeCache.set(cacheKey, res);
      return res;
    } catch {
      // Fall through to explicitly labelled OSRM road-routing fallback
    }

    const carBases = resolveCarBaseUrls();
    const fallbackNotice =
      'Road-routing fallback (OSRM Car profile): Public OSRM servers do not provide a dedicated motorcycle profile. Route uses standard motor-vehicle road geometry and road-speed estimates.';

    for (const carBase of carBases) {
      try {
        const { options: routeOpts, endpointUsed } = await tryFetchOsrmEndpoint(
          carBase,
          'driving',
          userOrigin,
          stageDestination,
          stageName,
          'motorcycle',
          fallbackNotice
        );
        const res: MultiModeRouteResult = {
          mode: 'motorcycle',
          providerId: 'osrm-car-fallback',
          providerLabel: 'OSRM Road Routing (Car Fallback)',
          endpointUsed,
          isGenuineModeProfile: false,
          isFallbackProfile: true,
          fallbackExplanation:
            'Road-routing fallback: Public OSRM servers do not support a dedicated motorcycle profile, and the Valhalla motorcycle service was unreachable. Showing the quickest motor-vehicle road route (OSRM driving profile) without invented speeds.',
          trafficDisclaimer:
            'Estimated from OpenStreetMap road speeds — live traffic is not included.',
          routes: routeOpts,
          quickestRoute: routeOpts[0],
        };
        multiModeCache.set(cacheKey, res);
        return res;
      } catch (err) {
        if (err instanceof OsrmRoutingError) {
          lastErrorKind = err.kind;
          lastErrorReason = err.message;
        }
      }
    }

    throw new OsrmRoutingError(lastErrorReason, lastErrorKind);
  })();

  inFlightMultiMode.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    inFlightMultiMode.delete(cacheKey);
  }
}

/**
 * Builds an external Google Maps directions URL for the selected transport mode.
 */
export function buildExternalMapsDirectionsUrl(
  origin: Coordinates,
  destination: Coordinates,
  mode: TransportMode,
  destinationName?: string
): string {
  const originParam = `${origin.lat},${origin.lng}`;
  const destParam = `${destination.lat},${destination.lng}`;
  const travelMode = getTransportModeMeta(mode).googleTravelMode;
  const queryLabel = destinationName
    ? `&destination_place_id=${encodeURIComponent(destinationName)}`
    : '';
  return `https://www.google.com/maps/dir/?api=1&origin=${originParam}&destination=${destParam}&travelmode=${travelMode}${queryLabel}`;
}

