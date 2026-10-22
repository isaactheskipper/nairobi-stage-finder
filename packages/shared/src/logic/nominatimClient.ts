import { STAGE_MAP_CONFIG } from '../config/mapConfig';
import { Coordinates, SearchMatchResult } from '../types/transport';
import { searchRoutesAndStages } from './routeFinder';

/**
 * OpenStreetMap Nominatim Place Search Client (Kenya-scoped)
 * Documentation: https://nominatim.org/release-docs/latest/api/Search/
 * Usage Policy: https://operations.osmfoundation.org/policies/nominatim/
 *
 * Key compliance guarantees:
 * 1. Explicit search submission only (never called on every keystroke).
 * 2. Minimum 1,100ms interval enforced between network requests (max 1 req/sec).
 * 3. In-memory response caching & in-flight deduplication to prevent repeat requests.
 * 4. Explicit handling of HTTP 429 rate-limits, timeouts, and network errors.
 * 5. Place results are kept distinct from STAGE matatu route recommendations.
 */

export interface NominatimRawItem {
  place_id: number;
  licence?: string;
  osm_type?: string;
  osm_id?: number;
  lat: string;
  lon: string;
  category?: string;
  type?: string;
  place_rank?: number;
  importance?: number;
  addresstype?: string;
  name?: string;
  display_name: string;
  boundingbox?: [string, string, string, string];
}

export interface NominatimPlaceResult {
  placeId: string;
  title: string;
  displayName: string;
  category: string;
  coordinates: Coordinates;
  attribution: string;
}

export interface NominatimSearchOutcome {
  status: 'ok' | 'empty' | 'rate-limited' | 'error';
  places: NominatimPlaceResult[];
  fromCache: boolean;
  errorMessage?: string;
}

const placeCache = new Map<string, NominatimPlaceResult[]>();
const inFlightRequests = new Map<string, Promise<NominatimSearchOutcome>>();
let lastRequestTimestampMs = 0;

const MIN_INTERVAL_MS = 1100; // Nominatim policy: absolute maximum 1 request/sec

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isValidCoordinates(
  coords: Coordinates | null | undefined
): coords is Coordinates {
  if (!coords) return false;
  return (
    typeof coords.lat === 'number' &&
    typeof coords.lng === 'number' &&
    Number.isFinite(coords.lat) &&
    Number.isFinite(coords.lng) &&
    coords.lat >= -90 &&
    coords.lat <= 90 &&
    coords.lng >= -180 &&
    coords.lng <= 180
  );
}

/**
 * Searches OpenStreetMap Nominatim for places in Kenya (`countrycodes=ke`).
 * Must only be called when the user explicitly submits a search button/action.
 */
