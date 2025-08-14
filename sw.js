
const CACHE = 'gpxnav-v1';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.webmanifest',
  './routes/routes.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(()=> self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Cache-first for app shell; network-first for routes.json and GPX
  if (ASSETS.includes(url.pathname.replace(location.pathname, './'))) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
    return;
  }
  if (url.pathname.endsWith('routes.json') || url.pathname.endsWith('.gpx')) {
    e.respondWith(fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(()=> caches.match(e.request)));
    return;
  }
  // Tile caching (opaque)
  if (/tile|osm|googleapis|gstatic|openstreetmap/.test(url.hostname)) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open('tiles').then(c => c.put(e.request, copy)).catch(()=>{});
      return res;
    }).catch(()=> r)));
    return;
  }
  e.respondWith(fetch(e.request).catch(()=> caches.match(e.request)));
});
