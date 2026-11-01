import { invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import type { ViewAction } from "@/state/viewReducer";
import { indexOf } from "@/lib/linkIndex";
import { linkTitlesOf } from "@/lib/mdlink";
import { noteContent } from "@/lib/contentCache";
import { openFilePath } from "@/workspace/open";
import {
  fromWorkspacePath,
  isAbsolutePath,
  toWorkspacePath,
} from "@/workspace/util";
import { isBookFile } from "@/reader/document";
import { loadBooks } from "@/reader/library/books";
import { useIssueStore } from "@/issue/issueStore";
import type { PluginMethods } from "./host";

/**
 * What a view of a plugin can see of the workspace. Paths are relative to
 * the workspace, and only the notes the app knows can be read or written:
 * not the data of the app (`.mdsilo/`), nor any other file.
 */
export type NoteInfo = {
  path: string;
  title: string;
  created: string;
  updated: string;
  tags: string[];
  /** the titles of the notes it links to */
  links: string[];
};

const workspace = () => {
  const dir = store.getState().initDir;
  if (!dir) throw new Error("No workspace is open");
  return dir;
};

const asObject = (params: unknown): Record<string, unknown> =>
  typeof params === "object" && params !== null
    ? (params as Record<string, unknown>)
    : {};

/** The absolute path of a path in the workspace, given by a plugin */
function pathIn(dir: string, path: unknown): string {
  if (typeof path !== "string" || !path)
    throw new Error("A path in the workspace is wanted");
  const parts = path.replace(/\\/g, "/").split("/");
  if (isAbsolutePath(path) || path.includes(":") || parts.includes(".."))
    throw new Error(`Not a path in the workspace: ${path}`);
  return fromWorkspacePath(dir, parts.filter((p) => p && p !== ".").join("/"));
}

/** The note at the path, if the app knows it */
function noteAt(params: unknown) {
  const dir = workspace();
  const id = pathIn(dir, asObject(params).path);
  const note = store.getState().notes.get(id);
  if (!note || note.is_dir)
    throw new Error(`No note at ${String(asObject(params).path)}`);
  return note;
}

export function listNotes(params: unknown): NoteInfo[] {
  const dir = workspace();
  const { tag, folder } = asObject(params);
  const { notes } = store.getState();
  const index = indexOf(notes);
  const prefix =
    typeof folder === "string" && folder ? `${pathIn(dir, folder)}/` : "";
  const infos: NoteInfo[] = [];
  for (const note of notes.values()) {
    if (note.is_dir || (prefix && !note.id.startsWith(prefix))) continue;
    const tags = index.tags(note.id);
    if (typeof tag === "string" && tag && !tags.includes(tag)) continue;
    infos.push({
      path: toWorkspacePath(dir, note.id),
      title: note.title,
      created: note.created_at,
      updated: note.updated_at,
      tags,
      links: index.rawLinks(note.id),
    });
  }
  return infos;
}

export const readNote = async (params: unknown) =>
  noteContent(noteAt(params).id);

export async function writeNote(params: unknown) {
  const note = noteAt(params);
  const { text } = asObject(params);
  if (typeof text !== "string")
    throw new Error("notes.write wants { path, text }");
  const done = await invoke<boolean>("write_file", {
    filePath: note.file_path,
    text,
  });
  if (!done)
    throw new Error(`Could not write ${toWorkspacePath(workspace(), note.id)}`);
  store.getState().updateNote({ id: note.id, content: text });
  return true;
}

/** The notes linking to the note at the path, by any title a link to it may have */
export function backlinks(params: unknown): string[] {
  const dir = workspace();
  const note = noteAt(params);
  const index = indexOf(store.getState().notes);
  const linking = index.linking(
    linkTitlesOf(note.title, (t) => index.hasTitle(t)),
  );
  linking.delete(note.id);
  return [...linking].map((id) => toWorkspacePath(dir, id));
}

export type BookInfo = {
  /** the book file, relative to the workspace */
  path: string;
  title: string;
  author: string;
  format: string;
  added: string;
  group?: string;
  status?: string;
  language?: string[];
  subjects?: string[];
};

export async function listBooks(): Promise<BookInfo[]> {
  workspace();
  const books = await loadBooks();
  return Object.values(books).map((book) => ({
    path: book.file,
    title: book.title,
    author: book.author,
    format: book.format,
    added: book.addedAt,
    group: book.group,
    status: book.status,
    language: book.language,
    subjects: book.subjects,
  }));
}

export type IssueInfo = {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  /** the names of its labels */
  labels: string[];
  milestone?: string;
  due?: string;
  created: string;
  updated: string;
  closed?: string;
  /** the notes linked, relative to the workspace */
  notes: string[];
};

export async function listIssues(): Promise<IssueInfo[]> {
  const dir = workspace();
  await useIssueStore.getState().load(dir);
  const { issues, labels, milestones } = useIssueStore.getState().data;
  const labelName = new Map(labels.map((l) => [l.id, l.name]));
  const milestoneTitle = new Map(milestones.map((m) => [m.id, m.title]));
  return issues.map((issue) => ({
    number: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    labels: issue.labels.map((id) => labelName.get(id) ?? id),
    milestone: issue.milestone
      ? milestoneTitle.get(issue.milestone)
      : undefined,
    due: issue.dueOn,
    created: issue.createdAt,
    updated: issue.updatedAt,
    closed: issue.closedAt,
    notes: issue.notes.map((path) => toWorkspacePath(dir, path)),
  }));
}

/**
 * Opens a note, a book or an issue in the app, leaving the view of the
 * plugin: `{ note: path }`, `{ book: path }` or `{ issue: number }`.
 */
export async function openInApp(
  params: unknown,
  dispatch: (action: ViewAction) => void,
) {
  const { note, book, issue } = asObject(params);
  if (typeof issue === "number" && Number.isInteger(issue) && issue > 0) {
    dispatch({ view: "issue", number: issue });
    return true;
  }
  if (book !== undefined) {
    const path = pathIn(workspace(), book);
    if (!isBookFile(path)) throw new Error(`Not a book: ${String(book)}`);
    dispatch({ view: "book", path });
    return true;
  }
  if (note !== undefined) {
    const known = noteAt({ path: note });
    const opened = await openFilePath(known.id, true);
    if (!opened) throw new Error(`No note at ${String(note)}`);
    dispatch({ view: "md", params: { noteId: opened.id } });
    return true;
  }
  throw new Error("app.open wants { note }, { book } or { issue }");
}

/** The methods of the workspace, for the views of plugins */
export const workspaceMethods = (
  dispatch: (action: ViewAction) => void,
): PluginMethods => ({
  "notes.list": { permission: "notes:read", handler: listNotes },
  "notes.read": { permission: "notes:read", handler: readNote },
  "notes.write": { permission: "notes:write", handler: writeNote },
  "notes.backlinks": { permission: "notes:read", handler: backlinks },
  "books.list": { permission: "books:read", handler: listBooks },
  "issues.list": { permission: "issues:read", handler: listIssues },
  "app.open": { handler: (params) => openInApp(params, dispatch) },
});
