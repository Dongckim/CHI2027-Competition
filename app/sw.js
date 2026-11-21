// Service worker: ARC keeps working without a connection (03-L). Built by app/scripts/copy-static.mjs, which fills in
// VERSION and PRECACHE with this deploy's files; a new deploy = a new worker that replaces the old cache.
//   page (navigation)      network first, cached index.html when offline
//   /assets/, /app-data/   cache first (file names change with their content)
//   /data/venue/, /model.json  cached copy at once, refreshed in the background
//   /model/                cache first in its own cache (on-device engine, only when it is used)
//   feed revisions         cache first (a revision file never changes); version.json is never cached
const VERSION = self.__VERSION__;
const PRECACHE = self.__PRECACHE__;
const CACHE = `arc-${VERSION}`;
const FEED = 'arc-feed';
const MODEL = 'arc-model-v1'; // the on-device engine's files (?v=<sha> in each URL); shortcut: old releases stay until the cache is cleared
const KEEP = new Set([CACHE, FEED, MODEL, 'arc-plan-marker']);

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('arc') && !KEEP.has(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// ignoreVary: a host may answer `Vary: Origin` (vite preview does), and module scripts are requested with an Origin
// header while the precache was not, so a plain match misses them offline. Names carry their content hash, so any
// cached copy of the path is the right one.
const MATCH = { ignoreVary: true };
const cacheFirst = async (req, name) => {
  const hit = await caches.match(req, MATCH);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(name)).put(req, res.clone());
  return res;
};
const staleWhileRevalidate = async req => {
  const hit = await caches.match(req, MATCH);
  const update = fetch(req).then(async res => { if (res.ok) (await caches.open(CACHE)).put(req, res.clone()); return res; }).catch(() => hit);
  return hit ?? update;
};

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') {
      e.respondWith(fetch(req).catch(async () => (await caches.match('/index.html', MATCH)) ?? (await caches.match('/', MATCH)) ?? Response.error()));
    } else if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/app-data/')) {
      e.respondWith(cacheFirst(req, CACHE));
    } else if (url.pathname.startsWith('/model/')) {
      e.respondWith(cacheFirst(req, MODEL));
    } else if (url.pathname.startsWith('/data/venue/') || url.pathname === '/model.json') {
      e.respondWith(staleWhileRevalidate(req));
    }
    return;
  }
  if (url.hostname === 'chidigitalexperience.org' && url.pathname.includes('/revisions/')) e.respondWith(cacheFirst(req, FEED));
});
