/* STAGE Nairobi — Safe App Shell Service Worker
 * Caches only same-origin static app shell assets (HTML, CSS, JS, manifest, icons).
 * Explicitly NEVER caches live GPS, OSRM routing responses, Nominatim geocoding,
 * or OpenFreeMap vector map tiles.
 */

const CACHE_NAME = 'stage-nairobi-shell-v1';
const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/favicon-32x32.png',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
];

const NEVER_CACHE_HOSTS = [
  'routing.openstreetmap.de',
  'router.project-osrm.org',
  'nominatim.openstreetmap.org',
  'tiles.openfreemap.org',
  'unpkg.com',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting())
      .catch(() => undefined)
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Never intercept or cache external routing, geocoding, or map tile services
  if (
    url.origin !== self.location.origin ||
    NEVER_CACHE_HOSTS.some((host) => url.hostname.includes(host))
  ) {
    return;
  }

  // Network-first for HTML navigation, falling back to cached shell when offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(() =>
          caches.match('/index.html').then((cached) => cached || caches.match('/'))
        )
    );
    return;
  }

  // Stale-while-revalidate for same-origin static assets (JS, CSS, icons, manifest)
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});