export async function searchNominatimPlacesKenya(
  rawQuery: string,
  customEndpoint?: string
): Promise<NominatimSearchOutcome> {
  const normalized = rawQuery.trim().toLowerCase();
  if (normalized.length < 2) {
    return {
      status: 'empty',
      places: [],
      fromCache: false,
      errorMessage: 'Enter at least 2 characters to search places in Kenya.',
    };
  }

  // 1. Return cached result immediately if available
  const cached = placeCache.get(normalized);
  if (cached) {
    return {
      status: cached.length > 0 ? 'ok' : 'empty',
      places: cached,
      fromCache: true,
    };
  }

  // 2. Deduplicate in-flight identical requests
  const existingInFlight = inFlightRequests.get(normalized);
  if (existingInFlight) {
    return existingInFlight;
  }

  const requestPromise = (async (): Promise<NominatimSearchOutcome> => {
    try {
      // 3. Enforce 1 request per second rate limit
      const now = Date.now();
      const elapsed = now - lastRequestTimestampMs;
      if (elapsed < MIN_INTERVAL_MS) {
        await sleep(MIN_INTERVAL_MS - elapsed);
      }
      lastRequestTimestampMs = Date.now();

      const baseUrl = customEndpoint || STAGE_MAP_CONFIG.nominatimSearchUrl;
      const url = `${baseUrl}?q=${encodeURIComponent(
        rawQuery.trim()
      )}&format=jsonv2&limit=${STAGE_MAP_CONFIG.nominatimLimit}&countrycodes=${
        STAGE_MAP_CONFIG.nominatimCountryCodes
      }`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7500);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Accept-Language': 'en',
          'User-Agent': STAGE_MAP_CONFIG.appUserAgent,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        return {
          status: 'rate-limited',
          places: [],
          fromCache: false,
          errorMessage:
            'Place search rate limit reached (HTTP 429). Please wait a moment before searching again, or select an existing STAGE destination.',
        };
      }

      if (!response.ok) {
        return {
          status: 'error',
          places: [],
          fromCache: false,
          errorMessage: `Nominatim place search unavailable (HTTP ${response.status}). You can still search all saved STAGE matatu routes offline.`,
        };
      }

      const rawList = (await response.json()) as NominatimRawItem[];
      if (!Array.isArray(rawList) || rawList.length === 0) {
        placeCache.set(normalized, []);
        return {
          status: 'empty',
          places: [],
          fromCache: false,
        };
      }

      const parsed: NominatimPlaceResult[] = [];
      for (const item of rawList) {
        const lat = Number.parseFloat(item.lat);
        const lng = Number.parseFloat(item.lon);
        if (!isValidCoordinates({ lat, lng })) {
          continue;
        }
        const primaryTitle =
          item.name && item.name.trim().length > 0
            ? item.name.trim()
            : item.display_name.split(',')[0]?.trim() || 'Kenya Location';

        parsed.push({
          placeId: String(item.place_id),
          title: primaryTitle,
          displayName: item.display_name,
          category: item.type || item.category || 'place',
          coordinates: { lat, lng },
          attribution: item.licence || '© OpenStreetMap contributors (ODbL)',
        });
      }

      placeCache.set(normalized, parsed);
      return {
        status: parsed.length > 0 ? 'ok' : 'empty',
        places: parsed,
        fromCache: false,
      };
    } catch {
      return {
        status: 'error',
        places: [],
        fromCache: false,
        errorMessage:
          'Unable to reach OpenStreetMap Nominatim place search. Check your internet connection or use STAGE’s built-in Nairobi route database below.',
      };
    } finally {
      inFlightRequests.delete(normalized);
    }
  })();

  inFlightRequests.set(normalized, requestPromise);
  return requestPromise;
}

/**
 * Matches a Nominatim geocoded place in Kenya against STAGE's internal route database
 * without ever fabricating a route or marking an unverified stage as verified.
 */
export function matchPlaceToStageDatabase(
  place: NominatimPlaceResult,
  originId: string,
  userCoords?: Coordinates | null
): {
  matchedRoutes: SearchMatchResult[];
  advisoryMessage: string;
} {
  // Check primary title first, then tokens from display_name
  const primaryMatches = searchRoutesAndStages(
    place.title,
    originId,
    'ALL',
    userCoords
  );
  if (primaryMatches.length > 0) {
    return {
      matchedRoutes: primaryMatches,
      advisoryMessage: `Matched "${place.title}" to ${primaryMatches.length} unverified demo route(s) in the STAGE database. Geocoder coordinates are separate from CBD boarding stage locations—verify on site.`,
    };
  }

  // Check tokens in display_name (e.g., "Juja, Thika Road, Kiambu")
  const tokens = place.displayName
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);

  for (const token of tokens) {
    const tokenMatches = searchRoutesAndStages(
      token,
      originId,
      'ALL',
      userCoords
    );
    if (tokenMatches.length > 0) {
      return {
        matchedRoutes: tokenMatches,
        advisoryMessage: `Found ${tokenMatches.length} unverified demo route(s) along "${token}" corridor for "${place.title}". Confirm exact stage bay and route number with the stage marshal.`,
      };
    }
  }

  return {
    matchedRoutes: [],
    advisoryMessage: `"${place.title}" (${place.coordinates.lat.toFixed(
      4
    )}, ${place.coordinates.lng.toFixed(
      4
    )}) was found via OpenStreetMap Nominatim, but STAGE does not yet have a verified CBD matatu boarding stage record for this destination.`,
  };
}

