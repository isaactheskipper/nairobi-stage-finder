import { BoardingStage, Coordinates } from '../types/transport';

/**
 * STAGE — Configurable Map, Routing & Geocoding Endpoints (OpenFreeMap + OSRM + Nominatim)
 *
 * All providers below are $0, open-source, key-free public services:
 * - MapLibre Vector Styles: OpenFreeMap (https://openfreemap.org) — NO API KEY OR ACCOUNT REQUIRED:
 *   - Light:    `https://tiles.openfreemap.org/styles/positron`
 *   - Standard: `https://tiles.openfreemap.org/styles/liberty`
 *   - Dark:     `https://tiles.openfreemap.org/styles/dark`
 *   (Note: These are MapLibre GL Style Specification JSON URLs, not raster PNG tile templates.)
 * - OSRM walking routes: FOSSGIS foot-profile server (`https://routing.openstreetmap.de/routed-foot`) —
 *   NO API KEY. (router.project-osrm.org is car-only and is never used for walking.)
 *   Replace via EXPO_PUBLIC_OSRM_BASE_URL with your own foot-profile osrm-backend for production.
 * - OpenStreetMap Nominatim (`https://nominatim.openstreetmap.org/search`) — NO API KEY REQUIRED
 *   (Complies with OSMF Nominatim Usage Policy: max 1 req/sec, explicit search submission only,
 *   custom User-Agent, caching enabled).
 */

export type OpenFreeMapStylePreset = 'positron' | 'liberty' | 'dark';

export interface StageMapConfig {
  osrmBaseUrl: string;
  osrmProfile: 'driving' | 'foot';
  nominatimSearchUrl: string;
  nominatimCountryCodes: string;
  nominatimLimit: number;
  /** OpenFreeMap Light vector style URL (`positron`) */
  maplibreStyleLightUrl: string;
  /** OpenFreeMap Standard vector style URL (`liberty`) */
  maplibreStyleStandardUrl: string;
  /** OpenFreeMap Dark vector style URL (`dark`) */
  maplibreStyleDarkUrl: string;
  /** Required OpenFreeMap & OpenStreetMap attribution text */
  attributionText: string;
  appUserAgent: string;
  nairobiDefaultCenter: { lat: number; lng: number };
  nairobiStageZoom: number;
}

function getEnvVar(key: string, fallback: string): string {
  try {
    const proc = (globalThis as unknown as {
      process?: { env?: Record<string, string | undefined> };
    }).process;
    if (proc?.env && proc.env[key] && proc.env[key]!.trim().length > 0) {
      return proc.env[key]!.trim();
    }
  } catch {
    // ignore
  }
  return fallback;
}

export const STAGE_MAP_CONFIG: StageMapConfig = {
  osrmBaseUrl: getEnvVar(
    'EXPO_PUBLIC_OSRM_BASE_URL',
    'https://routing.openstreetmap.de/routed-foot'
  ),
  osrmProfile: 'foot',
  nominatimSearchUrl: getEnvVar(
    'EXPO_PUBLIC_NOMINATIM_BASE_URL',
    'https://nominatim.openstreetmap.org/search'
  ),
  nominatimCountryCodes: 'ke',
  nominatimLimit: 5,
  maplibreStyleLightUrl: getEnvVar(
    'EXPO_PUBLIC_MAPLIBRE_STYLE_LIGHT',
    'https://tiles.openfreemap.org/styles/positron'
  ),
  maplibreStyleStandardUrl: getEnvVar(
    'EXPO_PUBLIC_MAPLIBRE_STYLE_STANDARD',
    'https://tiles.openfreemap.org/styles/liberty'
  ),
  maplibreStyleDarkUrl: getEnvVar(
    'EXPO_PUBLIC_MAPLIBRE_STYLE_DARK',
    'https://tiles.openfreemap.org/styles/dark'
  ),
  attributionText: 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
  appUserAgent:
    'STAGE-Nairobi-Stage-Finder/0.1.0 (https://stage-nairobi.example; contact@stage-nairobi.example)',
  nairobiDefaultCenter: { lat: -1.286389, lng: 36.817223 },
  nairobiStageZoom: 16,
};

/**
 * Returns the configured OpenFreeMap MapLibre vector style URL for the requested preset or theme.
 * Note: Returns a MapLibre GL Style Specification JSON URL (never a raster PNG tile URL).
 */
export function getOpenFreeMapStyleUrl(
  presetOrIsDark: OpenFreeMapStylePreset | boolean
): string {
  if (typeof presetOrIsDark === 'boolean') {
    return presetOrIsDark
      ? STAGE_MAP_CONFIG.maplibreStyleDarkUrl
      : STAGE_MAP_CONFIG.maplibreStyleStandardUrl;
  }
  if (presetOrIsDark === 'dark') {
    return STAGE_MAP_CONFIG.maplibreStyleDarkUrl;
  }
  if (presetOrIsDark === 'positron') {
    return STAGE_MAP_CONFIG.maplibreStyleLightUrl;
  }
  return STAGE_MAP_CONFIG.maplibreStyleStandardUrl;
}

