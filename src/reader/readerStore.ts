import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { store } from 'lib/store';
import { flushSave } from 'file/pendingSaves';
import { openFilePaths } from 'file/open';
import { toWorkspacePath } from 'file/util';
import {
  annotationsPathOf, parseAnnotations, serializeAnnotations, sortNotes,
  type BookHeader, type BookNote,
} from './annotations';
import {
  formatContributors, formatLanguageMap, openBook, type BookDoc, type BookFormat,
} from './document';
import {
  readBookState, readLibrary, saveBookEntry, titleOfFile, writeBookState, type BookEntry,
} from './library';

export type ReaderLocation = {
  cfi: string;
  /** 0 to 1, of the book */
  fraction: number;
  /** the label of the chapter */
  tocLabel?: string;
  /** the page of the printed book, if it has a page list */
  pageLabel?: string;
};

type ReaderStore = {
  /** the book file read */
  path?: string;
  /** the workspace of the book */
  ws?: string;
  hash?: string;
  entry?: BookEntry;
  book?: BookDoc;
  format?: BookFormat;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error?: string;
  /** where to open the book: the place last read, or of a link */
  initialCfi?: string;
  location?: ReaderLocation;
  notes: BookNote[];
  open: (path: string, cfi?: string) => Promise<void>;
  close: () => Promise<void>;
  setLocation: (location: ReaderLocation) => void;
  addNote: (note: BookNote) => void;
  updateNote: (id: string, patch: Partial<BookNote>) => void;
  removeNote: (id: string) => void;
  /** write the pending changes now */
  flush: () => Promise<void>;
};

export const SAVE_DELAY_MS = 500;
export const STATE_DELAY_MS = 1000;

let notesTimer: ReturnType<typeof setTimeout> | undefined;
let stateTimer: ReturnType<typeof setTimeout> | undefined;
let notesDirty = false;
let stateDirty = false;
let openSeq = 0;
// compare of CFIs, loaded with the book
let compareCfi: ((a: string, b: string) => number) | undefined;

const nameOf = (path: string) => path.split(/[\\/]/).pop() ?? path;

/** Read a book file as a File, binary. */
export async function readBookFile(path: string): Promise<File> {
  const data = await invoke<ArrayBuffer | Uint8Array | number[]>('read_file_bytes', { filePath: path });
  const bytes = data instanceof ArrayBuffer || ArrayBuffer.isView(data) ? data : new Uint8Array(data);
  return new File([bytes as BlobPart], nameOf(path));
}

async function writeNotes(path: string, header: BookHeader, notes: BookNote[]) {
  const mdPath = annotationsPathOf(path);
  const sorted = compareCfi ? sortNotes(notes, compareCfi) : notes;
  const content = serializeAnnotations({ header, notes: sorted });
  await flushSave(mdPath);
  await invoke('write_file', { filePath: mdPath, text: content });
  // a note like the others: search, backlinks, graph
  const existing = store.getState().notes.get(mdPath);
  if (existing) {
    store.getState().updateNote({ id: mdPath, content });
  } else {
    await openFilePaths([mdPath]);
  }
}

