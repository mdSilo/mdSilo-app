/**
 * Virtual file system on IndexedDB for the web version.
 * Every file or directory is a record in the `files` store keyed by its path.
 */
import { FILES, getAll, get, reqToPromise, tx } from './idb';
import { ROOT, basename, isHidden, isTextFile, isWithin, normalize, parent } from './path';
import { emitFsChange } from './watch';

export type FileData = string | Blob;

export interface FsEntry {
  path: string;
  parent: string;
  name: string;
  is_dir: boolean;
  data?: FileData;
  size: number;
  created: number; // ms since epoch
  modified: number;
  accessed: number;
}

export const DEFAULT_DIR = '/mdSilo';

const WELCOME = `# Welcome to mdSilo

This is the **web version** of mdSilo. Your notes are stored in this browser (IndexedDB).

- Create a note with \`Ctrl/Cmd + N\`
- Open another folder, or import a folder from your device, via the **Open Folder** dialog
- Export notes via the note menu, files will be downloaded by your browser

Clearing site data in your browser will delete the notes, please back up regularly.
`;

function sizeOf(data?: FileData): number {
  if (data === undefined) return 0;
  return typeof data === 'string' ? new Blob([data]).size : data.size;
}

function newEntry(path: string, isDir: boolean, data?: FileData, now = Date.now()): FsEntry {
  return {
    path,
    parent: parent(path),
    name: basename(path),
    is_dir: isDir,
    data: isDir ? undefined : data ?? '',
    size: isDir ? 0 : sizeOf(data),
    created: now,
    modified: now,
    accessed: now,
  };
}

/** key range of all descendants of dir */
function descendantsRange(dir: string): IDBKeyRange {
  const prefix = dir === ROOT ? '/' : `${dir}/`;
  return IDBKeyRange.bound(prefix, `${prefix}￿`, false, false);
}

let initialized: Promise<void> | null = null;

/** make sure the root dir and the default workspace exist */
export function initFs(): Promise<void> {
  if (!initialized) {
    initialized = (async () => {
      const root = await get<FsEntry>(FILES, ROOT);
      if (root) return;
      await tx(FILES, 'readwrite', (t) => {
        const s = t.objectStore(FILES);
        s.put(newEntry(ROOT, true));
        s.put(newEntry(DEFAULT_DIR, true));
        s.put(newEntry(`${DEFAULT_DIR}/Welcome.md`, false, WELCOME));
      });
    })().catch((e) => {
      initialized = null;
      throw e;
    });
  }
  return initialized;
}

/** for test */
export function resetFsInit() {
  initialized = null;
}

export async function stat(path: string): Promise<FsEntry | undefined> {
  await initFs();
  return get<FsEntry>(FILES, normalize(path));
}

export async function exists(path: string): Promise<boolean> {
  return Boolean(await stat(path));
}

export async function isDir(path: string): Promise<boolean> {
  return Boolean((await stat(path))?.is_dir);
}

export async function isFile(path: string): Promise<boolean> {
  const entry = await stat(path);
  return Boolean(entry && !entry.is_dir);
}

/** direct children of dir */
export async function readDir(dir: string): Promise<FsEntry[]> {
  await initFs();
  const entries = await getAll<FsEntry>(FILES, normalize(dir), 'parent');
  return entries.filter((e) => e.path !== ROOT);
}

/** all descendants of dir, recursively */
export async function walk(dir: string, skipHidden = false): Promise<FsEntry[]> {
  await initFs();
  const d = normalize(dir);
  const all = await getAll<FsEntry>(FILES, descendantsRange(d));
  if (!skipHidden) return all;
  // skip hidden entries and everything inside a hidden dir
  const base = d === ROOT ? 0 : d.length;
  return all.filter((e) => !e.path.slice(base).split('/').some((seg) => seg.startsWith('.')));
}

export async function readText(path: string): Promise<string> {
  const entry = await stat(path);
  if (!entry || entry.is_dir) throw new Error(`No such file: ${path}`);
  const data = entry.data ?? '';
  return typeof data === 'string' ? data : await data.text();
}

export async function readBlob(path: string): Promise<Blob> {
  const entry = await stat(path);
  if (!entry || entry.is_dir) throw new Error(`No such file: ${path}`);
  const data = entry.data ?? '';
  return typeof data === 'string' ? new Blob([data]) : data;
}

/**
 * create dir and all missing ancestors
 * @returns false if any of the ancestors is a file
 */
