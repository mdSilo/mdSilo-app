import { invoke } from '@tauri-apps/api/core';
import { fromWorkspacePath, isTauri, joinPath, toWorkspacePath } from '@/workspace/util';
import { DATA_DIR, READING_DIR, WRITING_DIR } from '@/workspace/layout';
import { updateGitignore } from '@/workspace/gitignore';
import {
  BOOK_EXTS, bookFormatOf, CONVERTIBLE_EXTS, convertibleFormatOf, formatContributors, formatLanguageMap, isBookFile, type BookDoc, type BookFormat, type Contributor,
} from './document';
import { convertToBook } from './convert';
import { setLibraryBooks } from './books';

/**
 * The books of a workspace, by their id: the partial MD5 of the file, so a
 * book is the same book wherever it is, renamed, moved or on another device.
 * A book the app writes again (a feed book, see feedBook.ts) keeps its first
 * id, its file's hash now in `fileHash`: its notes, `book:` links, reading
 * state stay with it. See bookIdOf.
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
  // the metadata, as the book says or as edited
  subtitle?: string;
  series?: string;
  seriesIndex?: number;
  seriesTotal?: number;
  publisher?: string;
  /** e.g. 2001, 2001-09-11 */
  published?: string;
  /** codes, e.g. en, zh-CN */
  language?: string[];
  identifier?: string;
  subjects?: string[];
  /** HTML, as in the book: sanitized to show */
  description?: string;
  /** the metadata of the book file read, at least once */
  metaRead?: boolean;
  /** the metadata edited by the user: not taken from the book file any more */
  edited?: boolean;
  /** the cover: of the book (cached), chosen (synced, see covers.ts), or none */
  cover?: 'custom' | 'none';
  /** the group of the library, nested by `/`, e.g. Fiction/Classics */
  group?: string;
  /** e.g. Todo, Doing, Done */
  status?: string;
  /** the partial MD5 of the file now, if not the id: the book written again by the app */
  fileHash?: string;
  /** a book made of feed articles: its name, to add the new articles to it (see feedBook.ts) */
  feed?: string;
};

/** The fields of the metadata, edited together. */
export const META_FIELDS = [
  'title', 'subtitle', 'author', 'series', 'seriesIndex', 'seriesTotal', 'publisher', 'published',
  'language', 'identifier', 'subjects', 'description',
] as const;

export type BookMeta = Pick<BookEntry, (typeof META_FIELDS)[number]>;

export type Library = { version: number; books: Record<string, BookEntry> };

export type BookState = {
  /** CFI of the place read */
  location?: string;
  /** 0 to 1 */
  fraction?: number;
  /** seconds read per day, `yyyy-m-d` */
  time?: Record<string, number>;
  updatedAt: string;
};

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const strings = (value: unknown): string[] =>
  (Array.isArray(value) ? value : value ? [value] : []).map(text).filter(Boolean);

type FoliateMetadata = BookDoc['metadata'] & {
  subtitle?: string;
  subject?: Contributor;
  belongsTo?: { series?: { name?: string; position?: string | number } | { name?: string; position?: string | number }[] | null };
};

/** The metadata of a book, as the book file says; title by the file name if none. */
export function bookMetaOf(book: BookDoc, path: string): BookMeta {
  const meta = (book.metadata ?? {}) as FoliateMetadata;
  const series = [meta.belongsTo?.series ?? []].flat()[0];
  const index = Number.parseFloat(String(series?.position ?? ''));
  const subjects = [meta.subject ?? []].flat().map((s) => formatContributors(s).trim()).filter(Boolean);
  const identifier = text(meta.identifier).replace(/^urn:(isbn|uuid|doi):/i, '');
  return {
    title: formatLanguageMap(meta.title) || titleOfFile(path),
    author: formatContributors(meta.author),
    subtitle: text(meta.subtitle) || undefined,
    series: text(series?.name) || undefined,
    seriesIndex: Number.isFinite(index) ? index : undefined,
    publisher: formatContributors(meta.publisher as Contributor) || undefined,
    published: text(meta.published) || undefined,
    language: strings(meta.language).length ? strings(meta.language) : undefined,
    identifier: identifier || undefined,
    subjects: subjects.length ? subjects : undefined,
    description: text(meta.description) || undefined,
  };
}

/**
 * The entry with the metadata of its book file: unless edited by the user,
 * then as it is. Undefined fields of the book are not written.
 */
export function withBookMeta(entry: BookEntry, meta: BookMeta): BookEntry {
  if (entry.edited) return { ...entry, metaRead: true };
  const defined = Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== undefined));
  return { ...entry, ...defined, metaRead: true };
}

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

// the changes of the library one at a time: each reads it, then writes it
let queue: Promise<unknown> = Promise.resolve();

/** Change the library: after the changes in progress, not over them. */
function changeLibrary<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

