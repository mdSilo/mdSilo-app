import { invoke } from '@tauri-apps/api/core';
import { store } from '@/state/store';
import type { ViewAction } from '@/state/viewReducer';
import { indexOf } from '@/lib/linkIndex';
import { noteContent } from '@/lib/contentCache';
import { openFilePath } from '@/workspace/open';
import { fromWorkspacePath, isAbsolutePath, toWorkspacePath } from '@/workspace/util';
import { isBookFile } from '@/reader/document';
import type { PluginMethods } from './host';

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
  if (!dir) throw new Error('No workspace is open');
  return dir;
};

const asObject = (params: unknown): Record<string, unknown> =>
  (typeof params === 'object' && params !== null ? params as Record<string, unknown> : {});

/** The absolute path of a path in the workspace, given by a plugin */
function pathIn(dir: string, path: unknown): string {
  if (typeof path !== 'string' || !path) throw new Error('A path in the workspace is wanted');
  const parts = path.replace(/\\/g, '/').split('/');
  if (isAbsolutePath(path) || path.includes(':') || parts.includes('..')) throw new Error(`Not a path in the workspace: ${path}`);
  return fromWorkspacePath(dir, parts.filter((p) => p && p !== '.').join('/'));
}

/** The note at the path, if the app knows it */
function noteAt(params: unknown) {
  const dir = workspace();
  const id = pathIn(dir, asObject(params).path);
  const note = store.getState().notes.get(id);
  if (!note || note.is_dir) throw new Error(`No note at ${String(asObject(params).path)}`);
  return note;
}

export function listNotes(params: unknown): NoteInfo[] {
  const dir = workspace();
  const { tag, folder } = asObject(params);
  const { notes } = store.getState();
  const index = indexOf(notes);
  const prefix = typeof folder === 'string' && folder ? `${pathIn(dir, folder)}/` : '';
  const infos: NoteInfo[] = [];
  for (const note of notes.values()) {
    if (note.is_dir || (prefix && !note.id.startsWith(prefix))) continue;
    const tags = index.tags(note.id);
    if (typeof tag === 'string' && tag && !tags.includes(tag)) continue;
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

export const readNote = async (params: unknown) => noteContent(noteAt(params).id);

export async function writeNote(params: unknown) {
  const note = noteAt(params);
  const { text } = asObject(params);
  if (typeof text !== 'string') throw new Error('notes.write wants { path, text }');
  const done = await invoke<boolean>('write_file', { filePath: note.file_path, text });
  if (!done) throw new Error(`Could not write ${toWorkspacePath(workspace(), note.id)}`);
  store.getState().updateNote({ id: note.id, content: text });
  return true;
}

/**
 * Opens a note, a book or an issue in the app, leaving the view of the
 * plugin: `{ note: path }`, `{ book: path }` or `{ issue: number }`.
 */
export async function openInApp(params: unknown, dispatch: (action: ViewAction) => void) {
  const { note, book, issue } = asObject(params);
  if (typeof issue === 'number' && Number.isInteger(issue) && issue > 0) {
    dispatch({ view: 'issue', number: issue });
    return true;
  }
  if (book !== undefined) {
    const path = pathIn(workspace(), book);
    if (!isBookFile(path)) throw new Error(`Not a book: ${String(book)}`);
    dispatch({ view: 'book', path });
    return true;
  }
  if (note !== undefined) {
    const known = noteAt({ path: note });
    const opened = await openFilePath(known.id, true);
    if (!opened) throw new Error(`No note at ${String(note)}`);
    dispatch({ view: 'md', params: { noteId: opened.id } });
    return true;
  }
  throw new Error('app.open wants { note }, { book } or { issue }');
}

/** The methods of the workspace, for the views of plugins */
export const workspaceMethods = (dispatch: (action: ViewAction) => void): PluginMethods => ({
  'notes.list': { permission: 'notes:read', handler: listNotes },
  'notes.read': { permission: 'notes:read', handler: readNote },
  'notes.write': { permission: 'notes:write', handler: writeNote },
  'app.open': { handler: (params) => openInApp(params, dispatch) },
});
