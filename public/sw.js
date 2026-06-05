const CACHE_NAME = 'dhanrakshak-cache-v2';
const ASSETS = [
  '/manifest.json',
  '/favicon.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Only intercept GET requests
  if (e.request.method !== 'GET') return;
  
  // Only intercept http/https requests
  if (!e.request.url.startsWith('http')) return;

  // Simple network-first fetching with cache fallback
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        return response;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(e.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        // Always return a valid Response to prevent Service Worker TypeError crash
        return new Response('Network connection failed and asset not cached.', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain' }
        });
      })
  );
});