export async function readLibrary(ws: string): Promise<Library> {
  const lib = await readJson<Partial<Library>>(libraryPath(ws));
  const books: Record<string, BookEntry> = {};
  for (const [hash, entry] of Object.entries(lib?.books ?? {})) {
    if (entry?.file) books[hash] = { ...entry, hash };
  }
  setLibraryBooks(ws, books);
  return { version: LIBRARY_VERSION, books };
}

export async function writeLibrary(ws: string, lib: Library) {
  // sorted by id: the file changes only with the books
  const books = Object.fromEntries(Object.entries(lib.books).sort(([a], [b]) => (a < b ? -1 : 1)));
  await writeJson(libraryPath(ws), { version: LIBRARY_VERSION, books });
  setLibraryBooks(ws, { ...lib.books });
}

export async function readBookState(ws: string, hash: string): Promise<BookState | undefined> {
  return readJson<BookState>(statePath(ws, hash));
}

export async function writeBookState(ws: string, hash: string, state: BookState) {
  await writeJson(statePath(ws, hash), state);
}

export const bookHashOf = (path: string) => invoke<string>('book_hash', { filePath: path });

/**
 * The id of a book file in the library, by its hash: the hash itself, or the
 * book's whose file has it now (written again); else a book written again
 * by the app at that file (its hash not up to date, e.g. the file synced, the
 * library not yet). Undefined if a new book.
 * @param file relative to the workspace
 */
export function bookIdOf(lib: Library, hash: string, file?: string): string | undefined {
  if (lib.books[hash]) return hash;
  const books = Object.values(lib.books);
  return (books.find((b) => b.fileHash === hash) ?? (file ? books.find((b) => b.feed && b.file === file) : undefined))?.hash;
}

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
export function refreshLibrary(ws: string): Promise<Library> {
  return changeLibrary(() => refresh(ws));
}

