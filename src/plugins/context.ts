import type { BookPlace, PluginContext } from "@mdsilo/plugin-api";
import type { ViewState } from "@/state/viewReducer";
import { isAbsolutePath, toWorkspacePath } from "@/workspace/util";
import { titleOfFile } from "@/reader/library/library";
import { activeStore } from "@/reader/readerStore";
import type { Permission } from "./manifest";
import { grantedPermissions, type InstalledPlugin } from "./registry";
import { noteInfo } from "./workspaceApi";

/**
 * What is open in the app, given to a plugin with what it is asked (the text
 * selected, a command): the note if it may read notes, the book if it may
 * read books. A trusted plugin may do all.
 */
const may = (plugin: InstalledPlugin, permission: Permission) =>
  plugin.manifest?.mode === "trusted" ||
  grantedPermissions(plugin).includes(permission);

/** The note, by its id, as the plugin may see it */
export function noteContext(
  plugin: InstalledPlugin,
  noteId: string | undefined,
): PluginContext {
  if (!noteId || !may(plugin, "notes:read")) return {};
  const note = noteInfo(noteId);
  return note ? { note } : {};
}

/**
 * The book open in the reader (of the pane in use), as the plugin may see
 * it; `cfi` the text selected, else the page shown.
 */
export function bookContext(
  plugin: InstalledPlugin,
  cfi?: string,
): PluginContext {
  if (!may(plugin, "books:read")) return {};
  const { path, ws, entry, location } = activeStore().getState();
  if (!path) return {};
  const relative = ws ? toWorkspacePath(ws, path) : path;
  const book: BookPlace = {
    // a book out of the workspace by its file name, not where it is
    path:
      entry?.file ??
      (isAbsolutePath(relative)
        ? (relative.split(/[\\/]/).pop() ?? "")
        : relative),
    title: entry?.title || titleOfFile(path),
    author: entry?.author ?? "",
  };
  if (location?.tocLabel) book.chapter = location.tocLabel;
  const at = cfi ?? location?.cfi;
  if (at) book.cfi = at;
  return { book };
}

/** What is open in the view shown: its note or its book */
export function viewContext(
  plugin: InstalledPlugin,
  view: ViewState | undefined,
): PluginContext {
  if (view?.view === "md") return noteContext(plugin, view.params?.noteId);
  if (view?.view === "book") return bookContext(plugin);
  return {};
}
