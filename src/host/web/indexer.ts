/**
 * The index of the workspace of the web version, the stand-in of
 * src-tauri/src/index: what the notes link to, without their content, and
 * the full-text search, kept up to date with the changes of the files.
 * In memory, and saved (KV `search_index`) a while after it changes: on the
 * next open only the notes changed since are parsed and indexed again, and
 * the books are found indexed.
 */
import { parseNote, type Parsed } from "../../lib/parseNote";
import * as fs from "./fs";
import { fileStem, isTextNote, isWithin, normalize } from "./path";
import { createSearch, type SearchApi } from "./searchClient";
import { onFsChange } from "./watch";
import { KV, get, put } from "./idb";

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

type Index = {
  root: string;
  notes: Map<string, IndexedNote>;
  books: Set<string>;
};

let current: Index | undefined;
let search: SearchApi | undefined;
const searchApi = () => (search ??= createSearch());

const isHiddenUnder = (root: string, path: string) =>
  path
    .slice(root === "/" ? 1 : root.length + 1)
    .split("/")
    .some((part) => part.startsWith("."));

async function noteOf(
  entry: fs.FsEntry,
): Promise<{ note: IndexedNote; body?: string }> {
  let parsed = EMPTY;
  let body: string | undefined;
  if (!entry.is_dir && isTextNote(entry.path)) {
    body =
      typeof entry.data === "string"
        ? entry.data
        : await fs.readText(entry.path).catch(() => "");
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

/** KV key of the saved index */
export const SNAPSHOT_KEY = "search_index";
// bump when what is saved, or how notes are parsed, changes
const SNAPSHOT_VERSION = 1;
const appVersion = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "";

type Snapshot = {
  v: number;
  app: string;
  root: string;
  notes: IndexedNote[];
  books: string[];
  search: string;
};

async function loadSnapshot(root: string): Promise<Snapshot | undefined> {
  const snap = await get<Snapshot>(KV, SNAPSHOT_KEY).catch(() => undefined);
  if (
    !snap ||
    snap.v !== SNAPSHOT_VERSION ||
    snap.app !== appVersion ||
    snap.root !== root ||
    !Array.isArray(snap.notes) ||
    typeof snap.search !== "string"
  )
    return undefined;
  return snap;
}

/** the ids of the books in the library of the workspace; undefined if unknown */
async function libraryBooks(root: string): Promise<Set<string> | undefined> {
  try {
    const text = await fs.readText(
      `${root === "/" ? "" : root}/.mdsilo/books.json`,
    );
    const books = (JSON.parse(text) as { books?: Record<string, unknown> })
      .books;
    return books && typeof books === "object"
      ? new Set(Object.keys(books))
      : undefined;
  } catch {
    return undefined;
  }
}

/** the note as saved still is the file: not changed since */
const unchanged = (note: IndexedNote, entry: fs.FsEntry) =>
  note.is_dir === entry.is_dir &&
  note.size === entry.size &&
  note.updated_at === new Date(entry.modified).toISOString();

/** Index the workspace: all its notes, without content. */
export async function indexOpen(dir: string): Promise<IndexedNote[]> {
  const root = normalize(dir);
  const notes = new Map<string, IndexedNote>();
  const docs = [];
  const snap = await loadSnapshot(root);
  const loaded = snap ? await searchApi().load(snap.search) : false;
  if (!loaded) await searchApi().clear();
  // the notes as saved; what is left of them at the end is gone
  const saved = new Map(
    loaded && snap ? snap.notes.map((n) => [n.id, n] as const) : [],
  );
  const stale: string[] = [];
  for (const entry of await fs.walk(root, true)) {
    const before = saved.get(entry.path);
    saved.delete(entry.path);
    if (before && unchanged(before, entry)) {
      notes.set(before.id, before);
      continue;
    }
    const { note, body } = await noteOf(entry);
    notes.set(note.id, note);
    if (body !== undefined)
      docs.push({
        id: note.id,
        kind: "note" as const,
        title: note.title,
        label: "",
        body,
      });
    else if (before) stale.push(note.id);
  }
  stale.push(...saved.keys());
  const books = new Set(loaded && snap ? snap.books : []);
  // the books gone from the library since: their text out of the search
  const library = await libraryBooks(root);
  for (const hash of [...books]) {
    if (!library || library.has(hash)) continue;
    books.delete(hash);
    await searchApi().deletePrefix(`book:${hash}#`);
    stale.push(`book:${hash}`);
  }
  current = { root, notes, books };
  if (stale.length) await searchApi().delete(stale);
  await searchApi().put(docs);
  if (!loaded || docs.length || stale.length) scheduleSave();
  return [...notes.values()];
}

// ---- saving the index ----

/** wait after the last change before saving: the index may be large */
const SAVE_DELAY = 10_000;
// tests save by indexSave()
const AUTO_SAVE = !import.meta.env?.VITEST;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let listening = false;

function scheduleSave() {
  if (!AUTO_SAVE) return;
  if (!listening && typeof document !== "undefined") {
    listening = true;
    // the app may be closed soon: save what is pending at once
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = undefined;
        void indexSave();
      }
    });
  }
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    void indexSave();
  }, SAVE_DELAY);
}

