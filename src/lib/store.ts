import { useStore as useZuStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { createJSONStorage, persist, StateStorage } from 'zustand/middleware';
import type { Draft } from 'immer';
import { immer } from 'zustand/middleware/immer';
import type { Note } from 'types/model';
import type { PickPartial } from 'types/utils';
import { ArticleType, PodType } from 'types/model';
import type { ActivityRecord } from 'components/view/HeatMap';
import * as Storage from 'file/storage';
import userSettingsSlice, { UserSettings } from './userSettings';

export { default as shallowEqual } from 'zustand/shallow';

type NoteUpdate = PickPartial<
  Note, // id required
  'title' | 'content' | 'file_path' | 'cover' | 'created_at' | 'updated_at' | 'is_daily'
>;

// storage in LOCAL_DATA_DIR
const storage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return await Storage.get(name);
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await Storage.set(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await Storage.remove(name);
  },
};

type FunctionPropertyNames<T> = {
  // eslint-disable-next-line @typescript-eslint/ban-types
  [K in keyof T]: T[K] extends Function ? K : never;
}[keyof T];
type StoreWithoutFunctions = Omit<Store, FunctionPropertyNames<Store>>;

export type Setter<T> = (value: T | ((value: T) => T)) => void;
export type CreateSetter = <K extends keyof StoreWithoutFunctions>(
  set: (fn: (draft: Draft<Store>) => void) => void,
  key: K
) => (value: Store[K] | ((value: Store[K]) => Store[K])) => void;

export const createSetter: CreateSetter = (set, key) => (value) => {
  if (typeof value === 'function') {
    set((state) => {
      state[key] = value(state[key]);
    });
  } else {
    set((state) => {
      state[key] = value;
    });
  }
};

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
  notes: Notes;
  setNotes: Setter<Notes>;
  // operate note
  upsertNote: (note: Note) => void;
  upsertTree: (targetDir: string, noteList: Note[], isDir?: boolean) => void;
  updateNote: (note: NoteUpdate) => void;
  deleteNote: (noteId: string) => void;
  currentNoteId: string;
  setCurrentNoteId: Setter<string>;
  currentNote: Notes;  // one record only
  setCurrentNote: Setter<Notes>;
  noteTree: NoteTree;
  setNoteTree: Setter<NoteTree>;
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
  currentBoard: string;  // kanban's name
  setCurrentBoard: Setter<string>;
  currentCard: string | number | undefined;  // kanban card
  setCurrentCard: Setter<string | number | undefined>;
  // input end
  currentArticle: ArticleType | null;   // feed article
  setCurrentArticle: Setter<ArticleType | null>;
  currentPod: PodType | null; 
  setCurrentPod: Setter<PodType | null>;
} & UserSettings;


export const store = createStore<Store>()(
  persist(
    immer((set) => ({
      //  Map of note id to notes
      notes: {},  // all private notes
      setNotes: createSetter(set, 'notes'),
      /**
       * update or insert the note
       * @param {Note} note the note to upsert
       */
      upsertNote: (note: Note) => {
        set((state) => {
          if (state.notes[note.id]) {
            // if existing per id, update 
            state.notes[note.id] = { ...state.notes[note.id], ...note };
          } else {
            // otherwise, new insert
            state.notes[note.id] = note;
          }
          // alert: not check title unique, wiki-link will link to first searched note
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
          newTargetList.forEach(item => {
            if (!newList.some(n => n.id === item.id)) {
              newList.push(item)
            }
          })
          state.noteTree[targetDir] = newList;
        });
      },
      // Update the given note
      updateNote: (note: NoteUpdate) => {
        set((state) => {
          if (state.notes[note.id]) {
            state.notes[note.id] = { 
              ...state.notes[note.id], 
              ...note, 
              updated_at: new Date().toISOString() 
            };
          }
        });
      },
      // Delete the note with the given noteId
      deleteNote: (noteId: string) => {
        set((state) => {
          delete state.notes[noteId];
          deleteTreeItem(state.noteTree, noteId);
        });
      },
      currentNoteId: '',
      setCurrentNoteId: createSetter(set, 'currentNoteId'),
      currentNote: {},
      setCurrentNote: createSetter(set, 'currentNote'),
      // The tree of notes visible in the sidebar
      noteTree: {},
      setNoteTree: createSetter(set, 'noteTree'),
      // daily activities 
      activities: {},
      setActivities: createSetter(set, 'activities'),

      sidebarTab: SidebarTab.Silo,
      setSidebarTab: createSetter(set, 'sidebarTab'), 
      // search note
      sidebarSearchQuery: '',
      setSidebarSearchQuery: createSetter(set, 'sidebarSearchQuery'),
      sidebarSearchType: 'content',
      setSidebarSearchType: createSetter(set, 'sidebarSearchType'),
      initDir: undefined,
      setInitDir: createSetter(set, 'initDir'),
      isLoading: false,
      setIsLoading: createSetter(set, 'isLoading'),
      isLoaded: false,
      setIsLoaded: createSetter(set, 'isLoaded'),
      currentDir: undefined,
      setCurrentDir: createSetter(set, 'currentDir'),
      currentBoard: 'default', 
      setCurrentBoard: createSetter(set, 'currentBoard'),
      currentCard: undefined,
      setCurrentCard: createSetter(set, 'currentCard'),
      // input end
      currentArticle: null,
      setCurrentArticle: createSetter(set, 'currentArticle'),
      currentPod: null,
      setCurrentPod: createSetter(set, 'currentPod'),
      ...userSettingsSlice(set),
    })),
    {
      name: 'mdsilo-storage',
      version: 1,
      storage: createJSONStorage(() => storage),
      partialize: (state) => ({
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
        useAsset: state.useAsset,
        activities: state.activities,
      }),
    }
  )
);

export const useStore = <T>(
  selector: (state: Store) => T,
  equals?: (a: T, b: T) => boolean
) => useZuStore(store, selector, equals);


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
