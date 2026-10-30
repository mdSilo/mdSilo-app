import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { store } from '@/state/store';
import { getStrDate } from '@/lib/helper';
import { flushSave } from '@/workspace/pendingSaves';
import { openFilePaths } from '@/workspace/open';
import { toWorkspacePath } from '@/workspace/util';
import {
  annotationsPathOf, parseAnnotations, serializeAnnotations, sortNotes,
  type BookHeader, type BookNote,
} from './annotations';
import { openBook, type BookDoc, type BookFormat } from './document';
import {
  bookIdOf, bookMetaOf, readBookState, readLibrary, saveBookEntry, titleOfFile, withBookMeta, writeBookState, type BookEntry,
} from './library';
import { cacheCover } from './covers';
import { indexBookText } from './bookIndex';
import type { Progress } from './pagination';
import type { WritingMode } from './settings';
import { activePane, usePane, type Pane } from './view';

export type ReaderLocation = Progress & {
  cfi: string;
  /** the label of the chapter, and its place */
  tocLabel?: string;
  tocHref?: string;
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
  /** the place asked for, e.g. by a link: marked for a moment once there */
  targetCfi?: string;
  location?: ReaderLocation;
  notes: BookNote[];
  /** seconds read per day, see BookState */
  time: Record<string, number>;
  /** the writing chosen for the book, kept with its entry */
  writingMode: WritingMode;
  /** the text written down the page: as chosen, or as a section of the book says */
  vertical: boolean;
  open: (path: string, cfi?: string) => Promise<void>;
  close: () => Promise<void>;
  setLocation: (location: ReaderLocation) => void;
  /** the reader is reading: pages turned, text selected... */
  touch: () => void;
  addNote: (note: BookNote) => void;
  updateNote: (id: string, patch: Partial<BookNote>) => void;
  removeNote: (id: string) => void;
  setWritingMode: (mode: WritingMode) => void;
  setVertical: (vertical: boolean) => void;
  /** write the pending changes now */
  flush: () => Promise<void>;
};

export const SAVE_DELAY_MS = 500;
export const STATE_DELAY_MS = 1000;
/** reading time is counted by steps, while the reader is active */
export const TICK_MS = 30_000;
/** no page turned for so long: away, not reading */
export const IDLE_MS = 3 * 60_000;

// compare of CFIs, loaded with a book
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

const empty = (): Partial<ReaderStore> => ({
  path: undefined, ws: undefined, hash: undefined, entry: undefined, book: undefined,
  format: undefined, status: 'idle', error: undefined, initialCfi: undefined, targetCfi: undefined,
  location: undefined, notes: [], time: {}, writingMode: 'auto', vertical: false,
});

/**
 * The store of a book read, with its timers. One for the book read, one for
 * the book beside it (parallel reading).
 */
