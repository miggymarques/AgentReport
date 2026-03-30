// Service Worker for Agent Service Report PWA
// v2.10.6 — matches app version

const CACHE_NAME = 'service-report-v2.10.7';
const RUNTIME_CACHE = 'service-report-runtime-v1';

// App shell — listed here so it gets cleaned from old caches on update
const PRECACHE_URLS = [];

// CDN resources — cache on first fetch (stale-while-revalidate)
const CDN_ORIGINS = [
  'cdn.tailwindcss.com',
  'unpkg.com',
  'cdnjs.cloudflare.com'
];

// ── Install: cache the app shell ──────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ────────────────────────────────────────────
self.addEventListener('activate', event => {
  const validCaches = [CACHE_NAME, RUNTIME_CACHE];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => !validCaches.includes(key))
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: serve from cache with smart fallback ───────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET and chrome-extension requests
  if (event.request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // PeerJS signaling server — always network, never cache
  if (url.hostname.includes('peerjs.com') || url.hostname.includes('0.peerjs.com')) return;

  // CDN scripts — stale-while-revalidate
  if (CDN_ORIGINS.some(origin => url.hostname.includes(origin))) {
    event.respondWith(staleWhileRevalidate(event.request, RUNTIME_CACHE));
    return;
  }

  // App shell (same origin) — network-first so updates reach users immediately
  // Falls back to cache when offline
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(event.request, CACHE_NAME));
    return;
  }

  // Everything else — network with cache fallback
  event.respondWith(networkWithCacheFallback(event.request));
});

// ── Cache strategies ──────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline — app shell not cached yet.', { status: 503 });
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline — serve from cache
    const cached = await caches.match(request);
    return cached || new Response('Offline — open the app while connected to cache the latest version.', { status: 503 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  // Return cached immediately if available, else wait for network
  return cached || fetchPromise || new Response('Resource unavailable offline.', { status: 503 });
}

async function networkWithCacheFallback(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline.', { status: 503 });
  }
}

// ── Background sync: flush queued P2P messages when online ───────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'p2p-flush') {
    // The app's own P2P flush logic runs client-side on reconnect;
    // this is a hook in case you wire up Background Sync API later.
    event.waitUntil(Promise.resolve());
  }
});
