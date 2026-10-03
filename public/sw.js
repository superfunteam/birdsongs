// Birdsongs service worker: makes the app installable and lets it play
// offline (all the music and weather are synthesised in the page).
//   pages        network first, cached copy when offline
//   /assets/*    cache first (file names are content-hashed, never change)
//   fonts        cache first once fetched
//   everything else same-origin: stale-while-revalidate
//   /api/*       never cached (live listener count)
const CACHE = 'birdsongs-v2';
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/favicon.ico', '/icons/icon-192.png', '/songs/worried-shoes.mid'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.all(SHELL.map((url) => c.add(url).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// font files are fetched with CORS by the page; the Google Fonts stylesheet isn't
const modeFor = (url) => (url.startsWith(self.location.origin) ? 'same-origin' : url.includes('fonts.gstatic.com') ? 'cors' : 'no-cors');

// the page sends the scripts/styles/fonts it already loaded, so the very
// first visit is enough to work offline afterwards
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'precache' || !Array.isArray(event.data.urls)) return;
  event.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(
        event.data.urls.map((url) =>
          c.match(url).then((hit) => hit || fetch(url, { mode: modeFor(url) }).then((res) => c.put(url, res)).catch(() => {})),
        ),
      ),
    ),
  );
});

const cacheFirst = async (req) => {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') c.put(req, res.clone());
  return res;
};

// pages are cached by path (so /receiver.html never replaces the main page)
const pageKey = (req) => new URL(req.url).pathname;
const networkFirst = async (req) => {
  const c = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) c.put(pageKey(req), res.clone());
    return res;
  } catch {
    return (await c.match(pageKey(req))) || (await c.match('/')) || Response.error();
  }
};

const staleWhileRevalidate = async (req) => {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  const fresh = fetch(req)
    .then((res) => {
      if (res.ok) c.put(req, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || fresh;
};

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') return event.respondWith(networkFirst(req));
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/assets/')) return event.respondWith(cacheFirst(req));
    if (url.pathname === '/sw.js') return;
    return event.respondWith(staleWhileRevalidate(req));
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') return event.respondWith(cacheFirst(req));
});
