import { invoke } from '@tauri-apps/api/core';
import { fromWorkspacePath } from '@/file/util';
import {
  bookHashOf, bookIdOf, importBookFile, normalizeGroup, readLibrary, refreshLibrary, setBooksGroup,
} from './library';
import { convertibleFormatOf } from './document';

/**
 * Books imported from a folder of the device, as in readup: the files of the
 * formats chosen, larger than a size, in the folder and its sub folders.
 * Copied into reading/; grouped by their folders, or all in one group.
 */

/** The formats offered, by the extensions of their files. */
export const FORMAT_GROUPS = [
  { id: 'epub', label: 'EPUB', exts: ['epub'] },
  { id: 'pdf', label: 'PDF', exts: ['pdf'] },
  { id: 'mobi', label: 'MOBI/AZW/AZW3', exts: ['mobi', 'azw', 'azw3'] },
  { id: 'fb2', label: 'FB2/FBZ', exts: ['fb2', 'fbz'] },
  { id: 'cbz', label: 'CBZ', exts: ['cbz'] },
  // converted to EPUB, see convert/
  { id: 'txt', label: 'TXT', exts: ['txt'] },
  { id: 'md', label: 'Markdown', exts: ['md', 'markdown'] },
  { id: 'html', label: 'HTML', exts: ['html', 'htm', 'xhtml'] },
  { id: 'zip', label: 'ZIP', exts: ['zip'] },
] as const;

export type FolderImportOptions = {
  /** the folder, on the device */
  dir: string;
  /** the ids of FORMAT_GROUPS */
  formats: string[];
  /** the files smaller left out; 0 for none */
  minSizeKB: number;
  /** all the books in one group (the one opened); else grouped by their folders */
  flatten: boolean;
};

export const DEFAULT_FOLDER_IMPORT: FolderImportOptions = { dir: '', formats: ['epub', 'pdf'], minSizeKB: 20, flatten: false };

/** The options stored, valid ones only. */
export function withImportDefaults(options?: Partial<FolderImportOptions>): FolderImportOptions {
  const formats = (options?.formats ?? []).filter((id) => FORMAT_GROUPS.some((g) => g.id === id));
  const size = options?.minSizeKB;
  return {
    dir: typeof options?.dir === 'string' ? options.dir : '',
    // none ticked would block the import at once
    formats: formats.length ? formats : DEFAULT_FOLDER_IMPORT.formats,
    minSizeKB: typeof size === 'number' && Number.isFinite(size) && size >= 0 ? Math.floor(size) : DEFAULT_FOLDER_IMPORT.minSizeKB,
    flatten: typeof options?.flatten === 'boolean' ? options.flatten : DEFAULT_FOLDER_IMPORT.flatten,
  };
}

export type FoundBook = {
  path: string;
  size: number;
  /** the folder chosen and the sub folders down to the file, e.g. Books/Fiction */
  folder: string;
};

type Entry = { file_path: string; is_dir: boolean; is_hidden?: boolean; size?: number };

const nameOf = (path: string) => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? '';

/** The book files of the folder and its sub folders, hidden ones skipped, by the options. */
export async function scanFolder(options: FolderImportOptions): Promise<FoundBook[]> {
  const exts = new Set<string>(FORMAT_GROUPS.filter((g) => options.formats.includes(g.id)).flatMap((g) => [...g.exts]));
  const minSize = Math.max(0, options.minSizeKB) * 1024;
  const found: FoundBook[] = [];
  const walk = async (dir: string, folders: string[]) => {
    const entries = await invoke<Entry[]>('list_directory', { dir }).catch(() => [] as Entry[]);
    for (const entry of entries ?? []) {
      const name = nameOf(entry.file_path);
      if (entry.is_hidden || name.startsWith('.')) continue;
      if (entry.is_dir) {
        await walk(entry.file_path, [...folders, name]);
        continue;
      }
      const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
      const size = entry.size ?? 0;
      if (!exts.has(ext) || size < minSize) continue;
      found.push({ path: entry.file_path, size, folder: folders.join('/') });
    }
  };
  await walk(options.dir, [nameOf(options.dir)]);
  return found.sort((a, b) => a.path.localeCompare(b.path));
}

export type FolderImportResult = {
  added: number;
  /** in the library already: not copied again, but put in the group */
  existing: number;
  failed: string[];
};

/**
 * Import the books found: copied into reading/, unless in the library
 * already (same content). Each in the group of its folder, or all in the
 * group given, '' for none; the books already there moved too, as readup.
 */
export async function importFolder(
  ws: string,
  books: FoundBook[],
  options: { flatten: boolean; group?: string },
  onProgress?: (done: number, total: number) => void,
): Promise<FolderImportResult> {
  const lib = await readLibrary(ws);
  const result: FolderImportResult = { added: 0, existing: 0, failed: [] };
  const groups = new Map<string, string[]>();
  // the same book twice in the folder: copied once
  const seen = new Set<string>();
  // a book written again (a feed book): by its first id
  const idOf = (hash: string) => (hash && bookIdOf(lib, hash)) || hash;
  for (const [i, book] of books.entries()) {
    onProgress?.(i, books.length);
    // a text file: its book made first, the same EPUB if there already
    if (convertibleFormatOf(book.path)) {
      const path = await importBookFile(ws, book.path);
      const hash = idOf(path ? await bookHashOf(path).catch(() => '') : '');
      if (!hash) {
        result.failed.push(book.path);
        continue;
      }
      if (seen.has(hash) || lib.books[hash]) result.existing += 1;
      else result.added += 1;
      seen.add(hash);
      const group = normalizeGroup(options.flatten ? options.group ?? '' : book.folder);
      groups.set(group, [...(groups.get(group) ?? []), hash]);
      continue;
    }
    const hash = idOf(await bookHashOf(book.path).catch(() => ''));
    if (!hash) {
      result.failed.push(book.path);
      continue;
    }
    const known = lib.books[hash];
    const here = seen.has(hash)
      || (known && (await invoke<boolean>('file_exist', { filePath: fromWorkspacePath(ws, known.file) })));
    seen.add(hash);
    if (here) {
      result.existing += 1;
    } else if (await importBookFile(ws, book.path)) {
      result.added += 1;
    } else {
      result.failed.push(book.path);
      continue;
    }
    const group = normalizeGroup(options.flatten ? options.group ?? '' : book.folder);
    groups.set(group, [...(groups.get(group) ?? []), hash]);
  }
  onProgress?.(books.length, books.length);
  // the new files in the library, then in their groups
  await refreshLibrary(ws);
  for (const [group, hashes] of groups) await setBooksGroup(ws, hashes, group);
  return result;
}
