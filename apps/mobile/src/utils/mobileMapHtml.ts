import { BoardingStage, Coordinates } from '@stage/shared';

export interface MobileMapHtmlOptions {
  styleUrl: string;
  originCoords: Coordinates | null;
  originLabel: string;
  selectedStage: BoardingStage;
  allStages: BoardingStage[];
  routeNumber: string;
  isDark: boolean;
}

/**
 * Builds the MapLibre GL JS HTML document for the native Android WebView.
 *
 * Capabilities:
 * - Renders quiet alternative route lines (`osrm-alt-routes`) beneath the primary emerald route (`osrm-route`).
 * - Tapping an alternative route line on the map notifies the React Native host (`SELECT_ALT_ROUTE`).
 * - Progressively animates real route geometry appearing on the map over ~420ms (`requestAnimationFrame`),
 *   then stops completely so zero animations run when the map is idle.
 * - Highlights the active turn maneuver coordinate (`osrm-active-step`) during live navigation.
 * - Smoothly frames origin, destination, and route geometry (`fitBounds` / `easeTo`) without repeated camera jumps.
 */
export function buildMobileStageMapHtml(options: MobileMapHtmlOptions): string {
  const {
    styleUrl,
    originCoords,
    originLabel,
    selectedStage,
    allStages,
    routeNumber,
    isDark,
  } = options;

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
    routeNumber,
    isDark,
  });

  const bgHex = isDark ? '#0B0F0D' : '#EDEFE9';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" onerror="this.onerror=null;this.href='https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css';" />
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #map { width: 100%; height: 100%; background: ${bgHex}; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .stage-origin-wrap { display: flex; flex-direction: column; align-items: center; pointer-events: none; z-index: 4; }
  .stage-origin-dot { width: 24px; height: 24px; border-radius: 50%; background: #0D1512; border: 3px solid #FFFFFF; box-shadow: 0 0 0 5px rgba(43,217,133,0.32), 0 3px 10px rgba(0,0,0,0.48); display: flex; align-items: center; justify-content: center; }
  .stage-origin-inner { width: 9px; height: 9px; border-radius: 50%; background: #2BD985; }
  .stage-origin-pill { margin-top: 5px; background: rgba(9, 16, 13, 0.94); color: #FFFFFF; font-size: 10.5px; font-weight: 800; padding: 3px 8px; border-radius: 7px; border: 1px solid rgba(43,217,133,0.48); box-shadow: 0 2px 8px rgba(0,0,0,0.35); white-space: nowrap; }
  .stage-marker-btn { display: flex; flex-direction: column; align-items: center; cursor: pointer; background: transparent; border: none; padding: 0; }
  .board-here-tag { background: #2BD985; color: #04120B; font-family: monospace; font-size: 9px; font-weight: 900; letter-spacing: 0.4px; padding: 2px 7px; border-radius: 6px; margin-bottom: 3px; box-shadow: 0 2px 8px rgba(0,0,0,0.35); white-space: nowrap; }
  .stage-pin-active { width: 28px; height: 28px; border-radius: 8px; background: #2BD985; border: 2.5px solid #FFFFFF; box-shadow: 0 0 0 4px rgba(43,217,133,0.3), 0 4px 12px rgba(0,184,76,0.55); display: flex; align-items: center; justify-content: center; color: #04120B; font-weight: 900; font-size: 12px; }
  .stage-pin-inactive { width: 18px; height: 18px; border-radius: 9px; background: #26312B; border: 1.5px solid #FFFFFF; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
  .stage-callout { margin-top: 4px; display: flex; align-items: center; background: rgba(9, 16, 13, 0.95); border: 1.5px solid #2BD985; border-radius: 9px; overflow: hidden; box-shadow: 0 4px 14px rgba(0,0,0,0.45); white-space: nowrap; }
  .stage-callout-min { background: #2BD985; color: #04120B; font-family: monospace; font-size: 10px; font-weight: 900; padding: 4px 7px; text-align: center; line-height: 1.05; }
  .stage-callout-body { padding: 3px 8px; color: #F5F7F5; font-size: 10.5px; font-weight: 800; }
  .stage-callout-sub { color: #A6BDB0; font-family: monospace; font-size: 8.5px; font-weight: 700; }
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

  function bootMap() {
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

      var readySignaled = false;
      var animFrameId = null;
      var lastRouteSig = '';
      var state = {
        line: [],
        altLines: [],
        activeStepCoord: null,
        user: cfg.origin,
        bottomPad: 250,
        modeLabel: 'MIN'
      };
      var userMarker = null;
      var minEl = null, subEl = null;

      function validPair(pt) {
        return Array.isArray(pt) && pt.length >= 2 && isFinite(pt[0]) && isFinite(pt[1]);
      }

      function sanitizeCoords(arr) {
        if (!Array.isArray(arr)) return [];
        var pts = [];
        for (var i = 0; i < arr.length; i++) {
          if (validPair(arr[i])) {
            pts.push([Number(arr[i][0]), Number(arr[i][1])]);
          }
        }
        return pts.length >= 2 ? pts : [];
      }

      function buildLineFeature(coords) {
        return {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: coords }
        };
      }

      function buildAltFeatures() {
        var features = [];
        if (Array.isArray(state.altLines)) {
          for (var i = 0; i < state.altLines.length; i++) {
            var item = state.altLines[i];
            var coords = sanitizeCoords(item && item.coords ? item.coords : item);
            if (coords.length >= 2) {
              features.push({
                type: 'Feature',
                properties: {
                  optionIndex: item && typeof item.optionIndex === 'number' ? item.optionIndex : i + 1
                },
                geometry: { type: 'LineString', coordinates: coords }
              });
            }
          }
        }
        return { type: 'FeatureCollection', features: features };
      }

      function endpointsData(coords) {
        if (!coords || coords.length < 2) {
          return { type: 'FeatureCollection', features: [] };
        }
        return {
          type: 'FeatureCollection',
          features: [
            { type: 'Feature', properties: { role: 'start' }, geometry: { type: 'Point', coordinates: coords[0] } },
            { type: 'Feature', properties: { role: 'end' }, geometry: { type: 'Point', coordinates: coords[coords.length - 1] } }
          ]
        };
      }

      function activeStepData() {
        if (!state.activeStepCoord || !validPair(state.activeStepCoord)) {
          return { type: 'FeatureCollection', features: [] };
        }
        return {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: { type: 'Point', coordinates: [Number(state.activeStepCoord[0]), Number(state.activeStepCoord[1])] }
            }
          ]
        };
      }

      function ensureRouteLayers() {
        try {
          if (!map.isStyleLoaded() && !map.getStyle()) return false;

          if (!map.getSource('osrm-alt-routes')) {
            map.addSource('osrm-alt-routes', { type: 'geojson', data: buildAltFeatures() });
          }
          if (!map.getSource('osrm-route')) {
            map.addSource('osrm-route', { type: 'geojson', data: buildLineFeature(sanitizeCoords(state.line)) });
          }
          if (!map.getSource('osrm-route-endpoints')) {
            map.addSource('osrm-route-endpoints', { type: 'geojson', data: endpointsData(sanitizeCoords(state.line)) });
          }
          if (!map.getSource('osrm-active-step')) {
            map.addSource('osrm-active-step', { type: 'geojson', data: activeStepData() });
          }

          // 1. Quiet alternative routes (drawn beneath primary route)
          if (!map.getLayer('osrm-alt-casing')) {
            map.addLayer({
              id: 'osrm-alt-casing',
              type: 'line',
              source: 'osrm-alt-routes',
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: {
                'line-color': cfg.isDark ? 'rgba(6, 16, 12, 0.78)' : 'rgba(20, 42, 32, 0.45)',
                'line-width': 7.5,
                'line-opacity': 0.85
              }
            });
          }
          if (!map.getLayer('osrm-alt-line')) {
            map.addLayer({
              id: 'osrm-alt-line',
              type: 'line',
              source: 'osrm-alt-routes',
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: {
                'line-color': cfg.isDark ? '#6E9987' : '#527A68',
                'line-width': 4.5,
                'line-opacity': 0.72,
                'line-dasharray': [2, 1.4]
              }
            });
            map.on('click', 'osrm-alt-line', function (e) {
              if (e && e.features && e.features[0] && e.features[0].properties) {
                var idx = Number(e.features[0].properties.optionIndex);
                if (isFinite(idx)) {
                  notifyHost({ type: 'SELECT_ALT_ROUTE', optionIndex: idx });
                }
              }
            });
          }

          // 2. Selected primary route (emerald highlight)
          if (!map.getLayer('osrm-route-glow')) {
            map.addLayer({
              id: 'osrm-route-glow',
              type: 'line',
              source: 'osrm-route',
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: {
                'line-color': '#2BD985',
                'line-width': 14,
                'line-opacity': cfg.isDark ? 0.28 : 0.22,
                'line-blur': 4
              }
            });
          }
          if (!map.getLayer('osrm-route-casing')) {
            map.addLayer({
              id: 'osrm-route-casing',
              type: 'line',
              source: 'osrm-route',
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: {
                'line-color': cfg.isDark ? '#04120B' : '#06371E',
                'line-width': 9,
                'line-opacity': 0.94
              }
            });
          }
          if (!map.getLayer('osrm-route-line')) {
            map.addLayer({
              id: 'osrm-route-line',
              type: 'line',
              source: 'osrm-route',
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: {
                'line-color': cfg.isDark ? '#2BD985' : '#00C853',
                'line-width': 5.5,
                'line-opacity': 1
              }
            });
          }
          if (!map.getLayer('osrm-route-endpoints')) {
            map.addLayer({
              id: 'osrm-route-endpoints',
              type: 'circle',
              source: 'osrm-route-endpoints',
              paint: {
                'circle-radius': 5,
                'circle-color': '#2BD985',
                'circle-stroke-width': 2,
                'circle-stroke-color': '#FFFFFF'
              }
            });
          }
          if (!map.getLayer('osrm-active-step-halo')) {
            map.addLayer({
              id: 'osrm-active-step-halo',
              type: 'circle',
              source: 'osrm-active-step',
              paint: {
                'circle-radius': 11,
                'circle-color': 'rgba(43, 217, 133, 0.28)',
                'circle-stroke-width': 1.5,
                'circle-stroke-color': '#2BD985'
              }
            });
          }
          if (!map.getLayer('osrm-active-step-dot')) {
            map.addLayer({
              id: 'osrm-active-step-dot',
              type: 'circle',
              source: 'osrm-active-step',
              paint: {
                'circle-radius': 5.5,
                'circle-color': '#FFFFFF',
                'circle-stroke-width': 2.5,
                'circle-stroke-color': '#04120B'
              }
            });
          }
          return true;
        } catch (err) {
          return false;
        }
      }

      function cancelRouteAnimation() {
        if (animFrameId !== null) {
          cancelAnimationFrame(animFrameId);
          animFrameId = null;
        }
      }

      function syncRouteOnMap(animateDraw) {
        ensureRouteLayers();
        cancelRouteAnimation();

        try {
          var altSrc = map.getSource('osrm-alt-routes');
          if (altSrc && typeof altSrc.setData === 'function') {
            altSrc.setData(buildAltFeatures());
          }
          var stepSrc = map.getSource('osrm-active-step');
          if (stepSrc && typeof stepSrc.setData === 'function') {
            stepSrc.setData(activeStepData());
          }

          var fullCoords = sanitizeCoords(state.line);
          var routeSrc = map.getSource('osrm-route');
          var epSrc = map.getSource('osrm-route-endpoints');

          if (epSrc && typeof epSrc.setData === 'function') {
            epSrc.setData(endpointsData(fullCoords));
          }

          if (!routeSrc || typeof routeSrc.setData !== 'function') return;

          if (!animateDraw || fullCoords.length < 3) {
            routeSrc.setData(buildLineFeature(fullCoords));
            return;
          }

          // Progressive 420ms route draw animation for real geometry, then idle
          var startTime = performance.now();
          var durationMs = 420;
          var totalPts = fullCoords.length;

          function stepFrame(now) {
            var t = Math.min(1, (now - startTime) / durationMs);
            // Cubic ease-out
            var eased = 1 - Math.pow(1 - t, 3);
            var count = Math.max(2, Math.ceil(eased * totalPts));
            var slice = fullCoords.slice(0, count);
            try {
              routeSrc.setData(buildLineFeature(slice));
            } catch (e) {}
            if (t < 1) {
              animFrameId = requestAnimationFrame(stepFrame);
            } else {
              animFrameId = null;
            }
          }
          animFrameId = requestAnimationFrame(stepFrame);
        } catch (err) {}
      }

      function fit(animate, customBottomPad) {
        if (typeof customBottomPad === 'number' && isFinite(customBottomPad)) {
          state.bottomPad = customBottomPad;
        }
        var b = new maplibregl.LngLatBounds();
        b.extend([cfg.selectedStage.lng, cfg.selectedStage.lat]);
        if (state.user && isFinite(state.user.lng) && isFinite(state.user.lat)) {
          b.extend([state.user.lng, state.user.lat]);
        }
        var coords = sanitizeCoords(state.line);
        coords.forEach(function (pt) { b.extend(pt); });
        try {
          map.fitBounds(b, {
            padding: { top: 108, bottom: state.bottomPad, left: 52, right: 68 },
            maxZoom: 16.5,
            duration: animate ? 500 : 0
          });
        } catch (err) {}
      }

      function renderUser() {
        if (!state.user || !isFinite(state.user.lng) || !isFinite(state.user.lat)) {
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
        var pill = userMarker.getElement().querySelector('.stage-origin-pill');
        if (pill) pill.textContent = state.user.label || 'Start';
      }

      function renderCallout(minutes, dist, modeShort) {
        var unit = modeShort ? esc(modeShort).toUpperCase() : 'MIN';
        if (minEl) minEl.innerHTML = (minutes === null || minutes === undefined ? '–' : esc(minutes) + 'm') + '<br/>' + unit;
        if (subEl) subEl.textContent = (dist || '') + (dist ? ' · ' : '') + 'RT ' + cfg.routeNumber;
      }

      function onStyleOrMapReady() {
        syncRouteOnMap(false);
        if (!readySignaled) {
          readySignaled = true;
          fit(false);
          notifyHost({ type: 'MAP_LOADED' });
        }
      }

      map.on('style.load', onStyleOrMapReady);
      map.on('load', onStyleOrMapReady);

      map.on('error', function (evt) {
        if (evt && evt.error && String(evt.error.message || '').indexOf('style') !== -1 && !readySignaled) {
          notifyHost({ type: 'MAP_ERROR', reason: 'style_load_error' });
        }
      });

      renderUser();

      cfg.stages.forEach(function (stg) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'stage-marker-btn';
        if (stg.isSelected) {
          btn.style.zIndex = '5';
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
          renderCallout(null, '', 'WALK');
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

      fit(false);

      window.__stageApply = function (msg) {
        if (!msg) return;
        if (msg.type === 'route') {
          state.line = Array.isArray(msg.line) ? msg.line : [];
          state.altLines = Array.isArray(msg.altLines) ? msg.altLines : [];
          if (msg.activeStepCoord !== undefined) {
            state.activeStepCoord = msg.activeStepCoord;
          }
          var newSig = (msg.sig || '') + ':' + state.line.length;
          var shouldAnimateDraw = Boolean(msg.animateDraw !== false && state.line.length >= 2 && newSig !== lastRouteSig);
          lastRouteSig = newSig;

          renderCallout(msg.minutes === undefined ? null : msg.minutes, msg.dist || '', msg.modeShort || 'MIN');
          syncRouteOnMap(shouldAnimateDraw);
          if (msg.fit !== false) fit(true, msg.bottomPad);
        } else if (msg.type === 'active-step') {
          state.activeStepCoord = msg.coord || null;
          ensureRouteLayers();
          try {
            var stepSrc = map.getSource('osrm-active-step');
            if (stepSrc && typeof stepSrc.setData === 'function') {
              stepSrc.setData(activeStepData());
            }
          } catch (e) {}
          if (msg.pan && state.activeStepCoord && validPair(state.activeStepCoord)) {
            try {
              map.easeTo({
                center: [Number(state.activeStepCoord[0]), Number(state.activeStepCoord[1])],
                zoom: Math.max(map.getZoom(), 16.2),
                padding: { top: 120, bottom: state.bottomPad, left: 40, right: 40 },
                duration: 420
              });
            } catch (e) {}
          }
        } else if (msg.type === 'user') {
          state.user = msg.user;
          renderUser();
          if (msg.fit) fit(true, msg.bottomPad);
        } else if (msg.type === 'fit') {
          fit(true, msg.bottomPad);
        } else if (msg.type === 'center-user') {
          if (state.user) {
            map.flyTo({
              center: [state.user.lng, state.user.lat],
              zoom: Math.max(map.getZoom(), 16.2),
              duration: 450
            });
          }
        }
      };
    } catch (err) {
      notifyHost({ type: 'MAP_ERROR', reason: String(err) });
    }
  }

  if (typeof maplibregl !== 'undefined') {
    bootMap();
  } else {
    var fallbackScript = document.createElement('script');
    fallbackScript.src = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js';
    fallbackScript.onload = bootMap;
    fallbackScript.onerror = function () {
      notifyHost({ type: 'MAP_ERROR', reason: 'maplibregl_cdn_failed' });
    };
    document.head.appendChild(fallbackScript);
  }
})();
</script>
</body>
</html>`;
}

