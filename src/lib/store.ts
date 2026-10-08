import { useStore as useZustandStore, type StoreApi } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
import { produce, type Draft } from 'immer';
import type { Note } from 'types/model';
import type { PickPartial } from 'types/utils';
import { ArticleType, PodType } from 'types/model';
import type { ActivityRecord } from 'components/view/HeatMap';
import * as Storage from 'file/storage';
import userSettingsSlice, { UserSettings } from './userSettings';
import { NoteMap } from './noteMap';

export { NoteMap } from './noteMap';

export { shallow as shallowEqual } from 'zustand/shallow';

type NoteUpdate = PickPartial<
  Note, // id required
  'title' | 'content' | 'file_path' | 'cover' | 'created_at' | 'updated_at' | 'is_daily'
>;

type ImmerSet<T> = (fn: (draft: Draft<T>) => void) => void;

// update state by mutating an immer draft
const immer =
  <T>(config: (set: ImmerSet<T>, get: () => T, api: StoreApi<T>) => T) =>
  (set: StoreApi<T>['setState'], get: () => T, api: StoreApi<T>): T =>
    config((fn) => set(produce<T>(fn)), get, api);

// last value written per storage key
const lastSaved: Record<string, string> = {};

// storage in LOCAL_DATA_DIR, saved as a JSON string (same format as before)
const storage: PersistStorage<PersistedState> = {
  getItem: async (name: string): Promise<StorageValue<PersistedState> | null> => {
    // missing key is `{}`: return null, otherwise zustand fails to parse it
    // and never finishes hydrating on the first launch
    const value = await Storage.get(name);
    if (typeof value !== 'string') return null;
    // as saved: no need to write it back unchanged
    lastSaved[name] = value;
    try {
      return JSON.parse(value) as StorageValue<PersistedState>;
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: StorageValue<PersistedState>): Promise<void> => {
    // persist runs on every store update: skip writing what's already saved
    const serialized = serializePersisted(value);
    if (lastSaved[name] === serialized) return;
    lastSaved[name] = serialized;
    try {
      await Storage.set(name, serialized);
    } catch (e) {
      delete lastSaved[name];
      throw e;
    }
  },
  removeItem: async (name: string): Promise<void> => {
    delete lastSaved[name];
    await Storage.remove(name);
  },
};

// plain record of notes, e.g. in JSON data; the store keeps a NoteMap
export type Notes = Record<Note['id'], Note>;

export type NoteTreeItem = {
  id: Note['id']; 
  title: string;
  created_at: string;
  updated_at: string; 
  is_dir: boolean;
  children: NoteTreeItem[]; // to del
  collapsed: boolean;       // to del
};

// dir map notes
export type NoteTree = Record<Note['id'], NoteTreeItem[]>;

export type NotesData = {
  isloaded: boolean;
  notesobj: Notes;
  notetree: NoteTree;
  activities?: ActivityRecord;
}

export enum SidebarTab {
  Silo,
  Search,
  Hashtag,
  Playlist,
}

export type Store = {
  // note
  notes: NoteMap;
  setNotes: Setter<NoteMap>;
  // operate note
  upsertNote: (note: Note) => void;
  upsertNotes: (notes: Note[]) => void;
  upsertTree: (targetDir: string, noteList: Note[], isDir?: boolean) => void;
  updateNote: (note: NoteUpdate) => void;
  deleteNote: (noteId: string) => void;
  currentNoteId: string;
  setCurrentNoteId: Setter<string>;
  currentNote: Notes;  // one record only
  setCurrentNote: Setter<Notes>;
  noteTree: NoteTree;
  setNoteTree: Setter<NoteTree>;
  expandedDirs: Record<string, boolean>;  // dir path -> expanded in sidebar tree
  setExpandedDirs: Setter<Record<string, boolean>>;
  toggleExpandedDir: (dirPath: string, expanded?: boolean) => void;
  activities: ActivityRecord;
  setActivities: Setter<ActivityRecord>;
  sidebarTab: SidebarTab;
  setSidebarTab: Setter<SidebarTab>;
  sidebarSearchQuery: string;
  setSidebarSearchQuery: Setter<string>;
  sidebarSearchType: string; // content or hashtag
  setSidebarSearchType: Setter<string>;
  initDir: string | undefined;  // first open dir path
  setInitDir: Setter<string | undefined>;
  isLoading: boolean;  // is loading all?
  setIsLoading: Setter<boolean>;
  isLoaded: boolean;  // is all loaded?
  setIsLoaded: Setter<boolean>;
  currentDir: string | undefined;  // dir path
  setCurrentDir: Setter<string | undefined>;
  // input end
  currentArticle: ArticleType | null;   // feed article
  setCurrentArticle: Setter<ArticleType | null>;
  currentPod: PodType | null; 
  setCurrentPod: Setter<PodType | null>;
} & UserSettings;

// user settings kept in LOCAL_DATA_DIR, see partialize
type PersistedState = Pick<Store,
  | 'userId' | 'darkMode' | 'font' | 'fontSize' | 'fontWt' | 'lineHeight'
  | 'isRTL' | 'isCheckSpellOn' | 'isOpenPreOn' | 'noteSort' | 'recentDir'
  | 'pinnedDir' | 'sidebarWidth' | 'sideMenuOrientation' | 'feedChannelWidth' | 'feedArticleWidth'
  | 'useAsset' | 'activities'
>;

type FunctionPropertyNames<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => unknown ? K : never;
}[keyof T];

