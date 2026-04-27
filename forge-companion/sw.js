// sw.js — Forge Companion minimal service worker.
//
// Caches the companion shell on install so users get an offline "can't connect"
// experience instead of a browser error page when Forge isn't reachable.
// API calls to /api/mobile/* are always fetched from the network — never cached.
const CACHE_NAME = 'forge-companion-v3';

// Files that make up the companion app shell.
const APP_SHELL_FILES = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL_FILES))
  );
  // Take control immediately — don't wait for the old SW to expire.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Remove any caches from previous versions.
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // API calls go straight to the network — never serve stale terminal data.
  if (event.request.url.includes('/api/')) {
    return; // browser default: network fetch
  }

  // For everything else, use a cache-first strategy so the app shell loads
  // offline and on slow connections.
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      return cachedResponse || fetch(event.request);
    })
  );
});