export const useReaderStore = create<ReaderStore>((set, get) => ({
  status: 'idle',
  notes: [],

  open: async (path, cfi) => {
    const current = get();
    if (current.path === path && current.status !== 'error') {
      // the same book, maybe to another place
      if (cfi) set({ initialCfi: cfi });
      return;
    }
    await get().close();
    const seq = ++openSeq;
    const ws = store.getState().initDir;
    set({ path, ws, status: 'loading', error: undefined, initialCfi: cfi, notes: [], location: undefined });
    try {
      const [file, hash] = await Promise.all([
        readBookFile(path),
        invoke<string>('book_hash', { filePath: path }),
      ]);
      const { book, format } = await openBook(file);
      const CFI = await import('foliate-js/epubcfi.js');
      compareCfi = CFI.compare;
      const mdPath = annotationsPathOf(path);
      await flushSave(mdPath);
      const mdText = await invoke<string>('read_file', { filePath: mdPath }).catch(() => '');
      const notes = mdText ? parseAnnotations(mdText).notes : [];
      let entry: BookEntry | undefined;
      let initialCfi = cfi;
      if (ws && hash) {
        const lib = await readLibrary(ws);
        entry = {
          ...(lib.books[hash] ?? { addedAt: new Date().toISOString() }),
          hash,
          file: toWorkspacePath(ws, path),
          title: formatLanguageMap(book.metadata?.title) || titleOfFile(path),
          author: formatContributors(book.metadata?.author),
          format,
        };
        await saveBookEntry(ws, entry);
        if (!initialCfi) initialCfi = (await readBookState(ws, hash))?.location;
      }
      if (seq !== openSeq) {
        await book.destroy?.();
        return;
      }
      set({ hash, entry, book, format, notes, initialCfi, status: 'ready' });
    } catch (e) {
      if (seq !== openSeq) return;
      console.error(`Failed to open the book ${path}`, e);
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },

  close: async () => {
    openSeq += 1;
    await get().flush();
    const { book } = get();
    set({
      path: undefined, ws: undefined, hash: undefined, entry: undefined, book: undefined,
      format: undefined, status: 'idle', error: undefined, initialCfi: undefined,
      location: undefined, notes: [],
    });
    try {
      await book?.destroy?.();
    } catch (e) {
      console.error('Failed to close the book', e);
    }
  },

  setLocation: (location) => {
    set({ location });
    if (!get().ws || !get().hash) return;
    stateDirty = true;
    if (stateTimer) clearTimeout(stateTimer);
    stateTimer = setTimeout(() => { void saveState(); }, STATE_DELAY_MS);
  },

  addNote: (note) => {
    set({ notes: [...get().notes, note] });
    scheduleNotes();
  },

  updateNote: (id, patch) => {
    const now = new Date().toISOString();
    set({ notes: get().notes.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: now } : n)) });
    scheduleNotes();
  },

  removeNote: (id) => {
    set({ notes: get().notes.filter((n) => n.id !== id) });
    scheduleNotes();
  },

  flush: async () => {
    await Promise.all([saveNotes(), saveState()]);
  },
}));

function scheduleNotes() {
  notesDirty = true;
  if (notesTimer) clearTimeout(notesTimer);
  notesTimer = setTimeout(() => { void saveNotes(); }, SAVE_DELAY_MS);
}

async function saveNotes() {
  if (notesTimer) clearTimeout(notesTimer);
  notesTimer = undefined;
  if (!notesDirty) return;
  notesDirty = false;
  const { path, hash, entry, notes } = useReaderStore.getState();
  if (!path || !hash) return;
  const header: BookHeader = {
    hash,
    title: entry?.title || titleOfFile(path),
    ...(entry?.author ? { author: entry.author } : {}),
    file: nameOf(path),
  };
  try {
    await writeNotes(path, header, notes);
  } catch (e) {
    console.error('Failed to save the annotations', e);
  }
}

async function saveState() {
  if (stateTimer) clearTimeout(stateTimer);
  stateTimer = undefined;
  if (!stateDirty) return;
  stateDirty = false;
  const { ws, hash, location } = useReaderStore.getState();
  if (!ws || !hash || !location) return;
  try {
    await writeBookState(ws, hash, {
      location: location.cfi,
      fraction: location.fraction,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Failed to save the reading state', e);
  }
}

/** Reset module state; for tests. */
export function resetReaderStore() {
  if (notesTimer) clearTimeout(notesTimer);
  if (stateTimer) clearTimeout(stateTimer);
  notesTimer = stateTimer = undefined;
  notesDirty = stateDirty = false;
  openSeq += 1;
  compareCfi = undefined;
  useReaderStore.setState({
    path: undefined, ws: undefined, hash: undefined, entry: undefined, book: undefined,
    format: undefined, status: 'idle', error: undefined, initialCfi: undefined,
    location: undefined, notes: [],
  });
}