export interface OpenFreeMapHtmlOptions {
  styleUrl: string;
  /** Marker for the user's start point; null hides it. */
  originCoords: Coordinates | null;
  originLabel: string;
  selectedStage: BoardingStage;
  allStages: BoardingStage[];
  routePolyline: Coordinates[];
  /** null while the walking route is still loading or unavailable. */
  activeMinutes: number | null;
  formattedDistance: string;
  routeNumber: string;
  isDark: boolean;
}

/**
 * Generates a self-contained MapLibre GL JS HTML document powered by OpenFreeMap
 * vector styles (`positron`, `liberty`, or `dark`) for the Expo Go WebView fallback
 * and Web viewport. Renders the OSRM GeoJSON route line, user position marker,
 * and interactive boarding stage markers without any API key or raster PNG tile URLs.
 */
export function buildOpenFreeMapHtml(options: OpenFreeMapHtmlOptions): string {
  const {
    styleUrl,
    originCoords,
    originLabel,
    selectedStage,
    allStages,
    routePolyline,
    activeMinutes,
    formattedDistance,
    routeNumber,
    isDark,
  } = options;

  // Only a real routed polyline is ever drawn. With no route (loading or routing
  // failed) the map shows the markers only - never a made-up straight line.
  const lineCoords =
    routePolyline.length >= 2 ? routePolyline.map((c) => [c.lng, c.lat]) : [];

  const stagesPayload = allStages.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    lat: s.coordinates.lat,
    lng: s.coordinates.lng,
    isSelected: s.id === selectedStage.id,
  }));

  const payloadJson = JSON.stringify({
    styleUrl,
    origin: originCoords
      ? { lat: originCoords.lat, lng: originCoords.lng, label: originLabel }
      : null,
    selectedStage: {
      id: selectedStage.id,
      name: selectedStage.name,
      lat: selectedStage.coordinates.lat,
      lng: selectedStage.coordinates.lng,
    },
    stages: stagesPayload,
    lineCoords,
    activeMinutes: activeMinutes === undefined ? null : activeMinutes,
    formattedDistance,
    routeNumber,
    isDark,
  });

  const bgHex = isDark ? '#0B0F0D' : '#EDEFE9';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" />
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #map { width: 100%; height: 100%; background: ${bgHex}; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .stage-origin-wrap { display: flex; flex-direction: column; align-items: center; pointer-events: none; }
  .stage-origin-dot { width: 20px; height: 20px; border-radius: 50%; background: #0D1310; border: 3px solid #FFFFFF; box-shadow: 0 2px 8px rgba(0,0,0,0.38); display: flex; align-items: center; justify-content: center; }
  .stage-origin-inner { width: 6px; height: 6px; border-radius: 50%; background: #35F58A; }
  .stage-origin-pill { margin-top: 4px; background: rgba(13, 19, 16, 0.92); color: #FFFFFF; font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.22); white-space: nowrap; }
  .stage-marker-btn { display: flex; flex-direction: column; align-items: center; cursor: pointer; background: transparent; border: none; padding: 0; }
  .board-here-tag { background: #00B84C; color: #05120A; font-family: monospace; font-size: 8.5px; font-weight: 900; letter-spacing: 0.4px; padding: 2px 6px; border-radius: 5px; margin-bottom: 3px; box-shadow: 0 2px 6px rgba(0,0,0,0.3); white-space: nowrap; }
  .stage-pin-active { width: 26px; height: 26px; border-radius: 7px; background: #00B84C; border: 2px solid #FFFFFF; box-shadow: 0 3px 10px rgba(0,184,76,0.48); display: flex; align-items: center; justify-content: center; color: #05120A; font-weight: 900; font-size: 12px; }
  .stage-pin-inactive { width: 18px; height: 18px; border-radius: 9px; background: #26312B; border: 1.5px solid #FFFFFF; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
  .stage-callout { margin-top: 4px; display: flex; align-items: center; background: rgba(12, 18, 15, 0.94); border: 1.5px solid #00B84C; border-radius: 8px; overflow: hidden; box-shadow: 0 3px 10px rgba(0,0,0,0.35); white-space: nowrap; }
  .stage-callout-min { background: #00B84C; color: #05120A; font-family: monospace; font-size: 10px; font-weight: 900; padding: 4px 6px; text-align: center; line-height: 1.05; }
  .stage-callout-body { padding: 3px 7px; color: #F5F7F5; font-size: 10px; font-weight: 800; }
  .stage-callout-sub { color: #9FB0A6; font-family: monospace; font-size: 8.5px; font-weight: 700; }
</style>
</head>
<body>
<div id="map"></div>
<script>
(function () {
  var cfg = ${payloadJson};
  function notifyHost(msg) {
    try {
      var str = JSON.stringify(msg);
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(str);
      } else if (window.parent && window.parent !== window) {
        window.parent.postMessage(str, '*');
      }
    } catch (e) {}
  }
  function esc(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  if (typeof maplibregl === 'undefined') {
    notifyHost({ type: 'MAP_ERROR', reason: 'maplibregl_unavailable' });
    return;
  }

  try {
    var map = new maplibregl.Map({
      container: 'map',
      style: cfg.styleUrl,
      center: [cfg.selectedStage.lng, cfg.selectedStage.lat],
      zoom: 15.4,
      attributionControl: false
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    window.__stageMap = map;

    var loaded = false;
    var state = { line: cfg.lineCoords, user: cfg.origin };
    var userMarker = null;
    var minEl = null, subEl = null;

    function routeData() {
      return {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: state.line.length >= 2 ? state.line : [] }
      };
    }

    function fit(animate) {
      var b = new maplibregl.LngLatBounds();
      b.extend([cfg.selectedStage.lng, cfg.selectedStage.lat]);
      if (state.user) b.extend([state.user.lng, state.user.lat]);
      state.line.forEach(function (pt) { b.extend(pt); });
      map.fitBounds(b, {
        padding: { top: 112, bottom: 130, left: 56, right: 72 },
        maxZoom: 16.6,
        duration: animate ? 500 : 0
      });
    }

    function renderUser() {
      if (!state.user) {
        if (userMarker) { userMarker.remove(); userMarker = null; }
        return;
      }
      if (!userMarker) {
        var el = document.createElement('div');
        el.className = 'stage-origin-wrap';
        el.innerHTML =
          '<div class="stage-origin-dot"><div class="stage-origin-inner"></div></div>' +
          '<div class="stage-origin-pill"></div>';
        userMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([state.user.lng, state.user.lat]).addTo(map);
      }
      userMarker.setLngLat([state.user.lng, state.user.lat]);
      userMarker.getElement().querySelector('.stage-origin-pill').textContent = state.user.label || '';
    }

    function renderCallout(minutes, dist) {
      if (minEl) minEl.innerHTML = (minutes === null ? '–' : esc(minutes)) + '<br/>MIN';
      if (subEl) subEl.textContent = (dist || '') + (dist ? ' · ' : '') + 'RT ' + cfg.routeNumber;
    }

    map.on('error', function (evt) {
      if (evt && evt.error && String(evt.error.message || '').indexOf('style') !== -1) {
        notifyHost({ type: 'MAP_ERROR', reason: 'style_load_error' });
      }
    });

    map.on('load', function () {
      loaded = true;
      map.addSource('osrm-route', { type: 'geojson', data: routeData() });
      map.addLayer({
        id: 'osrm-route-casing', type: 'line', source: 'osrm-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': cfg.isDark ? '#05100A' : '#FFFFFF', 'line-width': 8, 'line-opacity': 0.85 }
      });
      map.addLayer({
        id: 'osrm-route-line', type: 'line', source: 'osrm-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#00B84C', 'line-width': 5, 'line-opacity': 1 }
      });
      fit(false);
      notifyHost({ type: 'MAP_LOADED' });
    });

    renderUser();

    cfg.stages.forEach(function (stg) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'stage-marker-btn';
      if (stg.isSelected) {
        btn.innerHTML =
          '<div class="board-here-tag">BOARD HERE</div>' +
          '<div class="stage-pin-active">&#9650;</div>' +
          '<div class="stage-callout">' +
            '<div class="stage-callout-min"></div>' +
            '<div class="stage-callout-body">' +
              '<div>' + esc(stg.name.replace(' (Demo)', '')) + '</div>' +
              '<div class="stage-callout-sub"></div>' +
            '</div>' +
          '</div>';
        minEl = btn.querySelector('.stage-callout-min');
        subEl = btn.querySelector('.stage-callout-sub');
        renderCallout(cfg.activeMinutes === null ? null : cfg.activeMinutes, cfg.formattedDistance);
      } else {
        btn.innerHTML = '<div class="stage-pin-inactive"></div>';
      }
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        notifyHost({ type: 'SELECT_STAGE', stageId: stg.id });
      });
      new maplibregl.Marker({ element: btn, anchor: 'center' })
        .setLngLat([stg.lng, stg.lat]).addTo(map);
    });

    /* Incremental updates from React Native (no WebView reload on GPS ticks). */
    window.__stageApply = function (msg) {
      if (msg.type === 'route') {
        state.line = msg.line || [];
        renderCallout(msg.minutes === undefined ? null : msg.minutes, msg.dist || '');
        if (loaded && map.getSource('osrm-route')) map.getSource('osrm-route').setData(routeData());
        if (msg.fit !== false) fit(true);
      } else if (msg.type === 'user') {
        state.user = msg.user;
        renderUser();
        if (msg.fit) fit(true);
      } else if (msg.type === 'fit') {
        fit(true);
      } else if (msg.type === 'center-user') {
        if (state.user) map.flyTo({ center: [state.user.lng, state.user.lat], zoom: Math.max(map.getZoom(), 16) });
      }
    };
  } catch (err) {
    notifyHost({ type: 'MAP_ERROR', reason: String(err) });
  }
})();
</script>
</body>
</html>`;
}
