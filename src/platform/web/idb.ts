/**
 * Minimal promise wrapper of IndexedDB used by the web version.
 * NOTE: web/public/fs-sw.js reads the `files` store as well, keep in sync.
 */

export const DB_NAME = 'mdsilo';
export const DB_VERSION = 1;

export const FILES = 'files'; // virtual file system, keyPath: path
export const KV = 'kv'; // key-value storage, like set_data/get_data
export const CHANNELS = 'channels'; // feed channels, keyPath: link
export const ARTICLES = 'articles'; // feed articles, keyPath: url

export type StoreName = typeof FILES | typeof KV | typeof CHANNELS | typeof ARTICLES;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this browser'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(FILES)) {
        const files = db.createObjectStore(FILES, { keyPath: 'path' });
        files.createIndex('parent', 'parent', { unique: false });
      }
      if (!db.objectStoreNames.contains(KV)) {
        db.createObjectStore(KV);
      }
      if (!db.objectStoreNames.contains(CHANNELS)) {
        db.createObjectStore(CHANNELS, { keyPath: 'link' });
      }
      if (!db.objectStoreNames.contains(ARTICLES)) {
        const articles = db.createObjectStore(ARTICLES, { keyPath: 'url' });
        articles.createIndex('feed_link', 'feed_link', { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // another tab upgraded the db
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

/** close and forget the connection, for test */
export async function closeDB(): Promise<void> {
  if (!dbPromise) return;
  const db = await dbPromise.catch(() => null);
  db?.close();
  dbPromise = null;
}

export function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Run `fn` in a transaction, resolve with its result once the tx completes.
 */
export async function tx<T>(
  stores: StoreName | StoreName[],
  mode: IDBTransactionMode,
  fn: (t: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const db = await openDB();
  const t = db.transaction(stores, mode);
  const done = new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error('Transaction aborted'));
  });
  const result = await fn(t);
  await done;
  return result;
}

export async function get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return tx(store, 'readonly', (t) => reqToPromise<T | undefined>(t.objectStore(store).get(key)));
}

export async function getAll<T>(
  store: StoreName,
  query?: IDBKeyRange | IDBValidKey,
  index?: string,
): Promise<T[]> {
  return tx(store, 'readonly', (t) => {
    const s = t.objectStore(store);
    const src = index ? s.index(index) : s;
    return reqToPromise<T[]>(src.getAll(query));
  });
}

export async function put<T>(store: StoreName, value: T, key?: IDBValidKey): Promise<void> {
  await tx(store, 'readwrite', (t) => reqToPromise(t.objectStore(store).put(value, key)));
}

export async function del(store: StoreName, key: IDBValidKey | IDBKeyRange): Promise<void> {
  await tx(store, 'readwrite', (t) => reqToPromise(t.objectStore(store).delete(key)));
}
