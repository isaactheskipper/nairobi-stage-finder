import { BoardingStage, Coordinates } from '@stage/shared';

export interface StageMapApplyMessage {
  type: 'route' | 'user' | 'fit' | 'center-user';
  line?: [number, number][];
  minutes?: number | null;
  dist?: string;
  bottomPad?: number;
  fit?: boolean;
  user?: { lat: number; lng: number; label: string } | null;
}

export interface MountStageMapOptions {
  container: HTMLElement;
  styleUrl: string;
  isDark: boolean;
  originCoords: Coordinates | null;
  originLabel: string;
  selectedStage: BoardingStage;
  allStages: BoardingStage[];
  routeNumber: string;
  initialPolyline: Coordinates[];
  initialMinutes: number | null;
  initialDistanceLabel: string;
  initialBottomPad?: number;
  onMapReady?: () => void;
  onMapError?: (reason: string) => void;
  onSelectStageById?: (stageId: string) => void;
}

export interface StageMapController {
  apply: (msg: StageMapApplyMessage) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  destroy: () => void;
}

interface MapLibreGeoJSONSource {
  setData: (data: object) => void;
}

interface MapLibreMarkerInstance {
  setLngLat: (lngLat: [number, number]) => MapLibreMarkerInstance;
  addTo: (map: MapLibreMapInstance) => MapLibreMarkerInstance;
  remove: () => void;
  getElement: () => HTMLElement;
}

interface MapLibreBoundsInstance {
  extend: (lngLat: [number, number]) => MapLibreBoundsInstance;
}

interface MapLibreMapInstance {
  addControl: (ctrl: unknown, pos?: string) => void;
  on: (event: string, cb: (evt?: unknown) => void) => void;
  remove: () => void;
  isStyleLoaded: () => boolean;
  loaded: () => boolean;
  getStyle: () => { layers?: Array<{ id: string }> } | undefined;
  getSource: (id: string) => MapLibreGeoJSONSource | undefined;
  addSource: (id: string, spec: object) => void;
  getLayer: (id: string) => unknown;
  addLayer: (spec: object) => void;
  fitBounds: (
    bounds: MapLibreBoundsInstance,
    options?: {
      padding?: { top: number; bottom: number; left: number; right: number };
      maxZoom?: number;
      duration?: number;
    }
  ) => void;
  flyTo: (options: { center: [number, number]; zoom: number }) => void;
  getZoom: () => number;
  zoomIn: () => void;
  zoomOut: () => void;
}

interface MapLibreGlobal {
  Map: new (options: {
    container: HTMLElement;
    style: string;
    center: [number, number];
    zoom: number;
    attributionControl?: boolean;
  }) => MapLibreMapInstance;
  AttributionControl: new (options?: { compact?: boolean }) => unknown;
  Marker: new (options?: {
    element?: HTMLElement;
    anchor?: string;
  }) => MapLibreMarkerInstance;
  LngLatBounds: new () => MapLibreBoundsInstance;
}

declare global {
  interface Window {
    maplibregl?: MapLibreGlobal;
    __stageMap?: MapLibreMapInstance | null;
    __stageApply?: ((msg: StageMapApplyMessage) => void) | null;
  }
}

const isDev = Boolean(import.meta.env?.DEV);

function devLog(label: string, payload: Record<string, unknown>): void {
  if (isDev && typeof console !== 'undefined' && typeof console.info === 'function') {
    console.info(`[STAGE Map] ${label}`, payload);
  }
}

function devWarn(label: string, payload: Record<string, unknown>): void {
  if (isDev && typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(`[STAGE Map] ${label}`, payload);
  }
}

function escapeHtml(text: string): string {
  return String(text).replace(/[&<>"']/g, (ch) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return map[ch] ?? ch;
  });
}

let maplibreLoadPromise: Promise<MapLibreGlobal> | null = null;

export function ensureMapLibreLoaded(): Promise<MapLibreGlobal> {
  if (typeof window !== 'undefined' && window.maplibregl) {
    return Promise.resolve(window.maplibregl);
  }
  if (maplibreLoadPromise) {
    return maplibreLoadPromise;
  }

  maplibreLoadPromise = new Promise<MapLibreGlobal>((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      reject(new Error('Browser window unavailable'));
      return;
    }

    // If a script tag is already in the head (e.g. from index.html), poll briefly before injecting fallback
    let ticks = 0;
    const poll = window.setInterval(() => {
      ticks += 1;
      if (window.maplibregl) {
        window.clearInterval(poll);
        resolve(window.maplibregl);
      } else if (ticks >= 25) {
        window.clearInterval(poll);
        loadFromCdn('https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js')
          .catch(() =>
            loadFromCdn(
              'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js'
            )
          )
          .then(resolve)
          .catch((err) => {
            maplibreLoadPromise = null;
            reject(err);
          });
      }
    }, 80);
  });

  return maplibreLoadPromise;
}

