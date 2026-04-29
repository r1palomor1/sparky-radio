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
  const url = new URL(e.request.url);
  
  // Only intercept same-origin requests for potential caching
  // This avoids CORS issues and network errors with external APIs like Radio Browser
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then((res) => res || fetch(e.request))
    );
  }
});