export async function mkdirp(dir: string): Promise<boolean> {
  await initFs();
  const d = normalize(dir);
  const created: string[] = [];
  const ok = await tx(FILES, 'readwrite', async (t) => {
    const s = t.objectStore(FILES);
    const chain: string[] = [];
    for (let p = d; p !== ROOT; p = parent(p)) chain.unshift(p);
    for (const p of chain) {
      const entry = await reqToPromise<FsEntry | undefined>(s.get(p));
      if (entry) {
        if (!entry.is_dir) return false;
        continue;
      }
      await reqToPromise(s.put(newEntry(p, true)));
      created.push(p);
    }
    return true;
  });
  if (created.length) emitFsChange('create', created);
  return ok;
}

/** write file, create parent dirs if needed */
export async function writeFile(path: string, data: FileData): Promise<boolean> {
  const p = normalize(path);
  if (p === ROOT) return false;
  if (!(await mkdirp(parent(p)))) return false;
  // keep text files as string, so they are searchable and cheap to read
  const content = typeof data !== 'string' && isTextFile(p) ? await data.text() : data;
  let isNew = false;
  const ok = await tx(FILES, 'readwrite', async (t) => {
    const s = t.objectStore(FILES);
    const old = await reqToPromise<FsEntry | undefined>(s.get(p));
    if (old?.is_dir) return false;
    isNew = !old;
    const now = Date.now();
    const entry = newEntry(p, false, content, now);
    if (old) entry.created = old.created;
    await reqToPromise(s.put(entry));
    return true;
  });
  if (ok) emitFsChange(isNew ? 'create' : 'write', [p]);
  return ok;
}

/** delete files or dirs recursively */
export async function remove(paths: string[]): Promise<boolean> {
  await initFs();
  const removed: string[] = [];
  await tx(FILES, 'readwrite', async (t) => {
    const s = t.objectStore(FILES);
    for (const path of paths) {
      const p = normalize(path);
      if (p === ROOT) continue;
      const entry = await reqToPromise<FsEntry | undefined>(s.get(p));
      if (!entry) continue;
      if (entry.is_dir) await reqToPromise(s.delete(descendantsRange(p)));
      await reqToPromise(s.delete(p));
      removed.push(p);
    }
  });
  if (removed.length) emitFsChange('remove', removed);
  return removed.length === paths.length;
}

/** rename or move file or dir, overwrite the target file if any */
export async function rename(fromPath: string, toPath: string): Promise<boolean> {
  const from = normalize(fromPath);
  const to = normalize(toPath);
  if (from === ROOT || to === ROOT) return false;
  if (from === to) return exists(from);
  if (isWithin(to, from)) return false; // can not move a dir into itself
  if (!(await mkdirp(parent(to)))) return false;
  const ok = await tx(FILES, 'readwrite', async (t) => {
    const s = t.objectStore(FILES);
    const entry = await reqToPromise<FsEntry | undefined>(s.get(from));
    if (!entry) return false;
    const target = await reqToPromise<FsEntry | undefined>(s.get(to));
    if (target && (target.is_dir || entry.is_dir)) return false;
    const moving = entry.is_dir
      ? [entry, ...(await reqToPromise<FsEntry[]>(s.getAll(descendantsRange(from))))]
      : [entry];
    if (entry.is_dir) await reqToPromise(s.delete(descendantsRange(from)));
    await reqToPromise(s.delete(from));
    for (const item of moving) {
      const newPath = to + item.path.slice(from.length);
      await reqToPromise(s.put({
        ...item,
        path: newPath,
        parent: parent(newPath),
        name: basename(newPath),
        modified: item.path === from ? Date.now() : item.modified,
      }));
    }
    return true;
  });
  if (ok) {
    emitFsChange('renameFrom', [from]);
    emitFsChange('renameTo', [to]);
  }
  return ok;
}

/** copy a file */
export async function copyFile(srcPath: string, toPath: string): Promise<boolean> {
  const entry = await stat(srcPath);
  if (!entry || entry.is_dir) return false;
  return writeFile(toPath, entry.data ?? '');
}

/** simple metadata, the shape of Rust FileMetaData */
export function toMeta(entry: FsEntry, withText: boolean) {
  const time = (ms: number) => ({
    secs_since_epoch: Math.floor(ms / 1000),
    nanos_since_epoch: (ms % 1000) * 1e6,
  });
  return {
    file_path: entry.path,
    file_name: entry.name,
    file_text: withText && typeof entry.data === 'string' ? entry.data : '',
    created: time(entry.created),
    last_modified: time(entry.modified),
    last_accessed: time(entry.accessed),
    size: entry.size,
    readonly: false,
    is_dir: entry.is_dir,
    is_file: !entry.is_dir,
    is_hidden: isHidden(entry.path),
  };
}
