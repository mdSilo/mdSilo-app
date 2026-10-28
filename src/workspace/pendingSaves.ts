import { writeFile } from './write';

/**
 * Note saves deferred while typing, by file path: a note is written once the
 * typing pauses, instead of on every key, and at least every MAX_WAIT_MS
 * while it goes on. The writes of a path are done in order.
 *
 * Flush (or cancel) the pending save of a path before acting on its file
 * otherwise: renaming, moving, deleting it.
 */

export const SAVE_DELAY_MS = 500;
export const MAX_WAIT_MS = 2000;

type Pending = {
  content: string;
  timer: ReturnType<typeof setTimeout>;
  // when the first unsaved change was made
  since: number;
};

const pending = new Map<string, Pending>();
// the write in progress of each path, the next one waits for it
const writing = new Map<string, Promise<void>>();

function write(path: string, content: string): Promise<void> {
  const previous = writing.get(path) ?? Promise.resolve();
  const next = previous
    .then(() => writeFile(path, content))
    .catch((e) => console.error(`Failed to save ${path}`, e))
    .finally(() => {
      if (writing.get(path) === next) writing.delete(path);
    });
  writing.set(path, next);
  return next;
}

/** Save `content` to `path` once the changes pause. */
export function scheduleSave(path: string, content: string) {
  const current = pending.get(path);
  const since = current?.since ?? Date.now();
  if (current) clearTimeout(current.timer);
  const delay = Math.max(0, Math.min(SAVE_DELAY_MS, since + MAX_WAIT_MS - Date.now()));
  const timer = setTimeout(() => void flushSave(path), delay);
  pending.set(path, { content, timer, since });
}

/** Write the pending save of `path` now, or of all the paths. */
export async function flushSave(path?: string): Promise<void> {
  const paths = path === undefined ? [...pending.keys()] : [path];
  await Promise.all(
    paths.map((p) => {
      const save = pending.get(p);
      if (save) {
        clearTimeout(save.timer);
        pending.delete(p);
        return write(p, save.content);
      }
      // the write already started, if any
      return writing.get(p) ?? Promise.resolve();
    })
  );
}

/** Drop the pending save of `path`, e.g. the file is about to be deleted. */
export function cancelSave(path: string) {
  const save = pending.get(path);
  if (save) {
    clearTimeout(save.timer);
    pending.delete(path);
  }
}

/** A save of `path` is waiting. */
export function hasPendingSave(path: string): boolean {
  return pending.has(path);
}

// the window may be closed or the app left: do not keep the changes waiting
if (typeof window !== 'undefined') {
  const flushAll = () => void flushSave();
  window.addEventListener('blur', flushAll);
  window.addEventListener('pagehide', flushAll);
  window.addEventListener('beforeunload', flushAll);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAll();
  });
}