async function refresh(ws: string): Promise<Library> {
  const lib = await readLibrary(ws);
  const byFile = new Map(Object.values(lib.books).map((b) => [b.file, b]));
  let changed = false;
  for (const path of await listBookFiles(joinPath(ws, READING_DIR))) {
    const file = toWorkspacePath(ws, path);
    if (byFile.has(file)) continue;
    const fileHash = await bookHashOf(path);
    if (!fileHash) continue;
    const hash = bookIdOf(lib, fileHash) ?? fileHash;
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

/**
 * Add a book entry, or update the fields given of one: the others as they
 * are now (e.g. synced, set meanwhile).
 */
export function saveBookEntry(ws: string, patch: Partial<BookEntry> & Pick<BookEntry, 'hash'>) {
  return changeLibrary(() => saveEntry(ws, patch));
}

async function saveEntry(ws: string, patch: Partial<BookEntry> & Pick<BookEntry, 'hash'>) {
  const lib = await readLibrary(ws);
  const old = lib.books[patch.hash];
  const entry = { ...old, ...patch } as BookEntry;
  if (!entry.file) return;
  if (old && JSON.stringify(old) === JSON.stringify(entry)) return;
  lib.books[patch.hash] = entry;
  await writeLibrary(ws, lib);
}

/**
 * Bring a book file into reading/: copied, unless it is in there already.
 * @returns the path of the book in the workspace, undefined on failure
 */
export async function importBookFile(ws: string, src: string): Promise<string | undefined> {
  // a text file (TXT, Markdown, HTML, ZIP): its book, an EPUB
  if (convertibleFormatOf(src)) {
    try {
      const book = await convertToBook(src, await readBytes(src), {
        path: src,
        // `./` paths of the notes: in writing/, or the root of a legacy workspace
        notesRoots: [joinPath(ws, WRITING_DIR), ws],
        readFile: (path) => readBytes(path).catch(() => undefined),
      });
      return await importBookData(ws, book.name, book.data);
    } catch (e) {
      console.warn('Failed to convert to a book', src, e);
      return undefined;
    }
  }
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
export function setBookSynced(ws: string, hash: string, synced: boolean) {
  return setBooksSynced(ws, [hash], synced);
}

/** Sync the files of some books with the workspace, or not: written once. */
export function setBooksSynced(ws: string, hashes: string[], synced: boolean) {
  return changeLibrary(async () => {
    const lib = await readLibrary(ws);
    const changed = hashes.filter((hash) => lib.books[hash] && Boolean(lib.books[hash].synced) !== synced);
    if (changed.length === 0) return;
    for (const hash of changed) lib.books[hash] = { ...lib.books[hash], synced };
    await writeLibrary(ws, lib);
    await writeReadingGitignore(ws, lib);
  });
}

/** The book file of an id, if it is on this device; looked for if moved. */
export async function findBookPath(ws: string, hash: string): Promise<string | undefined> {
  const pathOf = async (lib: Library) => {
    const entry = lib.books[hash];
    if (!entry) return undefined;
    const path = fromWorkspacePath(ws, entry.file);
    return (await invoke<boolean>('file_exist', { filePath: path })) ? path : undefined;
  };
  return (await pathOf(await readLibrary(ws))) ?? (await pathOf(await refreshLibrary(ws)));
}

/** Change some books of the library by a function; those it returns changed. */
function changeBooks(ws: string, fn: (lib: Library) => BookEntry[]) {
  return changeLibrary(async () => {
    const lib = await readLibrary(ws);
    const changed = fn(lib);
    for (const entry of changed) lib.books[entry.hash] = entry;
    if (changed.length > 0) await writeLibrary(ws, lib);
    return lib;
  });
}

/** Put the books in a group, '' for none. */
export function setBooksGroup(ws: string, hashes: string[], group: string) {
  const name = normalizeGroup(group);
  return changeBooks(ws, (lib) => hashes
    .map((hash) => lib.books[hash])
    .filter((entry): entry is BookEntry => Boolean(entry) && (entry.group ?? '') !== name)
    .map((entry) => ({ ...entry, group: name || undefined })));
}

/**
 * Rename a group, its sub groups with it: `A` to `B` makes `A/C` `B/C`.
 * To '' the books go up to the parent of the group.
 */
export function renameGroup(ws: string, from: string, to: string) {
  const parent = from.includes('/') ? from.slice(0, from.lastIndexOf('/')) : '';
  const target = normalizeGroup(to) || parent;
  return changeBooks(ws, (lib) => Object.values(lib.books).flatMap((entry) => {
    const group = entry.group ?? '';
    if (group !== from && !group.startsWith(`${from}/`)) return [];
    const renamed = normalizeGroup(target + group.slice(from.length));
    return [{ ...entry, group: renamed || undefined }];
  }));
}

/** `a / b/` as `a/b`: the parts trimmed, the empty ones dropped. */
export const normalizeGroup = (group: string) =>
  group.split('/').map((part) => part.trim()).filter(Boolean).join('/');

/**
 * Remove a book from the library: its file, its reading state; its notes too
 * if asked (the md next to the book). The covers are removed by covers.ts.
 */
export function deleteBook(ws: string, hash: string, withNotes = false) {
  return deleteBooks(ws, [hash], withNotes);
}

/** Remove some books from the library, as deleteBook: written once. */
export function deleteBooks(ws: string, hashes: string[], withNotes = false) {
  return changeLibrary(async () => {
    const lib = await readLibrary(ws);
    const entries = hashes.map((hash) => lib.books[hash]).filter((entry): entry is BookEntry => Boolean(entry));
    if (entries.length === 0) return lib;
    const paths = entries.flatMap((entry) => {
      const path = fromWorkspacePath(ws, entry.file);
      return [path, statePath(ws, entry.hash), ...(withNotes ? [`${path}.md`] : [])];
    });
    await invoke('delete_files', { paths });
    for (const entry of entries) delete lib.books[entry.hash];
    await writeLibrary(ws, lib);
    await writeReadingGitignore(ws, lib);
    return lib;
  });
}

/** The extensions of the files imported as books: the books, and the text files converted. */
export const IMPORT_EXTS = [...Object.keys(BOOK_EXTS), ...Object.keys(CONVERTIBLE_EXTS)];

/** A file imported as a book: a book file, or a text file converted. */
export const isImportable = (path: string) => isBookFile(path) || Boolean(convertibleFormatOf(path));

const readBytes = async (path: string) => {
  const data = await invoke<ArrayBuffer | Uint8Array | number[]>('read_file_bytes', { filePath: path });
  return data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
};

/**
 * Write the bytes of a file: on the desktop sent as binary, a book of some
 * MB being slow as a JSON array of numbers; on the web kept as they are.
 */
export const writeBytes = (path: string, data: Uint8Array) => (isTauri
  ? invoke<boolean>('write_file_raw', data, { headers: { 'file-path': encodeURIComponent(path) } })
  : invoke<boolean>('write_file_bytes', { filePath: path, data }));

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Write a book file dropped in, by its name and bytes, into reading/ (or a
 * folder in it): not over another file. A text file (TXT, Markdown, HTML,
 * ZIP) is converted to its book, an EPUB.
 * @returns the path written, or of the same book there already; undefined on failure
 */
export async function importBookData(ws: string, name: string, data: Uint8Array): Promise<string | undefined> {
  if (convertibleFormatOf(name)) {
    try {
      ({ name, data } = await convertToBook(name, data));
    } catch (e) {
      console.warn('Failed to convert to a book', name, e);
      return undefined;
    }
  }
  const readingDir = joinPath(ws, READING_DIR);
  const dot = name.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  for (let i = 0; i < 100; i++) {
    const target = joinPath(readingDir, i === 0 ? name : `${stem}-${i}${ext}`);
    if (await invoke<boolean>('file_exist', { filePath: target })) {
      // the same book there already, e.g. a text file imported again
      if (sameBytes(await readBytes(target).catch(() => new Uint8Array()), data)) return target;
      continue;
    }
    return (await writeBytes(target, data)) ? target : undefined;
  }
  return undefined;
}
