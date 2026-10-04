/**
 * In-page event bus, stands in for Tauri window events on web.
 * The virtual file system reports its changes as `changes` events for watched
 * dirs, like the notify watcher does in src-tauri/src/files.rs listen_dir.
 */
import { isWithin, normalize } from './path';

export interface BusEvent<T = unknown> {
  event: string;
  id: number;
  payload: T;
}

type Handler = (event: BusEvent) => void;

const handlers = new Map<string, Set<Handler>>();
let eventId = 0;

export function on(event: string, handler: Handler): () => void {
  let set = handlers.get(event);
  if (!set) {
    set = new Set();
    handlers.set(event, set);
  }
  set.add(handler);
  return () => {
    handlers.get(event)?.delete(handler);
  };
}

export function emit(event: string, payload?: unknown): void {
  const set = handlers.get(event);
  if (!set) return;
  const ev: BusEvent = { event, id: ++eventId, payload };
  for (const handler of Array.from(set)) {
    try {
      handler(ev);
    } catch (e) {
      console.error(`Error on handling event ${event}:`, e);
    }
  }
}

const watchedDirs = new Set<string>();

export function watchDir(dir: string): void {
  watchedDirs.add(normalize(dir));
}

export function unwatchAll(): void {
  watchedDirs.clear();
}

// frontend: src/file/directory.ts DirectoryAPI.unlisten
on('unlisten_dir', unwatchAll);

/** emit `changes` event asynchronously, as a file watcher does */
export function emitFsChange(kind: string, paths: string[]): void {
  const dirs = Array.from(watchedDirs);
  const watched = paths.filter((p) => dirs.some((d) => isWithin(p, d)));
  if (watched.length === 0) return;
  setTimeout(() => emit('changes', { paths: watched, event: kind }), 0);
}

/** emit `changes` event to frontend regardless of watching */
export function emitChanges(kind: string, paths: string[]): void {
  setTimeout(() => emit('changes', { paths, event: kind }), 0);
}