type StoreWithoutFunctions = Omit<Store, FunctionPropertyNames<Store>>;

export type Setter<T> = (value: T | ((value: T) => T)) => void;
export const setter =
  <K extends keyof StoreWithoutFunctions>(
    set: (fn: (draft: Draft<Store>) => void) => void,
    key: K
  ) =>
  (value: Store[K] | ((value: Store[K]) => Store[K])) => {
    if (typeof value === 'function') {
      set((state) => {
        state[key] = value(state[key] as Store[K]);
      });
    } else {
      set((state) => {
        state[key] = value;
      });
    }
  };

export const store = createStore<Store>()(
  persist(
    immer<Store>((set) => ({
      //  Map of note id to notes, see NoteMap
      notes: NoteMap.EMPTY,  // all private notes
      setNotes: setter(set, 'notes'),
      /**
       * update or insert the note
       * @param {Note} note the note to upsert
       */
      upsertNote: (note: Note) => {
        set((state) => {
          // if existing per id, update, otherwise, new insert
          state.notes = state.notes.upsert(note);
          // alert: not check title unique, wiki-link will link to first searched note
        });
      },
      // upsert many notes in one store update, rather than one update per note
      upsertNotes: (notes: Note[]) => {
        if (notes.length === 0) return;
        set((state) => {
          state.notes = state.notes.upsertMany(notes);
        });
      },
      upsertTree: (targetDir: string, noteList: Note[]) => {
        set((state) => {
          const itemsToInsert: NoteTreeItem[] = noteList.map(note => ({ 
            id: note.id, 
            title: note.title,
            created_at: note.created_at,
            updated_at: note.updated_at,
            is_dir: note.is_dir ?? false,
            children: [], 
            collapsed: true, 
          }));
          const targetList = state.noteTree[targetDir] || [];
          const newTargetList = [...targetList, ...itemsToInsert];
          const newList: NoteTreeItem[] = [];
          const seen = new Set<string>();
          for (const item of newTargetList) {
            if (!seen.has(item.id)) {
              seen.add(item.id);
              newList.push(item);
            }
          }
          state.noteTree[targetDir] = newList;
        });
      },
      // Update the given note
      updateNote: (note: NoteUpdate) => {
        if (!store.getState().notes.has(note.id)) return;
        set((state) => {
          state.notes = state.notes.update(note.id, {
            ...note,
            updated_at: new Date().toISOString(),
          });
        });
      },
      // Delete the note with the given noteId
      deleteNote: (noteId: string) => {
        set((state) => {
          state.notes = state.notes.delete(noteId);
          deleteTreeItem(state.noteTree, noteId);
          // a dir: its descendants are gone too, the watcher reports the dir only
          const prefix = `${noteId}/`;
          for (const id of state.notes.keys()) {
            if (id.startsWith(prefix)) state.notes = state.notes.delete(id);
          }
          for (const dir of Object.keys(state.noteTree)) {
            if (dir === noteId || dir.startsWith(prefix)) delete state.noteTree[dir];
          }
        });
      },
      currentNoteId: '',
      setCurrentNoteId: setter(set, 'currentNoteId'),
      currentNote: {},
      setCurrentNote: setter(set, 'currentNote'),
      // The tree of notes visible in the sidebar
      noteTree: {},
      setNoteTree: setter(set, 'noteTree'),
      // expanded dirs in the sidebar tree, not persisted
      expandedDirs: {},
      setExpandedDirs: setter(set, 'expandedDirs'),
      toggleExpandedDir: (dirPath: string, expanded?: boolean) => {
        set((state) => {
          const toExpand = expanded ?? !state.expandedDirs[dirPath];
          if (toExpand) {
            state.expandedDirs[dirPath] = true;
          } else {
            delete state.expandedDirs[dirPath];
          }
        });
      },
      // daily activities 
      activities: {},
      setActivities: setter(set, 'activities'),

      sidebarTab: SidebarTab.Silo,
      setSidebarTab: setter(set, 'sidebarTab'), 
      // search note
      sidebarSearchQuery: '',
      setSidebarSearchQuery: setter(set, 'sidebarSearchQuery'),
      sidebarSearchType: 'content',
      setSidebarSearchType: setter(set, 'sidebarSearchType'),
      initDir: undefined,
      setInitDir: setter(set, 'initDir'),
      isLoading: false,
      setIsLoading: setter(set, 'isLoading'),
      isLoaded: false,
      setIsLoaded: setter(set, 'isLoaded'),
      currentDir: undefined,
      setCurrentDir: setter(set, 'currentDir'),
      // input end
      currentArticle: null,
      setCurrentArticle: setter(set, 'currentArticle'),
      currentPod: null,
      setCurrentPod: setter(set, 'currentPod'),
      ...userSettingsSlice(set),
    })),
    {
      name: 'mdsilo-storage',
      version: 1,
      storage,
      partialize: (state): PersistedState => ({
        // user setting related
        userId: state.userId,
        darkMode: state.darkMode,
        font: state.font,
        fontSize: state.fontSize,
        fontWt: state.fontWt,
        lineHeight: state.lineHeight,
        isRTL: state.isRTL,
        isCheckSpellOn: state.isCheckSpellOn,
        isOpenPreOn: state.isOpenPreOn,
        noteSort: state.noteSort,
        recentDir: state.recentDir,
        pinnedDir: state.pinnedDir,
        sidebarWidth: state.sidebarWidth,
        sideMenuOrientation: state.sideMenuOrientation,
        feedChannelWidth: state.feedChannelWidth,
        feedArticleWidth: state.feedArticleWidth,
        useAsset: state.useAsset,
        activities: state.activities,
      }),
    }
  )
);