export function createReaderStore() {
  let notesTimer: ReturnType<typeof setTimeout> | undefined;
  let stateTimer: ReturnType<typeof setTimeout> | undefined;
  let notesDirty = false;
  let stateDirty = false;
  let openSeq = 0;
  let tickTimer: ReturnType<typeof setInterval> | undefined;
  let activeAt = 0;

  /** Count the time read, a step at a time, while the book is read. */
  function startTicking() {
    stopTicking();
    activeAt = Date.now();
    tickTimer = setInterval(() => {
      const visible = typeof document === 'undefined' || document.visibilityState !== 'hidden';
      if (!visible || Date.now() - activeAt > IDLE_MS) return;
      const { time, status } = useStore.getState();
      if (status !== 'ready') return;
      const day = getStrDate(new Date().toString());
      useStore.setState({ time: { ...time, [day]: (time[day] ?? 0) + TICK_MS / 1000 } });
      scheduleState();
    }, TICK_MS);
  }

  function stopTicking() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = undefined;
  }

  function scheduleState() {
    stateDirty = true;
    if (stateTimer) clearTimeout(stateTimer);
    stateTimer = setTimeout(() => { void saveState(); }, STATE_DELAY_MS);
  }

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
    const { path, hash, entry, notes } = useStore.getState();
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
    const { ws, hash, location, time } = useStore.getState();
    if (!ws || !hash) return;
    try {
      const old = location ? undefined : await readBookState(ws, hash);
      await writeBookState(ws, hash, {
        location: location?.cfi ?? old?.location,
        fraction: location?.fraction ?? old?.fraction,
        ...(Object.keys(time).length ? { time } : {}),
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Failed to save the reading state', e);
    }
  }

  /** The book open, if any, saved and closed. */
  async function release() {
    stopTicking();
    await Promise.all([saveNotes(), saveState()]);
    const { book } = useStore.getState();
    useStore.setState(empty());
    try {
      await book?.destroy?.();
    } catch (e) {
      console.error('Failed to close the book', e);
    }
  }

  const useStore = create<ReaderStore>((set, get) => ({
    status: 'idle',
    notes: [],
    time: {},
    writingMode: 'auto',
    vertical: false,

    open: async (path, cfi) => {
      const current = get();
      if (current.path === path && current.status !== 'error') {
        // the same book, maybe to another place
        if (cfi) set({ initialCfi: cfi, targetCfi: cfi });
        return;
      }
      // before any wait: a close or another open meanwhile is not missed
      const seq = ++openSeq;
      await release();
      if (seq !== openSeq) return;
      const ws = store.getState().initDir;
      set({
        path, ws, status: 'loading', error: undefined, initialCfi: cfi, targetCfi: cfi, notes: [], location: undefined,
        time: {}, writingMode: 'auto', vertical: false,
      });
      try {
        const [file, fileHash] = await Promise.all([
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
        let time: Record<string, number> = {};
        let hash = fileHash;
        if (ws && fileHash) {
          const lib = await readLibrary(ws);
          // a book written again (a feed book): by its first id
          hash = bookIdOf(lib, fileHash, toWorkspacePath(ws, path)) ?? fileHash;
          // the metadata of the file, unless edited in the library
          entry = withBookMeta({
            ...(lib.books[hash] ?? { addedAt: new Date().toISOString(), title: '', author: '' }),
            hash,
            file: toWorkspacePath(ws, path),
            format,
            ...(hash !== fileHash ? { fileHash } : {}),
          }, bookMetaOf(book, path));
          await saveBookEntry(ws, entry);
          const state = await readBookState(ws, hash);
          if (!initialCfi) initialCfi = state?.location;
          time = state?.time ?? {};
        }
        if (seq !== openSeq) {
          await book.destroy?.();
          return;
        }
        set({ hash, entry, book, format, notes, initialCfi, time, writingMode: entry?.writingMode ?? 'auto', status: 'ready' });
        startTicking();
        // for the library; for the search of the workspace
        if (ws && hash) {
          void cacheCover(ws, hash, book);
          void indexBookText(hash, entry?.title ?? titleOfFile(path), book);
        }
      } catch (e) {
        if (seq !== openSeq) return;
        console.error(`Failed to open the book ${path}`, e);
        set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      }
    },

    close: async () => {
      openSeq += 1;
      await release();
    },

    setLocation: (location) => {
      set({ location });
      activeAt = Date.now();
      if (!get().ws || !get().hash) return;
      scheduleState();
    },

    touch: () => {
      activeAt = Date.now();
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

    setWritingMode: (mode) => {
      const { ws, hash, entry } = get();
      const writingMode = mode === 'auto' ? undefined : mode;
      set({ writingMode: mode, ...(entry ? { entry: { ...entry, writingMode } } : {}) });
      if (!ws || !hash || !entry) return;
      saveBookEntry(ws, { hash, writingMode }).catch((e: unknown) => console.error('Failed to save the writing mode', e));
    },

    setVertical: (vertical) => {
      if (get().vertical !== vertical) set({ vertical });
    },

    flush: async () => {
      await Promise.all([saveNotes(), saveState()]);
    },
  }));

  /** Reset the state; for tests. */
  const reset = () => {
    stopTicking();
    if (notesTimer) clearTimeout(notesTimer);
    if (stateTimer) clearTimeout(stateTimer);
    notesTimer = stateTimer = undefined;
    notesDirty = stateDirty = false;
    openSeq += 1;
    useStore.setState(empty());
  };

  return Object.assign(useStore, { reset });
}

export type ReaderStoreHook = ReturnType<typeof createReaderStore>;

/** The book read. */
export const useReaderStore = createReaderStore();
/** The book beside it, in parallel reading. */
export const useSideStore = createReaderStore();

/** The store of the book of a pane. */
export const storeOf = (pane: Pane): ReaderStoreHook => (pane === 'side' ? useSideStore : useReaderStore);

/** The store of the book last used, e.g. to annotate the text selected. */
export const activeStore = () => storeOf(activePane());

/** The book last used, as a hook: for the panels of the sidebar. */
export function useActiveStore<T>(selector: (state: ReaderStore) => T): T {
  const pane = usePane((s) => s.active);
  return storeOf(pane)(selector);
}

/** Reset module state; for tests. */
export function resetReaderStore() {
  useReaderStore.reset();
  useSideStore.reset();
  compareCfi = undefined;
  usePane.setState({ active: 'main' });
}
