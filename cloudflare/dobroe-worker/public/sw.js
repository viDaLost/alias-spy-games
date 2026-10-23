// Работа без интернета. Всё приложение — десяток файлов, поэтому оно целиком
// кладётся в кеш при установке. Дальше файл отдаётся из кеша сразу, а свежая
// версия тихо подтягивается в фоне и покажется при следующем открытии.
const CACHE = 'dobroe-v1';
const FILES = [
  './',
  'index.html',
  'styles.css',
  'data.js',
  'app.js',
  'manifest.webmanifest',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'fonts/golos-text-400-700-cyrillic.woff2',
  'fonts/golos-text-400-700-latin.woff2',
  'fonts/pt-serif-400-cyrillic.woff2',
  'fonts/pt-serif-400-latin.woff2',
  'fonts/pt-serif-700-cyrillic.woff2',
  'fonts/pt-serif-700-latin.woff2',
  'fonts/pt-serif-400-italic-cyrillic.woff2',
  'fonts/pt-serif-400-italic-latin.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Telegram дописывает к адресу свои параметры; страница от этого не меняется.
  const key = request.mode === 'navigate' ? './' : request;
  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(key, { ignoreSearch: request.mode === 'navigate' });
    const fresh = fetch(request).then((response) => {
      if (response.ok) cache.put(key, response.clone());
      return response;
    }).catch(() => cached);
    if (cached) { event.waitUntil(fresh); return cached; }
    return fresh;
  }));
});