/** Save the index of the workspace open, for the next open. */
export async function indexSave(): Promise<void> {
  const index = current;
  if (!index) return;
  try {
    const search = await searchApi().dump();
    // another workspace opened meanwhile: its own index is saved
    if (current !== index) return;
    const snap: Snapshot = {
      v: SNAPSHOT_VERSION,
      app: appVersion,
      root: index.root,
      notes: [...index.notes.values()],
      books: [...index.books],
      search,
    };
    await put(KV, snap, SNAPSHOT_KEY);
  } catch (e) {
    // the next open indexes all again
    console.warn("Failed to save the search index", e);
  }
}

/** Update the index for the paths changed. */
export async function indexUpdate(
  paths: string[],
): Promise<{ updated: IndexedNote[]; removed: string[] }> {
  const index = current;
  const delta = { updated: [] as IndexedNote[], removed: [] as string[] };
  if (!index) return delta;
  const docs = [];
  for (const raw of paths) {
    const path = normalize(raw);
    if (
      !isWithin(path, index.root) ||
      path === index.root ||
      isHiddenUnder(index.root, path)
    )
      continue;
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
    const entries = entry.is_dir
      ? [entry, ...(await fs.walk(path, true))]
      : [entry];
    for (const e of entries) {
      const { note, body } = await noteOf(e);
      index.notes.set(note.id, note);
      delta.updated.push(note);
      if (body !== undefined)
        docs.push({
          id: note.id,
          kind: "note" as const,
          title: note.title,
          label: "",
          body,
        });
    }
  }
  await searchApi().put(docs);
  if (delta.updated.length || delta.removed.length) scheduleSave();
  return delta;
}

export async function indexSearch(
  query: string,
  kind: string | undefined,
  limit = 50,
) {
  if (!current) throw new Error("no index open");
  const hits = await searchApi().search(query, kind, limit);
  return hits.map((hit) => ({
    ...hit,
    path: hit.kind === "note" ? hit.id : "",
  }));
}

export async function indexBook(
  hash: string,
  title: string,
  sections: BookSection[],
) {
  if (!current) throw new Error("no index open");
  await searchApi().deletePrefix(`book:${hash}#`);
  await searchApi().put(
    sections.map((s) => ({
      id: `book:${hash}#${s.cfi}`,
      kind: "book" as const,
      title,
      label: s.label,
      body: s.text,
    })),
  );
  current.books.add(hash);
  scheduleSave();
}

export const indexBookIndexed = (hash: string) =>
  Boolean(current?.books.has(hash));

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
      .catch((e) => console.error("Failed to update the index", e))
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
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = undefined;
}
