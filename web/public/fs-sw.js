/* eslint-disable */
// Service worker of mdSilo web version:
// 1. serve files stored in IndexedDB (src/host/web/fs.ts) under `__mdsilo_fs__/<path>`,
//    so that images and attachments can be loaded by URL, e.g. <img src>;
// 2. keep the app itself for offline use (an installed web app on a phone).
//
// The app files to keep are written into BUILD by the web build
// (vite.web.config.mts, `pwaPrecache`); BUILD stays null in dev, where nothing
// is cached. Paths are relative to the scope (the base of the app).
const BUILD = null; // __MDSILO_PRECACHE__

const PREFIX = '/__mdsilo_fs__';
const DB_NAME = 'mdsilo';
const STORE = 'files';
const CACHE_PREFIX = 'mdsilo-app-';
const CACHE = BUILD ? CACHE_PREFIX + BUILD.version : null;

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif',
  pdf: 'application/pdf', json: 'application/json', md: 'text/markdown; charset=utf-8',
  txt: 'text/plain; charset=utf-8', html: 'text/plain; charset=utf-8', csv: 'text/csv; charset=utf-8',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm',
};

// ---- the app, offline ----

const scoped = (path) => new URL(path, self.registration.scope).href;

/** hashed by the build: the same name is the same content, in any version */
const isHashed = (path) => path.startsWith('assets/');

/** keep one file of the app in the cache, from an older version if it is there */
async function keep(cache, path) {
  const url = scoped(path);
  if (await cache.match(url)) return;
  if (isHashed(path)) {
    const old = await caches.match(url);
    if (old) return cache.put(url, old);
  }
  // past the HTTP cache: a file not hashed may have changed
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  await cache.put(url, res);
}

/** the rest of the app (all the views): best effort, missing ones are cached on use */
async function keepRest() {
  if (!BUILD) return;
  const cache = await caches.open(CACHE);
  for (const path of BUILD.rest) {
    try {
      await keep(cache, path);
    } catch (e) {
      // offline or gone: try next time
    }
  }
}

self.addEventListener('install', (event) => {
  // the first one: serve the files at once
  const first = !self.registration.active;
  if (!BUILD) {
    self.skipWaiting();
    return;
  }
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // the shell must be there, or the install fails and is tried again later
    await Promise.all(BUILD.core.map((path) => keep(cache, path)));
    if (first) {
      self.skipWaiting();
    } else {
      // an update waits until the app reloads into it (src/host/web/pwa.ts):
      // the page open now still loads the files of its own version
      await keepRest();
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE)
        .map((name) => caches.delete(name)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (type === 'skip-waiting') self.skipWaiting();
  // sent by the app once it runs: fill the cache with the rest
  if (type === 'precache') event.waitUntil(keepRest());
});

async function fromCache(request) {
  const cache = await caches.open(CACHE);
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (request.mode === 'navigate') {
    // a single page: any page of the app is index.html (e.g. `?book=` windows)
    const shell = await cache.match(scoped('index.html'));
    if (shell) return shell;
    return fetch(request);
  }
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(request);
  // what the build did not list, e.g. the cmaps of pdf.js: kept once used
  const path = url.pathname.slice(scope.pathname.length);
  if (res.ok && /^(assets|vendor|icons)\//.test(path)) {
    await cache.put(request, res.clone());
  }
  return res;
}

// ---- the files in IndexedDB ----

function getEntry(path) {
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME);
    // never create the db here, let the app create it with the right schema
    req.onupgradeneeded = () => req.transaction.abort();
    req.onerror = () => resolve(undefined);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.close();
        resolve(undefined);
        return;
      }
      const get = db.transaction(STORE, 'readonly').objectStore(STORE).get(path);
      get.onsuccess = () => { db.close(); resolve(get.result); };
      get.onerror = () => { db.close(); resolve(undefined); };
    };
  });
}

function normalize(path) {
  const parts = [];
  for (const seg of path.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop(); else parts.push(seg);
  }
  return '/' + parts.join('/');
}

async function serve(pathname) {
  let path;
  try {
    path = normalize(decodeURIComponent(pathname));
  } catch (e) {
    path = normalize(pathname);
  }
  const entry = await getEntry(path);
  if (!entry || entry.is_dir) {
    return new Response('Not Found', { status: 404 });
  }
  const ext = path.includes('.') ? path.slice(path.lastIndexOf('.') + 1).toLowerCase() : '';
  const data = entry.data === undefined ? '' : entry.data;
  const type = (typeof data !== 'string' && data.type) || MIME[ext] || 'application/octet-stream';
  return new Response(data, {
    status: 200,
    headers: { 'Content-Type': type, 'Cache-Control': 'no-cache' },
  });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const idx = url.pathname.indexOf(PREFIX + '/');
  if (idx >= 0) {
    event.respondWith(serve(url.pathname.slice(idx + PREFIX.length)));
    return;
  }
  if (!BUILD || event.request.method !== 'GET') return;
  // in the scope only, and never the CORS proxy (feeds are always fetched)
  if (!url.href.startsWith(self.registration.scope)) return;
  if (url.pathname.includes('/__cors_proxy__')) return;
  event.respondWith(fromCache(event.request));
});
