/* eslint-disable @typescript-eslint/no-explicit-any */
import { v4 as uuidv4 } from 'uuid';
import { Note } from 'types/model';
import { store, NotesData, Notes, NoteTreeItem, TitleTreeItem } from 'lib/store';
import serialize from 'editor/serialization/serialize';
import { purgeUnLinkedWikiNotes } from 'editor/backlinks/useBacklinks';
import { ciStringEqual } from 'utils/helper';


export const isTauri = Boolean(
	typeof window !== 'undefined' 
  && window !== undefined 
  && (window as any).__TAURI__ !== undefined 
  && (window as any).promisified !== null
);

/**
 * Normalize slashes of a file path
 * @param {string} path
 * @returns {string}
 */
export const normalizeSlash = (path: string): string => {
  if (path === '\\' || path === '/') {
    return '/';
  }

  path = path.replace(/\\/g, '/');

  if (path.length === 2 && /.:/.test(path)) {
    return path + '/';
  }

  if (path.endsWith('/') && !(path.length === 3 && /.:\//.test(path))) { 
    return path.slice(0, path.length - 1);
  }
  
  return path;
};

/**
 * Join multiple path parts into a string.
 * @param {string[]} ...args paths
 * @returns {string}
 */
export const joinPath = (...args: string[]): string => {
  if (args.length === 0) {
    return '.';
  }

  let joined = '';

  for (const arg of args) {
    if (arg.length > 0) {
      if (!joined) {
        joined = trimSlash(arg, 'end');
      } else {
        if (!(joined.endsWith('/') || joined.endsWith('\\'))) {
          joined += '/';
          joined += trimSlashAll(arg);
        } 
      }
    }
  }

  return joined || '.';
};

/**
 * Get dirname of the file path
 * @param {string} path path to be evaluated
 * @returns {any} result of the evaluated path( / end or '.')
 */
export const getDirname = (path: string): string => {
	if (path.length === 0) {
    return '.';
  }

	let code = path.charCodeAt(0);
	const hasRoot = code === 47 || code === 92; // 47 - / slash, 92- \ backslash
	let end = -1;
	let matchedSlash = true;
	for (let i = path.length - 1; i >= 1; --i) {
		code = path.charCodeAt(i);
		if (code === 47 || code === 92) {
			if (!matchedSlash) {
				end = i;
				break;
			}
		} else {
			// We saw the first non-path separator
			matchedSlash = false;
		}
	}
	if (end === -1) return hasRoot ? '/' : '.';
	if (hasRoot && end === 1) return '//';
	const result = path.slice(0, end);
	if (!(result.endsWith('/') || result.endsWith('\\'))) {
    return result + '/';
  } else {
    return result;
  }
};


export function trimSlash(txt: string, mode = 'start') {
  if (mode === 'start') {
    while (txt.startsWith('/')) {
      txt = txt.substring(0);
    }
    return txt;
  } else {
    while (txt.endsWith('/') && !(txt.length === 3 && /.:\//.test(txt))) {
      txt = txt.substring(0, txt.length - 1);
    }
    return txt;
  }
}

function trimSlashAll(txt: string) {
  const txt0 = trimSlash(txt);
  const txt1 = trimSlash(txt0, 'end');
  return txt1;
}


/* some helper to process note */
// 

export const getSerializedNote = (note: Note) =>
  note.content.map((n) => serialize(n)).join('');

export const buildNotesJson = (withTitleTree = false) => {
  purgeUnLinkedWikiNotes();
  const notesObj = store.getState().notes;
  const noteTree = store.getState().noteTree;
  const wikiTree = store.getState().wikiTree;
  const titleTree = withTitleTree ? buildTitleTree(noteTree, notesObj) : [];
  const notesData: NotesData = {notesObj, noteTree, wikiTree, titleTree};
  const notesJson = JSON.stringify(notesData);
  return notesJson;
}

/**
 * map noteTree to titleTree
 * @param noteTree 
 * @param notes 
 * @returns titleTree
 */
const buildTitleTree = (noteTree: NoteTreeItem[], notes: Notes): TitleTreeItem[] => {
  const titleTree = noteTree.map((item) => {
    const title = notes[item.id].title;
    const children: TitleTreeItem[] = buildTitleTree(item.children, notes);
    const titleItem: TitleTreeItem = {title, children};
    return titleItem;
  });
  return titleTree;
};

/**
 * map titleTree to noteTree
 * @param titleTree 
 * @param notes 
 * @returns noteTree
 */
export const buildNoteTree = (titleTree: TitleTreeItem[], notes: Notes): NoteTreeItem[] => {
  const noteTree = titleTree.map((item) => {
    const note = Object.values(notes).find((n) => ciStringEqual(n.title, item.title));
    const id = note?.id || uuidv4();
    const children: NoteTreeItem[] = buildNoteTree(item.children, notes);
    const treeItem: NoteTreeItem = {id, children, collapsed: false};
    return treeItem;
  });
  return noteTree;
};

// to be del
export const getNoteAsBlob = (note: Note) => {
  const serializedContent = getSerializedNote(note);
  const blob = new Blob([serializedContent], {
    type: 'text/markdown;charset=utf-8',
  });
  return blob;
};
