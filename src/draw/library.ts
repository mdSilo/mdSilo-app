import { invoke } from "@tauri-apps/api/core";
import type { LibraryPersistenceAdapter } from "@excalidraw/excalidraw/data/library";
import type { LibraryItems } from "@excalidraw/excalidraw/types";
import { store } from "@/state/store";
import { dataDirOf } from "@/workspace/layout";
import { createDirRecursive, joinPath } from "@/workspace/util";

/**
 * The shape library of the drawings (Excalidraw's *Library*): one for the
 * workspace, `.mdsilo/drawing-library.excalidrawlib`, synced with it. The
 * file is as excalidraw.com saves a library, so one can be shared both ways.
 */

export const LIBRARY_FILE = "drawing-library.excalidrawlib";

/** The library of the workspace open, if any */
export function libraryPath(ws = store.getState().initDir): string | undefined {
  return ws ? joinPath(dataDirOf(ws), LIBRARY_FILE) : undefined;
}

/** A library file: version 2 has `libraryItems`, version 1 `library` */
type LibraryFile = { libraryItems?: unknown; library?: unknown };

/**
 * Where Excalidraw loads the library from and saves it to.
 * @param serialize Excalidraw's serializeLibraryAsJSON, loaded with it
 */
export function libraryAdapter(
  serialize: (items: LibraryItems) => string,
  ws = store.getState().initDir,
): LibraryPersistenceAdapter {
  return {
    async load() {
      const path = libraryPath(ws);
      if (!path) return null;
      const exists = await invoke<boolean>("file_exist", {
        filePath: path,
      }).catch(() => false);
      if (!exists) return null;
      const text = await invoke<string>("read_file", { filePath: path });
      const data = (text.trim() ? JSON.parse(text) : {}) as LibraryFile;
      const items = data.libraryItems ?? data.library;
      return Array.isArray(items)
        ? { libraryItems: items as LibraryItems }
        : null;
    },
    async save({ libraryItems }) {
      const path = libraryPath(ws);
      if (!path || !ws) return;
      await createDirRecursive(dataDirOf(ws));
      await invoke("write_file", {
        filePath: path,
        text: `${serialize(libraryItems)}\n`,
      });
    },
  };
}
