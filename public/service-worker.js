// service-worker.js - Apna Mini Mart PWA
// Strategy:
//   - App code (html/css/js): network-first, falling back to cache when offline
//     (so the app never shows a stale version when online, but still works offline)
//   - Icons/images: cache-first (rarely change, safe to cache aggressively)
//   - /api/products: network-first, falling back to cache when offline

const CACHE_VERSION = 'apna-mart-v5';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const DATA_CACHE = `${CACHE_VERSION}-data`;

const CODE_ASSETS = [
  '/',
  '/index.html',
  '/admin.html',
  '/manifest.json',
  '/css/style.css',
  '/js/app.js',
  '/js/admin.js'
];

const IMAGE_ASSETS = [
  '/icons/icon-72.png',
  '/icons/icon-96.png',
  '/icons/icon-128.png',
  '/icons/icon-144.png',
  '/icons/icon-152.png',
  '/icons/icon-192.png',
  '/icons/icon-384.png',
  '/icons/icon-512.png',
  '/images/grocery.png',
  '/images/dairy.png',
  '/images/snacks.png',
  '/images/beverages.png',
  '/images/frozen.png',
  '/images/personal_care.png',
  '/images/household.png',
  '/images/placeholder.png',
  '/images/upi-logo.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll([...CODE_ASSETS, ...IMAGE_ASSETS]))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls: network-first, cache fallback (keeps catalog fresh, works offline)
  if (url.pathname.startsWith('/api/products')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(DATA_CACHE).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Never cache admin mutation calls or order submissions
  if (url.pathname.startsWith('/api/admin') || url.pathname.startsWith('/api/orders')) {
    event.respondWith(fetch(request));
    return;
  }

  // Cross-origin requests (e.g. reverse-geocoding lookups, maps links) - just
  // pass through to the network, don't cache one-off external API calls.
  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(request).catch(() => new Response(null, { status: 503 })));
    return;
  }

  const isImage = IMAGE_ASSETS.some((path) => url.pathname === path) || url.pathname.startsWith('/images/') || url.pathname.startsWith('/icons/');

  if (isImage) {
    // Images/icons: cache-first, network fallback
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  // App code (html/css/js): network-first so updates show up immediately,
  // falling back to cache only when offline.
  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/index.html')))
  );
});
