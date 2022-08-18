import create, { State, StateCreator } from 'zustand';
import createVanilla from 'zustand/vanilla';
import { persist, StateStorage } from 'zustand/middleware';
import produce, { Draft } from 'immer';
import type { Note } from 'types/model';
import type { PickPartial } from 'types/utils';
import { ciStringEqual } from 'utils/helper';
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
  children: NoteTreeItem[];
  isDir: boolean;
  collapsed: boolean;
  title: string;
  created_at: string;
  updated_at: string;
};

export type DailyActivities = Record<string, {create: number; update: number;}>;

export type NotesData = {
  notesObj: Notes;
  noteTree: NoteTreeItem[];
  activities?: DailyActivities;
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
  upsertTree: (note: Note, targetId?: string, isDir?: boolean) => void;
  updateNote: (note: NoteUpdate) => void;
  deleteNote: (noteId: string) => void;
  currentNoteId: string;
  setCurrentNoteId: Setter<string>;
  noteTree: NoteTreeItem[];
  setNoteTree: Setter<NoteTreeItem[]>;
  toggleNoteTreeItemCollapsed: (noteId: string, toCollapsed?: boolean) => void;
  sidebarTab: SidebarTab;
  setSidebarTab: Setter<SidebarTab>;
  sidebarSearchQuery: string;
  setSidebarSearchQuery: Setter<string>;
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
            // if existing per id
            state.notes[note.id] = { ...state.notes[note.id], ...note };
          } else {
            // // if existing per title
            // const existingNote = Object.values(state.notes).find((n) =>
            //   ciStringEqual(n.title, note.title)
            // );
            // if (existingNote) {
            //   // Update existing note
            //   state.notes[existingNote.id] = {
            //     ...state.notes[existingNote.id],
            //     ...note,
            //     id: existingNote.id,
            //     file_path: existingNote.file_path,
            //   };
            // } else {
            //   // Insert new note
            //   state.notes[note.id] = note;
            // }
            state.notes[note.id] = note;
          }
        });
      },
      upsertTree: (note: Note, targetId = '', isDir = false) => {
        set((state) => {
          // the treeItem must be an existing note
          // if (!state.notes[note.id]) return;
          if (!note.is_wiki) {
            const itemToInsert = { 
              id: note.id, 
              children: [], 
              collapsed: true, 
              isDir,
              title: note.title,
              created_at: note.created_at,
              updated_at: note.updated_at,
            };
            // to target
            const inserted = insertTreeItem(
              state.noteTree,
              itemToInsert,
              targetId
            );
            // otherwise to root
            if (!inserted) {
              insertTreeItem(
                state.noteTree,
                itemToInsert,
                null
              );
            }
          }
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
          const item = deleteTreeItem(state.noteTree, noteId);
          if (item && item.children.length > 0) {
            for (const child of item.children) {
              insertTreeItem(state.noteTree, child, null);
            }
          }
        });
      },
      currentNoteId: '',
      setCurrentNoteId: setter(set, 'currentNoteId'),
      // The tree of notes visible in the sidebar
      noteTree: [], // private notes
      setNoteTree: setter(set, 'noteTree'),
      // Expands or collapses the tree item with the given noteId
      toggleNoteTreeItemCollapsed: (noteId: string, toCollapsed?: boolean) => {
        set((state) => {
          toggleTreeItemCollapsed(state.noteTree, noteId, toCollapsed);
        });
      },

      sidebarTab: SidebarTab.Silo,
      setSidebarTab: setter(set, 'sidebarTab'), 
      // search note
      sidebarSearchQuery: '',
      setSidebarSearchQuery: setter(set, 'sidebarSearchQuery'),
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
      }),
    }
  )
);

export const useStore = create<Store>(store);


/**
 * Deletes the tree item with the given id and returns it.
 */
const deleteTreeItem = (
  tree: NoteTreeItem[],
  id: string
): NoteTreeItem | null => {
  for (let i = 0; i < tree.length; i++) {
    const item = tree[i];
    if (item.id === id) {
      tree.splice(i, 1);
      return item;
    } else if (item.children.length > 0) {
      const result = deleteTreeItem(item.children, id);
      if (result) {
        return result;
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
  targetId: string | null
): boolean => {
  // no targetId, push to root
  if (!targetId) {
    const itemExist = tree.find((n) => n.id === item.id);
    if (itemExist) { 
      return true; // existed
    }
    tree.push(item);
    return true;
  }

  // match targetId to insert
  for (let i = 0; i < tree.length; i++) {
    const treeItem = tree[i];
    if (treeItem.id === targetId && treeItem.isDir) {
      const children = treeItem.children;
      const itemExist = children.find((n) => n.id === item.id);
      if (itemExist) {
        return true; // existed
      }
      children.push(item);
      return true;
    } else if (treeItem.children.length > 0) {
      const result = insertTreeItem(treeItem.children, item, targetId);
      if (result) {
        return result;
      }
    }
  }
  return false;
};

/**
 * Expands or collapses the tree item with the given id, and returns true if it was updated.
 */
const toggleTreeItemCollapsed = (
  tree: NoteTreeItem[],
  id: string,
  toCollapsed?: boolean,
): boolean => {
  for (let i = 0; i < tree.length; i++) {
    const item = tree[i];
    if (item.id === id) {
      tree[i] = { ...item, collapsed: toCollapsed ?? !item.collapsed };
      return true;
    } else if (item.children.length > 0) {
      const result = toggleTreeItemCollapsed(item.children, id, toCollapsed);
      if (result) {
        return result;
      }
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
