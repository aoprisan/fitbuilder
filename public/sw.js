/* Gym Log service worker — hand-rolled, no Workbox.

   Its job is twofold: make the app installable (a registered fetch-handling
   worker is part of the browser's PWA install criteria), and keep it usable
   offline once it has been opened online. Strategies:

     - App shell (HTML, JS, CSS, images served from our own origin):
       stale-while-revalidate. Serve cache-first for speed and refresh in the
       background. Navigation requests fall back to the cached index when no
       network is available.

     The typefaces are bundled (src/fonts.ts), so they're same-origin app-shell
     assets too — nothing is fetched from a third party.

   Cache versioning: bump CACHE_VERSION when the SW or strategies change.
   Old caches are evicted on `activate`. */

const CACHE_VERSION = 'v2';
const APP_CACHE = `gymlog-app-${CACHE_VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_CACHE);
      try {
        await cache.add('./');
      } catch {
        /* offline at install time — fetch handler will fill the cache later */
      }
      self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== APP_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(request);
  const networkFetch = fetch(request)
    .then((response) => {
      if (response && response.ok && request.method === 'GET') {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => null);
  return cached || (await networkFetch) || Response.error();
}

async function navigationFallback(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(APP_CACHE);
      cache.put('./', response.clone()).catch(() => {});
    }
    return response;
  } catch {
    const cache = await caches.open(APP_CACHE);
    const cached = await cache.match('./');
    return cached || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith(navigationFallback(request));
    return;
  }

  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
