const CACHE_NAME = 'sparky-radio';
const ASSETS = [
  '/',
  '/index.html',
  '/src/scripts/main.js',
  '/src/styles/main.css',
  '/material-symbols.css',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Allow network for API calls, cache for static assets
  if (e.request.url.includes('/api/')) {
    e.respondWith(fetch(e.request));
  } else {
    e.respondWith(
      caches.match(e.request).then((res) => res || fetch(e.request))
    );
  }
});
