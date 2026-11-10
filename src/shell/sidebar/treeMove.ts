import { invoke } from "@tauri-apps/api/core";
import { joinPath, normalizeSlash, renameFile } from "@/workspace/util";
import { flushSave } from "@/workspace/pendingSaves";
import { t } from "@/i18n";

/** Parent dir of the path, by the path only. */
export const parentOf = (path: string): string => {
  const p = normalizeSlash(path);
  const i = p.lastIndexOf("/");
  return i <= 0 ? "/" : p.slice(0, i);
};

/**
 * If the file or dir can be moved into the dir: not into itself or a dir
 * under it, and not where it is already.
 */
export const canMoveTo = (srcPath: string, tarDir: string): boolean => {
  const src = normalizeSlash(srcPath);
  const tar = normalizeSlash(tarDir);
  return tar !== src && !tar.startsWith(`${src}/`) && parentOf(src) !== tar;
};

/**
 * Move the file or dir into the dir on disk, never over an existing one.
 * The watcher syncs the store, as on rename.
 * @returns the new path, if moved
 */
export const moveIntoDir = async (
  srcPath: string,
  tarDir: string,
): Promise<string | undefined> => {
  if (!canMoveTo(srcPath, tarDir)) return;
  const src = normalizeSlash(srcPath);
  const name = src.slice(src.lastIndexOf("/") + 1);
  const tarPath = joinPath(normalizeSlash(tarDir), name);
  if (await invoke<boolean>("file_exist", { filePath: tarPath })) {
    await invoke("msg_dialog", {
      title: t("Move"),
      msg: `${name} already exists in ${tarDir}`,
    });
    return;
  }
  // move the notes with all their changes
  await flushSave();
  return (await renameFile(src, tarPath)) ? tarPath : undefined;
};
