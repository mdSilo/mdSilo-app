import create, { State, StateCreator } from 'zustand';
import createVanilla from 'zustand/vanilla';
import { persist, StateStorage } from 'zustand/middleware';
import produce, { Draft } from 'immer';
import type { Note } from 'types/model';
import type { PickPartial } from 'types/utils';
import type { ActivityRecord } from 'components/HeatMap';
import * as Storage from 'file/storage';
import userSettingsSlice, { UserSettings } from './userSettingsSlice';

export { default as shallowEqual } from 'zustand/shallow';

type NoteUpdate = PickPartial<
  Note, // id required
  'title' | 'content' | 'file_path' | 'cover' | 'created_at' | 'updated_at' | 'is_pub' | 'is_wiki' | 'is_daily'
>;

const immer =
  <T extends State>(
    config: StateCreator<T, (fn: (draft: Draft<T>) => void) => void>
  ): StateCreator<T> =>
  (set, get, api) => config((fn) => set(produce<T>(fn)), get, api);

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

export type Notes = Record<Note['id'], Note>;

export type NoteTreeItem = {
  id: Note['id']; 
  title: string;
  created_at: string;
  updated_at: string; 
  isDir: boolean;
  children: NoteTreeItem[];
  collapsed: boolean;
};

// dir map notes
export type NoteTree = Record<Note['id'], NoteTreeItem[]>;

export type NotesData = {
  isLoaded: boolean;
  notesObj: Notes;
  noteTree: NoteTree;
  activities?: ActivityRecord;
}

export enum SidebarTab {
  Silo,
  Search,
}

export type Store = {
  // note
  notes: Notes;
  setNotes: Setter<Notes>;
  // operate note
  upsertNote: (note: Note) => void;
  upsertTree: (targetDir: string, note: Note, isDir?: boolean) => void;
  updateNote: (note: NoteUpdate) => void;
  deleteNote: (noteId: string) => void;
  currentNoteId: string;
  setCurrentNoteId: Setter<string>;
  noteTree: NoteTree;
  setNoteTree: Setter<NoteTree>;
  toggleNoteTreeItemCollapsed: (dir: string, noteId: string, toCollapsed?: boolean) => void;
  activities: ActivityRecord;
  setActivities: Setter<ActivityRecord>;
  sidebarTab: SidebarTab;
  setSidebarTab: Setter<SidebarTab>;
  sidebarSearchQuery: string;
  setSidebarSearchQuery: Setter<string>;
  initDir: string | undefined;  // first open dir path
  setInitDir: Setter<string | undefined>;
  isLoading: boolean;  // is loading all?
  setIsLoading: Setter<boolean>;
  isLoaded: boolean;  // is all loaded?
  setIsLoaded: Setter<boolean>;
  currentDir: string | undefined;  // dir path
  setCurrentDir: Setter<string | undefined>;
  msgModalText: string; 
  setMsgModalText: Setter<string>;
  msgModalOpen: boolean; 
  setMsgModalOpen: Setter<boolean>;
} & UserSettings;

type FunctionPropertyNames<T> = {
  // eslint-disable-next-line @typescript-eslint/ban-types
  [K in keyof T]: T[K] extends Function ? K : never;
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
        state[key] = value(state[key]);
      });
    } else {
      set((state) => {
        state[key] = value;
      });
    }
  };

export const store = createVanilla<Store>(
  persist(
    immer((set) => ({
      //  Map of note id to notes
      notes: {},  // all private notes
      setNotes: setter(set, 'notes'),
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
      upsertTree: (targetDir: string, note: Note, isDir = false) => {
        set((state) => {
          const itemToInsert = { 
            id: note.id, 
            children: [], 
            collapsed: true, 
            isDir,
            title: note.title,
            created_at: note.created_at,
            updated_at: note.updated_at,
          };
          const targetList = state.noteTree[targetDir] || [];
          insertTreeItem(targetList, itemToInsert);
          state.noteTree[targetDir] = targetList;
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
      setCurrentNoteId: setter(set, 'currentNoteId'),
      // The tree of notes visible in the sidebar
      noteTree: {},
      setNoteTree: setter(set, 'noteTree'),
      // Expands or collapses the tree item with the given noteId, to be del 
      toggleNoteTreeItemCollapsed: (dir: string, noteId: string, toCollapsed?: boolean) => {
        set((state) => {
          toggleTreeItemCollapsed(state.noteTree, dir, noteId, toCollapsed);
        });
      },

      activities: {},
      setActivities: setter(set, 'activities'),

      sidebarTab: SidebarTab.Silo,
      setSidebarTab: setter(set, 'sidebarTab'), 
      // search note
      sidebarSearchQuery: '',
      setSidebarSearchQuery: setter(set, 'sidebarSearchQuery'),
      initDir: undefined,
      setInitDir: setter(set, 'initDir'),
      isLoading: false,
      setIsLoading: setter(set, 'isLoading'),
      isLoaded: false,
      setIsLoaded: setter(set, 'isLoaded'),
      currentDir: undefined,
      setCurrentDir: setter(set, 'currentDir'),
      msgModalText: '',
      setMsgModalText: setter(set, 'msgModalText'),
      msgModalOpen: false,
      setMsgModalOpen: setter(set, 'msgModalOpen'),
      ...userSettingsSlice(set),
    })),
    {
      name: 'mdsilo-storage',
      version: 1,
      getStorage: () => storage,
      partialize: (state) => ({
        // user setting related
        userId: state.userId,
        darkMode: state.darkMode,
        isRTL: state.isRTL,
        isCheckSpellOn: state.isCheckSpellOn,
        noteSort: state.noteSort,
        recentDir: state.recentDir,
        activities: state.activities,
      }),
    }
  )
);

export const useStore = create<Store>(store);


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
 * Inserts the given item into the tree as a child of the item with targetId, and returns true if it was inserted.
 * If targetId is null, inserts the item into the root level.
 */
const insertTreeItem = (
  tree: NoteTreeItem[],
  item: NoteTreeItem,
): boolean => {
  const itemExist = tree.find((n) => n.id === item.id);
  if (itemExist) { 
    return true; // existed
  }
  tree.push(item);
  return true;
};

/**
 * Expands or collapses the tree item with the given id, and returns true if it was updated.
 */
const toggleTreeItemCollapsed = (
  tree: NoteTree,
  dir: string,
  id: string,
  toCollapsed?: boolean,
): boolean => {
  const allItem = tree[dir];
  for (let i = 0; i < allItem.length; i++) {
    const item = allItem[i];
    if (item.id === id) {
      tree[dir][i] = { ...item, collapsed: toCollapsed ?? !item.collapsed };
      return true;
    }
  }
  return false;
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
