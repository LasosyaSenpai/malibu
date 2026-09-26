// Service worker: приложение открывается и без интернета.
// Сначала пробуем сеть (чтобы сразу получать обновления), при плохой связи — берём из кэша.
// При изменении файлов приложения поднимать версию CACHE.

const CACHE = 'malibu-v0.6.0';
const NETWORK_TIMEOUT_MS = 3000;
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/backup.js',
  './js/config.js',
  './js/costs.js',
  './js/db.js',
  './js/expenses.js',
  './js/icons.js',
  './js/logic.js',
  './js/maintenance.js',
  './js/parking.js',
  './js/pdf.js',
  './js/photos.js',
  './js/servicebook.js',
  './vendor/jspdf.umd.min.js',
  './vendor/jspdf.plugin.autotable.min.js',
  './vendor/Montserrat-Regular.ttf',
  './vendor/Montserrat-SemiBold.ttf',
  './js/service.js',
  './js/sync.js',
  './js/ui.js',
  './img/car-header.jpg',
  './img/live/happy.webp',
  './img/live/closed.webp',
  './img/live/oh.webp',
  './img/live/surprised.webp',
  './img/live/mischief.webp',
  './img/live/wink-tongue.webp',
  './img/live/proud.webp',
  './img/live/wave.webp',
  './img/live/lick.webp',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isFont = url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com');
  if (url.origin !== self.location.origin && !isFont) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      // no-cache: не брать файлы из 10-минутного кэша браузера (GitHub Pages), а сверяться с сервером —
      // иначе обновление приложения приходит с опозданием.
      const fresh = url.origin === self.location.origin ? new Request(req, { cache: 'no-cache' }) : req;
      const res = await withTimeout(fetch(fresh), NETWORK_TIMEOUT_MS);
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    } catch {
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      if (req.mode === 'navigate') return cache.match('./index.html');
      throw new Error('offline');
    }
  })());
});
