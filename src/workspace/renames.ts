import { invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import { bookWindowParams } from "@/state/windowKind";
import { isBookFile } from "@/reader/document";
import { fromWorkspacePath, movedPath, normalizeSlash } from "./util";

/**
 * A file or dir renamed or moved, in the app or not (a file manager, another
 * editor, while the app was closed), followed as a rename in the app is:
 *
 * - a note: the links to it by title, in the notes and in the issues, to its
 *   new title; the issues linked to it, to its new path;
 * - a book: its notes (`Foo.epub.md`) moved with it, its library entry, the
 *   book open, the last book read;
 * - a dir: the same for the notes and books in it (their titles stay);
 * - the note or book shown (see onRenamed).
 *
 * The reading progress, the `book:` links, the vocabulary are by the hash of
 * the book: they do not change.
 *
 * The renames are followed one after the other. Each step checks what is
 * done already, so a rename seen twice (done in the app, then seen by the
 * watcher) does nothing more the second time.
 */

export type Renamed = { from: string; to: string };

const listeners = new Set<(renamed: Renamed) => void>();

/** Called once a rename is followed: the views follow the file. */
export function onRenamed(listener: (renamed: Renamed) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Markdown (or text) notes, as the index has them. */
const NOTE = /\.(md|markdown|txt|text)$/i;

/** The title of a note by its path, as the index has it: no extension. */
export const titleOfPath = (path: string) =>
  path.slice(path.lastIndexOf("/") + 1).replace(/(.)\.[^.]*$/, "$1");

let queue: Promise<void> = Promise.resolve();

/** Follow a rename, after the ones before. */
export function followRename(from: string, to: string): Promise<void> {
  const next = queue.then(() =>
    follow(normalizeSlash(from), normalizeSlash(to)),
  );
  queue = next.catch((e: unknown) =>
    console.error(`Failed to follow the rename of ${from} to ${to}`, e),
  );
  return queue;
}

async function follow(from: string, to: string) {
  const { initDir, layout } = store.getState();
  if (!initDir || from === to) return;
  const kind =
    NOTE.test(from) && NOTE.test(to)
      ? "note"
      : isBookFile(from) && isBookFile(to)
        ? "book"
        : (await invoke<boolean>("is_dir", { path: to }).catch(() => false))
          ? "dir"
          : undefined;
  if (!kind) return;

  if (kind === "note") await followNote(from, to);
  else if (kind === "dir") {
    const { moveIssueNotePaths } = await import("@/issue/issueStore");
    await moveIssueNotePaths(from, to);
  }
  if (kind !== "note" && layout === "workspace") {
    await followBooks(initDir, from, to);
  }
  for (const listener of listeners) listener({ from, to });
}

async function followNote(from: string, to: string) {
  const oldTitle = titleOfPath(from);
  const newTitle = titleOfPath(to);
  // the links to the old title still go to another note of that title
  const taken = store
    .getState()
    .notes.values()
    .some((n) => !n.is_dir && n.id !== from && n.title === oldTitle);
  const title = taken ? oldTitle : newTitle;
  if (title !== oldTitle) {
    const { default: updateBacklinks } =
      await import("@/writer/backlinks/updateBacklinks");
    await updateBacklinks(oldTitle, title);
  }
  const { updateIssueNoteLinks } = await import("@/issue/issueStore");
  await updateIssueNoteLinks(from, to, oldTitle, title);
}

/** The books of the workspace follow a book file, or a dir of them. */
async function followBooks(ws: string, from: string, to: string) {
  // the books open write their notes to the new path from now on
  const { useReaderStore, useSideStore } = await import("@/reader/readerStore");
  for (const reader of [useReaderStore, useSideStore]) {
    const path = reader.getState().path;
    const moved = path && movedPath(normalizeSlash(path), from, to);
    if (moved) reader.setState({ path: moved });
  }
  const { followBookFiles } = await import("@/reader/library/library");
  await followBookFiles(ws, from, to);
  const { lastBooks, setLastBook } = store.getState();
  const last = lastBooks[ws];
  const moved = last && movedPath(normalizeSlash(last), from, to);
  if (moved) setLastBook(ws, moved);
}

/**
 * Follow what was renamed or moved while the app did not see it, e.g. while
 * it was closed: the notes as the index found them (same size and modified
 * time), the books by their hash. Once the notes of the workspace are loaded;
 * in the main window only.
 */
export async function followMovedMeanwhile(ws: string) {
  if (bookWindowParams()) return;
  const renames = await invoke<[string, string][]>("index_renames").catch(
    () => [],
  );
  for (const [from, to] of renames ?? []) await followRename(from, to);
  if (store.getState().layout !== "workspace") return;
  const { readLibrary, refreshLibrary } =
    await import("@/reader/library/library");
  const before = await readLibrary(ws);
  const after = await refreshLibrary(ws);
  if (store.getState().initDir !== ws) return;
  for (const [hash, entry] of Object.entries(after.books)) {
    const old = before.books[hash];
    if (old && old.file !== entry.file) {
      await followRename(
        fromWorkspacePath(ws, old.file),
        fromWorkspacePath(ws, entry.file),
      );
    }
  }
}
