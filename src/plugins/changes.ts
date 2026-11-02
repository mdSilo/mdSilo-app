import { useEffect } from "react";
import { store, type NoteMap } from "@/state/store";
import { isAbsolutePath, isTauri, toWorkspacePath } from "@/workspace/util";
import { checkFileIsMd } from "@/workspace/process";
import type { Note } from "@/types/model";
import type { PluginHost } from "./host";

// What a view of a plugin is told of the workspace changing: the notes
// (`notes.changed`, edited in the app, by another app or a sync, made,
// deleted) and the files (`files.changed`, as the watcher sees them).

const NOTES_DEBOUNCE_MS = 500;

export type Changes = { paths: string[]; event: string };

/** Listens to the changes of files seen by the watcher of the workspace. */
export function listenChanges(
  onChanges: (changes: Changes) => void,
): () => void {
  if (!isTauri) return () => {};
  let unlisten: (() => void) | undefined;
  let gone = false;
  import("@tauri-apps/api/window")
    .then(({ getCurrentWindow }) =>
      getCurrentWindow().listen<Changes>("changes", ({ payload }) =>
        onChanges(payload),
      ),
    )
    .then((fn) => {
      if (gone) fn();
      else unlisten = fn;
    })
    .catch((e) => console.error("Error on watching files for a plugin:", e));
  return () => {
    gone = true;
    unlisten?.();
  };
}

const isNote = (note: Note | undefined): note is Note =>
  Boolean(note && !note.is_dir && checkFileIsMd(note.file_path));

/** Not loaded yet: its content read later is no change */
const unloaded = (note: Note) => Boolean(note.parsed) && !note.content;

/** The ids of the notes made, deleted, renamed or edited from one map to the other. */
export function changedNotes(before: NoteMap, after: NoteMap): string[] {
  const ids: string[] = [];
  for (const note of after.values()) {
    if (!isNote(note)) continue;
    const old = before.get(note.id);
    if (
      !old ||
      (old !== note &&
        !unloaded(old) &&
        (old.content !== note.content || old.title !== note.title))
    )
      ids.push(note.id);
  }
  for (const old of before.values())
    if (isNote(old) && !after.has(old.id)) ids.push(old.id);
  return ids;
}

/** Hidden files and folders (`.mdsilo/`, `.git/`) are not told */
const isHidden = (path: string) =>
  path.split("/").some((part) => part.startsWith("."));

/**
 * Tells a view of a plugin of the notes changed, `{ paths }` relative to the
 * workspace, once the changes pause; and of the files changed on the disk,
 * `{ paths, event }`.
 */
export function useWorkspaceChanged(host: { current: PluginHost | null }) {
  useEffect(() => {
    let changed = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      timer = undefined;
      const dir = store.getState().initDir;
      if (!dir || !changed.size) return;
      const paths = [...changed].map((id) => toWorkspacePath(dir, id));
      changed = new Set();
      host.current?.emit("notes.changed", { paths });
    };
    const unsubscribe = store.subscribe((state, prev) => {
      if (state.notes === prev.notes) return;
      for (const id of changedNotes(prev.notes, state.notes)) changed.add(id);
      if (changed.size && !timer) timer = setTimeout(flush, NOTES_DEBOUNCE_MS);
    });
    const unlisten = listenChanges(({ paths, event }) => {
      const dir = store.getState().initDir;
      if (!dir) return;
      const inside = paths
        .map((p) => toWorkspacePath(dir, p))
        .filter((p) => p && !isAbsolutePath(p) && !isHidden(p));
      if (inside.length)
        host.current?.emit("files.changed", { paths: inside, event });
    });
    return () => {
      unsubscribe();
      unlisten();
      if (timer) clearTimeout(timer);
    };
  }, [host]);
}
