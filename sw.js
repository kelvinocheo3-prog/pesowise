const CACHE_NAME = 'budgetwise-shell-v44';
const APP_ASSETS = [
  './', './index.html', './offline.html', './manifest.webmanifest',
  './assets/lucide-sprite.svg', './apple-touch-icon.png',
  './icons/icon-192.png', './icons/icon-512.png',
  './assets/fonts/inter-latin-variable.woff2',
  './js/database.js', './js/finance.js'
];

self.addEventListener('install', event => {
  // allSettled: one missing file must not stop the whole app from installing.
  event.waitUntil(caches.open(CACHE_NAME).then(cache =>
    Promise.allSettled(APP_ASSETS.map(asset => cache.add(asset)))));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

// Pages and scripts: network first (updates arrive without bumping the cache name), cache when offline.
async function networkFirst(request) {
  const key = request.mode === 'navigate' ? './index.html' : request;
  try {
    const response = await fetch(request);
    if (response.ok) { const cache = await caches.open(CACHE_NAME); cache.put(key, response.clone()); }
    return response;
  } catch (error) {
    const hit = await caches.match(key, { ignoreSearch: true });
    if (hit) return hit;
    if (request.mode === 'navigate') return (await caches.match('./offline.html')) || Response.error();
    throw error;
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate' || request.destination === 'script') {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(caches.match(request, { ignoreSearch: true }).then(hit => hit || fetch(request)));
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