/** Select from the store in a component, re-rendering when the selection changes. */
export function useStore<U>(selector: (state: Store) => U): U {
  return useZustandStore(store, selector);
}

// Cache the serialized persisted state: persist serializes it on every store
// update, but the persisted fields rarely change (e.g. not when notes load).
let lastPersisted: { state: Record<string, unknown>; version?: number } | null = null;
let lastSerialized = '';
function serializePersisted(value: StorageValue<PersistedState>): string {
  const state = value.state as unknown as Record<string, unknown>;
  const prev = lastPersisted;
  if (
    prev &&
    prev.version === value.version &&
    Object.keys(state).length === Object.keys(prev.state).length &&
    Object.keys(state).every((key) => state[key] === prev.state[key])
  ) {
    return lastSerialized;
  }
  lastPersisted = { state, version: value.version };
  lastSerialized = JSON.stringify(value);
  return lastSerialized;
}

type PersistApi = {
  persist?: {
    hasHydrated: () => boolean;
    onFinishHydration: (fn: () => void) => () => void;
  };
};

/**
 * Run `fn` once the persisted settings are loaded from storage (async on web).
 * @returns unsubscribe
 */
export const onStoreHydrated = (fn: () => void): (() => void) => {
  const api = (store as unknown as PersistApi).persist;
  if (!api || api.hasHydrated()) {
    fn();
    return () => undefined;
  }
  return api.onFinishHydration(fn);
};


/**
 * Deletes the tree item with the given id and returns it.
 */
const deleteTreeItem = (
  tree: NoteTree,
  id: string
): NoteTreeItem | null => {
  for (const [key, treeList] of Object.entries(tree)) {
    for (let i = 0; i < treeList.length; i++) {
      const item = treeList[i];
      if (item.id === id) {
        treeList.splice(i, 1);
        tree[key] = treeList;
        return item;
      }
    }
  }
  return null;
};

/**
 * Gets the note tree item corresponding to the given noteId.
 */
export const getNoteTreeItem = (
  tree: NoteTreeItem[],
  id: string
): NoteTreeItem | null => {
  for (let i = 0; i < tree.length; i++) {
    const item = tree[i];
    if (item.id === id) {
      return item;
    } else if (item.children.length > 0) {
      const result = getNoteTreeItem(item.children, id);
      if (result) {
        return result;
      }
    }
  }
  return null;
};
