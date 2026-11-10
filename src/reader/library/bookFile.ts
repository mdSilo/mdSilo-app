import { invoke } from "@tauri-apps/api/core";
import type { RenameOptions } from "@/workspace/renamePath";
import { followRename } from "@/workspace/renames";
import { joinPath, normalizeSlash } from "@/workspace/util";
import { canMoveTo, moveIntoDir } from "@/shell/sidebar/treeMove";
import { t } from "@/i18n";
import { useReaderStore, useSideStore } from "../readerStore";
import { annotationsPathOf } from "../annotations/annotations";

/**
 * A book renamed: its notes (`Foo.epub.md`) are renamed with it, never over
 * other notes; the notes of the book open are written first.
 */
export const bookRenameOptions = (bookPath: string): RenameOptions => ({
  check: async (to) => {
    const notes = annotationsPathOf(to);
    const exists = await invoke<boolean>("file_exist", {
      filePath: notes,
    }).catch(() => false);
    return exists
      ? `${notes.slice(notes.lastIndexOf("/") + 1)} already exists`
      : undefined;
  },
  before: async () => {
    for (const reader of [useReaderStore, useSideStore]) {
      if (reader.getState().path === bookPath) await reader.getState().flush();
    }
  },
});

/**
 * Move a book into the dir, its notes with it: never over another book or
 * other notes; then followed as a rename (its notes, its library entry, the
 * book open).
 * @returns the new path, if moved
 */
export async function moveBook(
  bookPath: string,
  tarDir: string,
): Promise<string | undefined> {
  const src = normalizeSlash(bookPath);
  if (!canMoveTo(src, tarDir)) return;
  const to = joinPath(
    normalizeSlash(tarDir),
    src.slice(src.lastIndexOf("/") + 1),
  );
  const refused = await bookRenameOptions(src).check?.(to);
  if (refused) {
    await invoke("msg_dialog", { title: t("Move"), msg: refused });
    return;
  }
  await bookRenameOptions(src).before?.();
  const moved = await moveIntoDir(src, tarDir);
  if (moved) await followRename(src, moved);
  return moved;
}
