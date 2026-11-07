/**
 * Minimal promise wrapper of IndexedDB used by the web version.
 * NOTE: web/public/fs-sw.js reads the `files` store as well, keep in sync.
 */

export const DB_NAME = "mdsilo";
export const DB_VERSION = 1;

export const FILES = "files"; // virtual file system, keyPath: path
export const KV = "kv"; // key-value storage, like set_data/get_data
export const CHANNELS = "channels"; // feed channels, keyPath: link
export const ARTICLES = "articles"; // feed articles, keyPath: url

export type StoreName =
  typeof FILES | typeof KV | typeof CHANNELS | typeof ARTICLES;

let dbPromise: Promise<IDBDatabase> | null = null;

/** Open again if the browser does not answer for that long, see openDB. */
export const OPEN_RETRY_MS = 3000;

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not supported in this browser"));
      return;
    }
    let settled = false;
    const request = () => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => upgrade(req.result);
      req.onsuccess = () => {
        const db = req.result;
        // the answer of the other request came first
        if (settled) {
          db.close();
          return;
        }
        settled = true;
        clearTimeout(retry);
        // another tab upgraded the db
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        // the browser closed the connection (e.g. a phone resumes the app
        // after a long sleep): the next use opens it again, not fails for good
        db.onclose = () => {
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(retry);
        dbPromise = null;
        reject(req.error);
      };
      // another connection (an old tab) keeps the db from opening: say so
      req.onblocked = () => console.warn("IndexedDB is blocked by another tab");
    };
    // a browser may leave the first open of a launch unanswered (WebKit):
    // asking again gets it going
    const retry = setTimeout(() => {
      if (settled) return;
      console.warn("IndexedDB does not answer, opening it again");
      request();
    }, OPEN_RETRY_MS);
    request();
  });
  return dbPromise;
}

function upgrade(db: IDBDatabase) {
  if (!db.objectStoreNames.contains(FILES)) {
    const files = db.createObjectStore(FILES, { keyPath: "path" });
    files.createIndex("parent", "parent", { unique: false });
  }
  if (!db.objectStoreNames.contains(KV)) {
    db.createObjectStore(KV);
  }
  if (!db.objectStoreNames.contains(CHANNELS)) {
    db.createObjectStore(CHANNELS, { keyPath: "link" });
  }
  if (!db.objectStoreNames.contains(ARTICLES)) {
    const articles = db.createObjectStore(ARTICLES, { keyPath: "url" });
    articles.createIndex("feed_link", "feed_link", { unique: false });
  }
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

/** A transaction; a connection the browser closed is opened again, once. */
async function transactionOf(
  stores: StoreName | StoreName[],
  mode: IDBTransactionMode,
): Promise<IDBTransaction> {
  try {
    return (await openDB()).transaction(stores, mode);
  } catch (e) {
    if (!(e instanceof DOMException) || e.name !== "InvalidStateError") throw e;
    dbPromise = null;
    return (await openDB()).transaction(stores, mode);
  }
}

/**
 * Run `fn` in a transaction, resolve with its result once the tx completes.
 */
export async function tx<T>(
  stores: StoreName | StoreName[],
  mode: IDBTransactionMode,
  fn: (t: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const t = await transactionOf(stores, mode);
  const done = new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error("Transaction aborted"));
  });
  const result = await fn(t);
  await done;
  return result;
}

export async function get<T>(
  store: StoreName,
  key: IDBValidKey,
): Promise<T | undefined> {
  return tx(store, "readonly", (t) =>
    reqToPromise<T | undefined>(t.objectStore(store).get(key)),
  );
}

export async function getAll<T>(
  store: StoreName,
  query?: IDBKeyRange | IDBValidKey,
  index?: string,
): Promise<T[]> {
  return tx(store, "readonly", (t) => {
    const s = t.objectStore(store);
    const src = index ? s.index(index) : s;
    return reqToPromise<T[]>(src.getAll(query));
  });
}

export async function put<T>(
  store: StoreName,
  value: T,
  key?: IDBValidKey,
): Promise<void> {
  await tx(store, "readwrite", (t) =>
    reqToPromise(t.objectStore(store).put(value, key)),
  );
}

export async function del(
  store: StoreName,
  key: IDBValidKey | IDBKeyRange,
): Promise<void> {
  await tx(store, "readwrite", (t) =>
    reqToPromise(t.objectStore(store).delete(key)),
  );
}
