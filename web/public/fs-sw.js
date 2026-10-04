/* eslint-disable */
// Service worker of mdSilo web version:
// serve files stored in IndexedDB (src/platform/web/fs.ts) under `__mdsilo_fs__/<path>`,
// so that images and attachments can be loaded by URL, e.g. <img src>.
const PREFIX = '/__mdsilo_fs__';
const DB_NAME = 'mdsilo';
const STORE = 'files';

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif',
  pdf: 'application/pdf', json: 'application/json', md: 'text/markdown; charset=utf-8',
  txt: 'text/plain; charset=utf-8', html: 'text/plain; charset=utf-8', csv: 'text/csv; charset=utf-8',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm',
};

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

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
  if (idx < 0) return;
  event.respondWith(serve(url.pathname.slice(idx + PREFIX.length)));
});
