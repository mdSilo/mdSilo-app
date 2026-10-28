/**
 * The index of the workspace of the web version, the stand-in of
 * src-tauri/src/index: what the notes link to, without their content, and
 * the full-text search, kept up to date with the changes of the files.
 * In memory: the notes are in IndexedDB already, read once per open.
 */
import { parseNote, type Parsed } from '../../lib/parseNote';
import * as fs from './fs';
import { fileStem, isTextNote, isWithin, normalize } from './path';
import { createSearch, type SearchApi } from './searchClient';
import { onFsChange } from './watch';

export type IndexedNote = {
  id: string;
  title: string;
  file_path: string;
  created_at: string;
  updated_at: string;
  is_dir: boolean;
  size: number;
} & Parsed;

export type BookSection = { cfi: string; label: string; text: string };

const EMPTY: Parsed = { links: [], tags: [], issues: [], has_tasks: false };

type Index = { root: string; notes: Map<string, IndexedNote>; books: Set<string> };

let current: Index | undefined;
let search: SearchApi | undefined;
const searchApi = () => (search ??= createSearch());

const isHiddenUnder = (root: string, path: string) =>
  path.slice(root === '/' ? 1 : root.length + 1).split('/').some((part) => part.startsWith('.'));

async function noteOf(entry: fs.FsEntry): Promise<{ note: IndexedNote; body?: string }> {
  let parsed = EMPTY;
  let body: string | undefined;
  if (!entry.is_dir && isTextNote(entry.path)) {
    body = typeof entry.data === 'string' ? entry.data : await fs.readText(entry.path).catch(() => '');
    parsed = parseNote(body);
  }
  return {
    note: {
      id: entry.path,
      title: fileStem(entry.name),
      file_path: entry.path,
      created_at: new Date(entry.created).toISOString(),
      updated_at: new Date(entry.modified).toISOString(),
      is_dir: entry.is_dir,
      size: entry.size,
      ...parsed,
    },
    body,
  };
}

/** Index the workspace: all its notes, without content. */
export async function indexOpen(dir: string): Promise<IndexedNote[]> {
  const root = normalize(dir);
  const notes = new Map<string, IndexedNote>();
  const docs = [];
  for (const entry of await fs.walk(root, true)) {
    const { note, body } = await noteOf(entry);
    notes.set(note.id, note);
    if (body !== undefined) docs.push({ id: note.id, kind: 'note' as const, title: note.title, label: '', body });
  }
  current = { root, notes, books: new Set() };
  await searchApi().clear();
  await searchApi().put(docs);
  return [...notes.values()];
}

/** Update the index for the paths changed. */
export async function indexUpdate(paths: string[]): Promise<{ updated: IndexedNote[]; removed: string[] }> {
  const index = current;
  const delta = { updated: [] as IndexedNote[], removed: [] as string[] };
  if (!index) return delta;
  const docs = [];
  for (const raw of paths) {
    const path = normalize(raw);
    if (!isWithin(path, index.root) || path === index.root || isHiddenUnder(index.root, path)) continue;
    const entry = await fs.stat(path);
    if (!entry) {
      for (const id of [...index.notes.keys()]) {
        if (id === path || id.startsWith(`${path}/`)) index.notes.delete(id);
      }
      await searchApi().delete([path]);
      await searchApi().deletePrefix(`${path}/`);
      delta.removed.push(path);
      continue;
    }
    const entries = entry.is_dir ? [entry, ...(await fs.walk(path, true))] : [entry];
    for (const e of entries) {
      const { note, body } = await noteOf(e);
      index.notes.set(note.id, note);
      delta.updated.push(note);
      if (body !== undefined) docs.push({ id: note.id, kind: 'note' as const, title: note.title, label: '', body });
    }
  }
  await searchApi().put(docs);
  return delta;
}

export async function indexSearch(query: string, kind: string | undefined, limit = 50) {
  if (!current) throw new Error('no index open');
  const hits = await searchApi().search(query, kind, limit);
  return hits.map((hit) => ({ ...hit, path: hit.kind === 'note' ? hit.id : '' }));
}

export async function indexBook(hash: string, title: string, sections: BookSection[]) {
  if (!current) throw new Error('no index open');
  await searchApi().deletePrefix(`book:${hash}#`);
  await searchApi().put(sections.map((s) => ({
    id: `book:${hash}#${s.cfi}`, kind: 'book' as const, title, label: s.label, body: s.text,
  })));
  current.books.add(hash);
}

export const indexBookIndexed = (hash: string) => Boolean(current?.books.has(hash));

// the files changed: the index follows, the changes of a moment together
let changed = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;
const updating = new Set<Promise<unknown>>();
onFsChange((_kind, paths) => {
  if (!current) return;
  paths.forEach((p) => changed.add(p));
  if (timer) return;
  timer = setTimeout(() => {
    timer = undefined;
    const batch = [...changed];
    changed = new Set();
    const update = indexUpdate(batch)
      .catch((e) => console.error('Failed to update the index', e))
      .finally(() => updating.delete(update));
    updating.add(update);
  }, 0);
});

/** Resolves once the index follows the changes so far; for tests. */
export async function indexSettled() {
  while (timer || updating.size) {
    if (timer) await new Promise((r) => setTimeout(r, 0));
    else await Promise.all(updating);
  }
}

/** Forget the index; for tests. */
export function resetIndexer() {
  current = undefined;
  search = undefined;
  changed = new Set();
  updating.clear();
  if (timer) clearTimeout(timer);
  timer = undefined;
}
