import type { BookPlace, PluginContext } from "@mdsilo/plugin-api";
import type { ViewState } from "@/state/viewReducer";
import { isAbsolutePath, toWorkspacePath } from "@/workspace/util";
import { titleOfFile } from "@/reader/library/library";
import { activeStore } from "@/reader/readerStore";
import { readLinkOf, repoFileUrl } from "@/reader/library/sharedBook";
import { isSyncAvailable, syncInfo } from "@/sync/api";
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

/** the git remote of each workspace, asked again after a while */
const REMOTE_TTL = 5 * 60_000;
const remotes = new Map<
  string,
  { at: number; remote: Promise<{ url: string; branch: string } | undefined> }
>();

/** For tests: the remotes asked again */
export const forgetRemotes = () => remotes.clear();

function remoteOf(ws: string) {
  const known = remotes.get(ws);
  if (known && Date.now() - known.at < REMOTE_TTL) return known.remote;
  const remote = syncInfo(ws).then(
    (info) =>
      info.remoteUrl && info.branch
        ? { url: info.remoteUrl, branch: info.branch }
        : undefined,
    () => undefined,
  );
  remotes.set(ws, { at: Date.now(), remote });
  return remote;
}

/**
 * Where a book synced with the workspace is on the web: the file in the git
 * repo (GitHub, GitLab, Gitea) and the link to read it at `cfi` in the web
 * app. Only if the repo is public do they work for others.
 */
async function bookOnWeb(
  ws: string,
  file: string,
  cfi?: string,
): Promise<{ url?: string; readUrl?: string }> {
  if (!isSyncAvailable) return {};
  const remote = await remoteOf(ws);
  const url = remote && repoFileUrl(remote.url, remote.branch, file);
  return url ? { url, readUrl: readLinkOf(url, cfi) } : {};
}

/**
 * The book open in the reader (of the pane in use); `cfi` the text
 * selected, else the page shown. None if no book is open.
 */
export async function openBookPlace(
  cfi?: string,
): Promise<BookPlace | undefined> {
  const { path, ws, entry, location } = activeStore().getState();
  if (!path) return undefined;
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
  // in the repo, if synced with it
  if (ws && entry?.synced)
    Object.assign(book, await bookOnWeb(ws, entry.file, at));
  return book;
}

/** The book open, as the plugin may see it (`books:read`) */
export async function bookContext(
  plugin: InstalledPlugin,
  cfi?: string,
): Promise<PluginContext> {
  if (!may(plugin, "books:read")) return {};
  const book = await openBookPlace(cfi);
  return book ? { book } : {};
}

/** What is open in the view shown: its note or its book */
export async function viewContext(
  plugin: InstalledPlugin,
  view: ViewState | undefined,
): Promise<PluginContext> {
  if (view?.view === "md") return noteContext(plugin, view.params?.noteId);
  if (view?.view === "book") return bookContext(plugin);
  return {};
}
