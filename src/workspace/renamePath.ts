import { invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import { flushSave } from "./pendingSaves";
import { followRename, titleOfPath } from "./renames";
import { normalizeSlash, renameFile } from "./util";

/** a name of a file: none of the characters some systems do not allow */
export const BAD_NAME = /[\\/:*?"<>|]/;

/** Why the name can not be used, if so: a name only, not a path */
export const invalidName = (name: string): string | undefined => {
  if (!name) return "Enter a name";
  if (BAD_NAME.test(name)) return 'A name can not contain \\ / : * ? " < > |';
  // hidden, never listed; or `.` and `..`
  if (name.startsWith(".")) return "A name can not start with .";
  return undefined;
};

/** The name of a file or dir, and its extension, kept on rename */
export const splitName = (
  path: string,
  keepExt: boolean,
): { name: string; ext: string } => {
  const p = normalizeSlash(path);
  const fileName = p.slice(p.lastIndexOf("/") + 1);
  const dot = fileName.lastIndexOf(".");
  return keepExt && dot > 0
    ? { name: fileName.slice(0, dot), ext: fileName.slice(dot) }
    : { name: fileName, ext: "" };
};

export type RenameOptions = {
  /** kept after the name typed, e.g. `.md` */
  ext?: string;
  /** why the new path can not be used, if so, more than the checks here */
  check?: (to: string) => Promise<string | undefined> | string | undefined;
  /** done right before the rename, e.g. the changes saved */
  before?: () => Promise<void>;
};

/**
 * Rename a file or dir in its dir, never over an existing one; then follow
 * the rename in the app: the links, the issues, the books, the view.
 * @returns the error to show, if not renamed
 */
export async function renamePath(
  from: string,
  newName: string,
  { ext = "", check, before }: RenameOptions = {},
): Promise<string | undefined> {
  const name = newName.trim();
  const invalid = invalidName(name);
  if (invalid) return invalid;
  const src = normalizeSlash(from);
  const to = `${src.slice(0, src.lastIndexOf("/"))}/${name}${ext}`;
  if (to === src) return undefined;
  if (await invoke<boolean>("file_exist", { filePath: to }).catch(() => false))
    return `${name}${ext} already exists`;
  const refused = await check?.(to);
  if (refused) return refused;
  await before?.();
  if (!(await renameFile(src, to))) return "Failed to rename";
  // the watcher follows it too, then nothing is left to do
  await followRename(src, to);
  return undefined;
}

/**
 * A note renamed: its changes saved first; never to the title of another
 * note, the links to the title would go to either.
 */
export const noteRenameOptions = (noteId: string): RenameOptions => ({
  check: (to) => {
    const title = titleOfPath(to);
    const taken = store
      .getState()
      .notes.values()
      .some((n) => !n.is_dir && n.id !== noteId && n.title === title);
    return taken ? `A note titled ${title} already exists` : undefined;
  },
  before: () => flushSave(noteId),
});

/** A dir renamed: the changes of its notes saved first, they move with it. */
export const dirRenameOptions: RenameOptions = { before: () => flushSave() };
