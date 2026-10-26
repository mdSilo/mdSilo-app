import { invoke } from '@tauri-apps/api/core';
import { fromWorkspacePath, joinPath, toWorkspacePath } from 'file/util';
import { DATA_DIR, READING_DIR } from 'workspace/layout';
import { updateGitignore } from 'workspace/gitignore';
import { bookFormatOf, isBookFile, type BookFormat } from './document';

/**
 * The books of a workspace, by their id: the partial MD5 of the file, so a
 * book is the same book wherever it is, renamed, moved or on another device.
 *
 *   .mdsilo/books.json        the library: file, title, author... per book
 *   .mdsilo/books/<id>.json   the reading state of a book: place, progress
 *   reading/.gitignore        the book files are not synced unless chosen
 *
 * The annotations are next to the book: see annotations.ts.
 */
export const LIBRARY_FILE = 'books.json';
export const BOOK_STATE_DIR = 'books';
export const LIBRARY_VERSION = 1;

export type BookEntry = {
  hash: string;
  /** the book file, relative to the workspace, e.g. reading/Foo.epub */
  file: string;
  title: string;
  author: string;
  format: BookFormat;
  addedAt: string;
  /** the book file is synced with the workspace (git) */
  synced?: boolean;
};

export type Library = { version: number; books: Record<string, BookEntry> };

export type BookState = {
  /** CFI of the place read */
  location?: string;
  /** 0 to 1 */
  fraction?: number;
  updatedAt: string;
};

export const emptyLibrary = (): Library => ({ version: LIBRARY_VERSION, books: {} });

const libraryPath = (ws: string) => joinPath(ws, DATA_DIR, LIBRARY_FILE);
const statePath = (ws: string, hash: string) => joinPath(ws, DATA_DIR, BOOK_STATE_DIR, `${hash}.json`);

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    const text = await invoke<string>('read_file', { filePath: path });
    return text?.trim() ? (JSON.parse(text) as T) : undefined;
  } catch (e) {
    if (e instanceof SyntaxError) console.error(`${path} is not valid JSON`, e);
    return undefined;
  }
}

async function writeJson(path: string, data: unknown) {
  const text = `${JSON.stringify(data, null, 2)}\n`;
  await invoke('write_file', { filePath: path, text });
}

export async function readLibrary(ws: string): Promise<Library> {
  const lib = await readJson<Partial<Library>>(libraryPath(ws));
  const books: Record<string, BookEntry> = {};
  for (const [hash, entry] of Object.entries(lib?.books ?? {})) {
    if (entry?.file) books[hash] = { ...entry, hash };
  }
  return { version: LIBRARY_VERSION, books };
}

export async function writeLibrary(ws: string, lib: Library) {
  // sorted by id: the file changes only with the books
  const books = Object.fromEntries(Object.entries(lib.books).sort(([a], [b]) => (a < b ? -1 : 1)));
  await writeJson(libraryPath(ws), { version: LIBRARY_VERSION, books });
}

export async function readBookState(ws: string, hash: string): Promise<BookState | undefined> {
  return readJson<BookState>(statePath(ws, hash));
}

export async function writeBookState(ws: string, hash: string, state: BookState) {
  await writeJson(statePath(ws, hash), state);
}

export const bookHashOf = (path: string) => invoke<string>('book_hash', { filePath: path });

/** The book files in the dir and its sub dirs, hidden ones skipped. */
export async function listBookFiles(dir: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (d: string) => {
    const entries = await invoke<{ file_path: string; is_dir: boolean; is_hidden: boolean }[]>(
      'list_directory', { dir: d }
    ).catch(() => []);
    for (const entry of entries ?? []) {
      if (entry.is_hidden) continue;
      if (entry.is_dir) await walk(entry.file_path);
      else if (isBookFile(entry.file_path)) found.push(entry.file_path);
    }
  };
  await walk(dir);
  return found;
}

/** The title of a book by its file name, until its metadata is read. */
export const titleOfFile = (path: string) =>
  (path.split(/[\\/]/).pop() ?? path).replace(/\.[^.]+$/, '');

/**
 * The library up to date with the book files in reading/: new files added,
 * moved or renamed ones (same id) followed. Books not here (not synced to
 * this device) are kept. Written only if it changed.
 */
export async function refreshLibrary(ws: string): Promise<Library> {
  const lib = await readLibrary(ws);
  const byFile = new Map(Object.values(lib.books).map((b) => [b.file, b]));
  let changed = false;
  for (const path of await listBookFiles(joinPath(ws, READING_DIR))) {
    const file = toWorkspacePath(ws, path);
    if (byFile.has(file)) continue;
    const hash = await bookHashOf(path);
    if (!hash) continue;
    const known = lib.books[hash];
    if (known) {
      // moved or renamed; if both files are there, the first listed stays
      if (await invoke<boolean>('file_exist', { filePath: fromWorkspacePath(ws, known.file) })) continue;
      lib.books[hash] = { ...known, file };
    } else {
      lib.books[hash] = {
        hash,
        file,
        title: titleOfFile(path),
        author: '',
        format: bookFormatOf(path) ?? 'EPUB',
        addedAt: new Date().toISOString(),
      };
    }
    changed = true;
  }
  if (changed) {
    await writeLibrary(ws, lib);
    await writeReadingGitignore(ws, lib);
  }
  return lib;
}

/** Add or update a book entry. */
export async function saveBookEntry(ws: string, entry: BookEntry) {
  const lib = await readLibrary(ws);
  const old = lib.books[entry.hash];
  if (old && JSON.stringify(old) === JSON.stringify(entry)) return;
  lib.books[entry.hash] = entry;
  await writeLibrary(ws, lib);
}

/**
 * Bring a book file into reading/: copied, unless it is in there already.
 * @returns the path of the book in the workspace, undefined on failure
 */
export async function importBookFile(ws: string, src: string): Promise<string | undefined> {
  const readingDir = joinPath(ws, READING_DIR);
  if (toWorkspacePath(readingDir, src) !== src) return src;
  const name = src.split(/[\\/]/).pop() ?? 'book';
  const dot = name.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  const srcHash = await bookHashOf(src);
  for (let i = 0; i < 100; i++) {
    const target = joinPath(readingDir, i === 0 ? name : `${stem}-${i}${ext}`);
    if (await invoke<boolean>('file_exist', { filePath: target })) {
      // the same book there already
      if (srcHash && (await bookHashOf(target)) === srcHash) return target;
      continue;
    }
    return (await invoke<boolean>('copy_file', { srcPath: src, toPath: target })) ? target : undefined;
  }
  return undefined;
}

/** Write reading/.gitignore for the books of the library chosen to sync. */
export async function writeReadingGitignore(ws: string, lib: Library) {
  const path = joinPath(ws, READING_DIR, '.gitignore');
  const synced = Object.values(lib.books)
    .filter((b) => b.synced)
    .map((b) => toWorkspacePath(joinPath(ws, READING_DIR), fromWorkspacePath(ws, b.file)));
  const old = await invoke<string>('read_file', { filePath: path }).catch(() => '');
  const text = updateGitignore(old ?? '', synced);
  if (text !== old) await invoke('write_file', { filePath: path, text });
}

/** Sync a book file with the workspace, or not. */
export async function setBookSynced(ws: string, hash: string, synced: boolean) {
  const lib = await readLibrary(ws);
  const entry = lib.books[hash];
  if (!entry) return;
  lib.books[hash] = { ...entry, synced };
  await writeLibrary(ws, lib);
  await writeReadingGitignore(ws, lib);
}
