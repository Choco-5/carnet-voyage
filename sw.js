// Service worker : fait fonctionner l'application sans connexion.
//  - fichiers de l'application : réseau d'abord (toujours à jour), cache en secours
//  - bibliothèques (CDN, versions figées) : cache d'abord
//  - carte : tuiles, polices, icônes en cache d'abord ; style en réseau d'abord
const VERSION = 'v1';
const SHELL = 'shell-' + VERSION;
const MAP = 'map-v1';

const SHELL_FILES = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png',
  './js/app.js', './js/lib.js', './js/store.js', './js/util.js', './js/ui.js', './js/geo.js', './js/dnd.js',
  './js/workspace.js', './js/place-panel.js', './js/map-panel.js', './js/orga-panel.js',
  './js/place-form.js', './js/offline.js',
];
const CDN_FILES = [
  'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js',
  'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js',
  'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css',
  'https://cdn.jsdelivr.net/npm/sortablejs@1.15.3/Sortable.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await c.addAll(SHELL_FILES);
    await Promise.all(CDN_FILES.map(async (u) => {
      try {
        const r = await fetch(u, { mode: 'cors' });
        if (r.ok) await c.put(u, r);
      } catch {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone()).catch(() => {});
  return res;
}

function networkFirst(req, cacheName, timeoutMs) {
  return new Promise(async (resolve) => {
    const cache = await caches.open(cacheName);
    let done = false;
    const finish = (r) => {
      if (!done) {
        done = true;
        resolve(r);
      }
    };
    const timer = setTimeout(async () => {
      const hit = await cache.match(req, { ignoreVary: true });
      if (hit) finish(hit);
    }, timeoutMs);
    try {
      const res = await fetch(req);
      clearTimeout(timer);
      if (res.ok) cache.put(req, res.clone()).catch(() => {});
      finish(res);
    } catch {
      clearTimeout(timer);
      let hit = await cache.match(req, { ignoreVary: true });
      if (!hit && req.mode === 'navigate') hit = await cache.match('./index.html');
      finish(hit || Response.error());
    }
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'tiles.openfreemap.org') {
    const isAsset = /\.(pbf|png|jpg|jpeg|webp|json)$/.test(url.pathname);
    e.respondWith(isAsset ? cacheFirst(req, MAP) : networkFirst(req, MAP, 4000));
  } else if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(cacheFirst(req, SHELL));
  } else if (url.origin === self.location.origin) {
    e.respondWith(networkFirst(req, SHELL, 3000));
  }
});