function loadFromCdn(src: string): Promise<MapLibreGlobal> {
  return new Promise<MapLibreGlobal>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      if (window.maplibregl) {
        resolve(window.maplibregl);
      } else {
        reject(new Error(`maplibregl missing after loading ${src}`));
      }
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

export function mountStageMapLibre(
  options: MountStageMapOptions
): StageMapController {
  const {
    container,
    styleUrl,
    isDark,
    originCoords,
    originLabel,
    selectedStage,
    allStages,
    routeNumber,
    initialPolyline,
    initialMinutes,
    initialDistanceLabel,
    initialBottomPad = 240,
    onMapReady,
    onMapError,
    onSelectStageById,
  } = options;

  let destroyed = false;
  let mapInstance: MapLibreMapInstance | null = null;
  let styleReady = false;
  let readySignaled = false;
  let userMarker: MapLibreMarkerInstance | null = null;
  const stageMarkers: MapLibreMarkerInstance[] = [];
  let minEl: HTMLElement | null = null;
  let subEl: HTMLElement | null = null;

  const state: {
    line: [number, number][];
    user: { lat: number; lng: number; label: string } | null;
    minutes: number | null;
    dist: string;
    bottomPad: number;
  } = {
    line:
      initialPolyline.length >= 2
        ? initialPolyline.map((c) => [c.lng, c.lat])
        : [],
    user: originCoords
      ? { lat: originCoords.lat, lng: originCoords.lng, label: originLabel }
      : null,
    minutes: initialMinutes,
    dist: initialDistanceLabel,
    bottomPad: initialBottomPad,
  };

  function validPair(pt: unknown): pt is [number, number] {
    return (
      Array.isArray(pt) &&
      pt.length >= 2 &&
      typeof pt[0] === 'number' &&
      typeof pt[1] === 'number' &&
      Number.isFinite(pt[0]) &&
      Number.isFinite(pt[1])
    );
  }

  function cleanLineCoords(): [number, number][] {
    if (!Array.isArray(state.line)) return [];
    const pts: [number, number][] = [];
    for (let i = 0; i < state.line.length; i += 1) {
      const candidate = state.line[i];
      if (validPair(candidate)) {
        pts.push([Number(candidate[0]), Number(candidate[1])]);
      }
    }
    return pts.length >= 2 ? pts : [];
  }

  function routeGeoJson() {
    const coords = cleanLineCoords();
    return {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: coords,
      },
    };
  }

  function endpointsGeoJson() {
    const coords = cleanLineCoords();
    if (coords.length < 2) {
      return { type: 'FeatureCollection', features: [] };
    }
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { role: 'start' },
          geometry: { type: 'Point', coordinates: coords[0] },
        },
        {
          type: 'Feature',
          properties: { role: 'end' },
          geometry: {
            type: 'Point',
            coordinates: coords[coords.length - 1],
          },
        },
      ],
    };
  }

  function ensureRouteLayers(): {
    sourceCreated: boolean;
    layersCreated: boolean;
  } {
    if (!mapInstance || !styleReady) {
      return { sourceCreated: false, layersCreated: false };
    }
    let sourceCreated = false;
    let layersCreated = false;
    try {
      if (!mapInstance.getSource('osrm-route')) {
        mapInstance.addSource('osrm-route', {
          type: 'geojson',
          data: routeGeoJson(),
        });
        sourceCreated = true;
      }
      if (!mapInstance.getSource('osrm-route-endpoints')) {
        mapInstance.addSource('osrm-route-endpoints', {
          type: 'geojson',
          data: endpointsGeoJson(),
        });
      }
      if (!mapInstance.getLayer('osrm-route-glow')) {
        mapInstance.addLayer({
          id: 'osrm-route-glow',
          type: 'line',
          source: 'osrm-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#2BD985',
            'line-width': 14,
            'line-opacity': isDark ? 0.28 : 0.22,
            'line-blur': 4,
          },
        });
        layersCreated = true;
      }
      if (!mapInstance.getLayer('osrm-route-casing')) {
        mapInstance.addLayer({
          id: 'osrm-route-casing',
          type: 'line',
          source: 'osrm-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': isDark ? '#04120B' : '#06371E',
            'line-width': 9,
            'line-opacity': 0.94,
          },
        });
        layersCreated = true;
      }
      if (!mapInstance.getLayer('osrm-route-line')) {
        mapInstance.addLayer({
          id: 'osrm-route-line',
          type: 'line',
          source: 'osrm-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': isDark ? '#2BD985' : '#00C853',
            'line-width': 5.5,
            'line-opacity': 1,
          },
        });
        layersCreated = true;
      }
      if (!mapInstance.getLayer('osrm-route-endpoints')) {
        mapInstance.addLayer({
          id: 'osrm-route-endpoints',
          type: 'circle',
          source: 'osrm-route-endpoints',
          paint: {
            'circle-radius': 5,
            'circle-color': '#2BD985',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#FFFFFF',
          },
        });
        layersCreated = true;
      }
    } catch (err) {
      devWarn('Exception in ensureRouteLayers:', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return { sourceCreated, layersCreated };
  }

  function syncRouteOnMap() {
    if (!mapInstance || !styleReady) return;
    const { sourceCreated, layersCreated } = ensureRouteLayers();
    try {
      const routeSrc = mapInstance.getSource('osrm-route');
      if (routeSrc && typeof routeSrc.setData === 'function') {
        routeSrc.setData(routeGeoJson());
      }
      const epSrc = mapInstance.getSource('osrm-route-endpoints');
      if (epSrc && typeof epSrc.setData === 'function') {
        epSrc.setData(endpointsGeoJson());
      }
      const coords = cleanLineCoords();
      devLog('Route source & layers updated:', {
        mapReady: styleReady,
        sourceCreated,
        layersCreated,
        sourceExists: Boolean(routeSrc),
        layerExists: Boolean(mapInstance.getLayer('osrm-route-line')),
        coordinatesCount: coords.length,
        firstCoordLngLat: coords[0] ?? null,
        lastCoordLngLat: coords[coords.length - 1] ?? null,
      });
    } catch (err) {
      devWarn('Exception updating route source data:', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function fit(animate: boolean, customBottomPad?: number) {
    if (!mapInstance || !window.maplibregl) return;
    if (typeof customBottomPad === 'number' && Number.isFinite(customBottomPad)) {
      state.bottomPad = customBottomPad;
    }
    try {
      const b = new window.maplibregl.LngLatBounds();
      b.extend([
        selectedStage.coordinates.lng,
        selectedStage.coordinates.lat,
      ]);
      if (
        state.user &&
        Number.isFinite(state.user.lng) &&
        Number.isFinite(state.user.lat)
      ) {
        b.extend([state.user.lng, state.user.lat]);
      }
      const coords = cleanLineCoords();
      coords.forEach((pt) => b.extend(pt));
      mapInstance.fitBounds(b, {
        padding: {
          top: 96,
          bottom: state.bottomPad,
          left: 52,
          right: 68,
        },
        maxZoom: 16.5,
        duration: animate ? 480 : 0,
      });
    } catch (err) {
      devWarn('Exception fitting map bounds:', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function renderUser() {
    if (!mapInstance || !window.maplibregl) return;
    if (
      !state.user ||
      !Number.isFinite(state.user.lng) ||
      !Number.isFinite(state.user.lat)
    ) {
      if (userMarker) {
        userMarker.remove();
        userMarker = null;
      }
      return;
    }
    if (!userMarker) {
      const el = document.createElement('div');
      el.className = 'stage-origin-wrap';
      el.innerHTML =
        '<div class="stage-origin-dot"><div class="stage-origin-inner"></div></div>' +
        '<div class="stage-origin-pill"></div>';
      userMarker = new window.maplibregl.Marker({
        element: el,
        anchor: 'center',
      })
        .setLngLat([state.user.lng, state.user.lat])
        .addTo(mapInstance);
    }
    userMarker.setLngLat([state.user.lng, state.user.lat]);
    const pill = userMarker
      .getElement()
      .querySelector('.stage-origin-pill') as HTMLElement | null;
    if (pill) {
      pill.textContent = state.user.label || 'Start';
    }
  }

  function renderCallout(minutes: number | null | undefined, dist: string) {
    if (minEl) {
      minEl.innerHTML =
        (minutes === null || minutes === undefined
          ? '–'
          : escapeHtml(String(minutes))) + '<br/>MIN';
    }
    if (subEl) {
      subEl.textContent =
        (dist || '') + (dist ? ' · ' : '') + 'RT ' + routeNumber;
    }
  }

  const apply = (msg: StageMapApplyMessage) => {
    if (destroyed || !msg) return;
    if (msg.type === 'route') {
      state.line = Array.isArray(msg.line) ? msg.line : [];
      state.minutes = msg.minutes === undefined ? null : msg.minutes;
      state.dist = msg.dist || '';
      renderCallout(state.minutes, state.dist);
      syncRouteOnMap();
      if (msg.fit !== false) {
        fit(true, msg.bottomPad);
      }
    } else if (msg.type === 'user') {
      state.user = msg.user ?? null;
      renderUser();
      if (msg.fit) {
        fit(true, msg.bottomPad);
      }
    } else if (msg.type === 'fit') {
      fit(true, msg.bottomPad);
    } else if (msg.type === 'center-user') {
      if (mapInstance && state.user) {
        mapInstance.flyTo({
          center: [state.user.lng, state.user.lat],
          zoom: Math.max(mapInstance.getZoom(), 16),
        });
      }
    }
  };

  ensureMapLibreLoaded()
    .then((maplibregl) => {
      if (destroyed) return;
      try {
        container.innerHTML = '';
        const map = new maplibregl.Map({
          container,
          style: styleUrl,
          center: [
            selectedStage.coordinates.lng,
            selectedStage.coordinates.lat,
          ],
          zoom: 15.4,
          attributionControl: false,
        });
        map.addControl(
          new maplibregl.AttributionControl({ compact: true }),
          'bottom-left'
        );
        mapInstance = map;
        window.__stageMap = map;
        window.__stageApply = apply;

        const handleStyleOrLoad = (eventName: string) => {
          if (destroyed) return;
          styleReady = true;
          devLog(`Map instance ready (${eventName}):`, {
            stageId: selectedStage.id,
            stageName: selectedStage.name,
            styleUrl,
            isStyleLoaded: map.isStyleLoaded(),
          });
          syncRouteOnMap();
          if (!readySignaled) {
            readySignaled = true;
            fit(false);
            onMapReady?.();
          }
        };

        map.on('style.load', () => handleStyleOrLoad('style.load'));
        map.on('load', () => handleStyleOrLoad('load'));
        map.on('error', (evt: unknown) => {
          const e = evt as { error?: { message?: string } } | undefined;
          const msg = String(e?.error?.message || '');
          devWarn('MapLibre error event:', { message: msg });
          if (msg.indexOf('style') !== -1 && !readySignaled) {
            onMapError?.('style_load_error');
          }
        });

        renderUser();

        allStages.forEach((stg) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'stage-marker-btn';
          const isSelected = stg.id === selectedStage.id;
          if (isSelected) {
            btn.style.zIndex = '5';
            btn.innerHTML =
              '<div class="board-here-tag">BOARD HERE</div>' +
              '<div class="stage-pin-active">&#9650;</div>' +
              '<div class="stage-callout">' +
              '<div class="stage-callout-min"></div>' +
              '<div class="stage-callout-body">' +
              '<div>' +
              escapeHtml(stg.name.replace(' (Demo)', '')) +
              '</div>' +
              '<div class="stage-callout-sub"></div>' +
              '</div>' +
              '</div>';
            minEl = btn.querySelector('.stage-callout-min');
            subEl = btn.querySelector('.stage-callout-sub');
            renderCallout(state.minutes, state.dist);
          } else {
            btn.innerHTML = '<div class="stage-pin-inactive"></div>';
          }
          btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            onSelectStageById?.(stg.id);
          });
          const marker = new maplibregl.Marker({
            element: btn,
            anchor: 'center',
          })
            .setLngLat([stg.coordinates.lng, stg.coordinates.lat])
            .addTo(map);
          stageMarkers.push(marker);
        });

        fit(false);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        devWarn('Exception constructing MapLibre map:', { error: reason });
        onMapError?.(reason);
      }
    })
    .catch((err) => {
      if (destroyed) return;
      const reason = err instanceof Error ? err.message : String(err);
      devWarn('Failed to load MapLibre GL JS:', { error: reason });
      onMapError?.(reason);
    });

  return {
    apply,
    zoomIn: () => {
      try {
        mapInstance?.zoomIn();
      } catch {}
    },
    zoomOut: () => {
      try {
        mapInstance?.zoomOut();
      } catch {}
    },
    destroy: () => {
      destroyed = true;
      try {
        userMarker?.remove();
        stageMarkers.forEach((m) => m.remove());
        mapInstance?.remove();
      } catch {}
      if (window.__stageMap === mapInstance) {
        window.__stageMap = null;
      }
      if (window.__stageApply === apply) {
        window.__stageApply = null;
      }
      mapInstance = null;
    },
  };
}

