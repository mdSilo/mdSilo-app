import create, { State, StateCreator } from 'zustand';
import createVanilla from 'zustand/vanilla';
import { persist, StateStorage } from 'zustand/middleware';
import produce, { Draft } from 'immer';
import type { Note } from 'types/model';
import { ciStringEqual } from 'utils/helper';
import * as Storage from 'file/storage';
import userSettingsSlice, { UserSettings } from './userSettingsSlice';
import type { NoteUpdate } from './api/curdNote';

export { default as shallowEqual } from 'zustand/shallow';

const immer =
  <T extends State>(
    config: StateCreator<T, (fn: (draft: Draft<T>) => void) => void>
  ): StateCreator<T> =>
  (set, get, api) =>
    config((fn) => set(produce<T>(fn)), get, api);

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

export type WikiTreeItem = {
  id: Note['id'];         // wiki note
  children: Note['id'][]; // private notes
};

export type NotesData = {
  notesObj: Notes;
  noteTree: NoteTreeItem[];
  wikiTree: WikiTreeItem[];
}

export enum SidebarTab {
  Silo,
  Search,
}

export type Store = {
  // note
  notes: Notes;
  setNotes: Setter<Notes>;
  noteTitleToIdMap: Record<string, string | undefined>;
  setNoteTitleToIdMap: Setter<Record<string, string | undefined>>;
  // operate note
  upsertNote: (note: Note) => void;
  upsertTree: (note: Note, targetId?: string, isDir?: boolean) => void;
  updateNote: (note: NoteUpdate) => void;
  deleteNote: (noteId: string) => void;
  currentNoteId: string;
  setCurrentNoteId: Setter<string>;
  openNoteIds: string[];
  setOpenNoteIds: (openNoteIds: string[], index?: number) => void;
  noteTree: NoteTreeItem[];
  setNoteTree: Setter<NoteTreeItem[]>;
  moveNoteTreeItem: (noteId: string, newParentNoteId: string | null) => void;
  toggleNoteTreeItemCollapsed: (noteId: string, toCollapsed?: boolean) => void;
  wikiTree: WikiTreeItem[];
  setWikiTree: Setter<WikiTreeItem[]>;
  updateWikiTree: (wikiId: string, noteId: string | null) => void;
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
      notes: {},  // all private notes and related wiki notes
      // Sets the notes
      setNotes: setter(set, 'notes'),
      noteTitleToIdMap: {}, 
      setNoteTitleToIdMap: setter(set, 'noteTitleToIdMap'),
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
            // if existing per title
            const existingNote = Object.values(state.notes).find((n) =>
              ciStringEqual(n.title, note.title)
            );
            if (existingNote) {
              // Update existing note
              state.notes[existingNote.id] = {
                ...state.notes[existingNote.id],
                ...note,
              };
            } else {
              // Insert new note
              state.notes[note.id] = note;
            }
          }
          // set title-id map
          state.noteTitleToIdMap[note.title.toLowerCase()] = note.id;
        });
      },
      upsertTree: (note: Note, targetId = '', isDir = false) => {
        set((state) => {
            if (note.is_wiki) {
            insertWikiTree(state.wikiTree, note.id, null);
          } else {
            insertTreeItem(
              state.noteTree,
              { id: note.id, 
                children: [], 
                collapsed: true, 
                isDir,
                title: note.title,
                created_at: note.created_at,
                updated_at: note.updated_at,
              },
              targetId
            );
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
      // The visible notes, including the main note and the stacked notes
      openNoteIds: [],
      // Replaces the open notes at the given index (0 by default)
      setOpenNoteIds: (newOpenNoteIds: string[], index?: number) => {
        if (!index) {
          set((state) => {
            state.openNoteIds = newOpenNoteIds;
          });
          return;
        }
        // Replace the notes after the current note with the new note
        set((state) => {
          state.openNoteIds.splice(
            index,
            state.openNoteIds.length - index,
            ...newOpenNoteIds
          );
        });
      },
      // The tree of notes visible in the sidebar
      noteTree: [], // private notes
      setNoteTree: setter(set, 'noteTree'),
      // Moves the tree item with the given noteId to the given newParentNoteId's children
      moveNoteTreeItem: (noteId: string, newParentNoteId: string | null) => {
        // Don't do anything if the note ids are the same
        if (noteId === newParentNoteId) {
          return;
        }
        set((state) => {
          const item = deleteTreeItem(state.noteTree, noteId);
          if (item) {
            insertTreeItem(state.noteTree, item, newParentNoteId);
          }
          if (newParentNoteId) {
            toggleTreeItemCollapsed(state.noteTree, newParentNoteId, false);
          }
        });
      },
      // Expands or collapses the tree item with the given noteId
      toggleNoteTreeItemCollapsed: (noteId: string, toCollapsed?: boolean) => {
        set((state) => {
          toggleTreeItemCollapsed(state.noteTree, noteId, toCollapsed);
        });
      },
      // wiki tree
      wikiTree: [],
      setWikiTree: setter(set, 'wikiTree'),
      updateWikiTree: (wikiId: string, noteId: string | null) => {
        set((state) => {
          insertWikiTree(state.wikiTree, wikiId, noteId);
        });
      },
      sidebarTab: SidebarTab.Silo,
      setSidebarTab: setter(set, 'sidebarTab'),
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
        // isSidebarOpen: state.isSidebarOpen, // don't persist
        darkMode: state.darkMode,
        isPageStackingOn: state.isPageStackingOn,
        isCheckSpellOn: state.isCheckSpellOn,
        noteSort: state.noteSort,
        recentDir: state.recentDir,
      }),
    }
  )
);

export const useStore = create<Store>(store);

export const computeTitleToId = (notes: Note[]) => {
  const noteTitleToIdMap: Record<string, string | undefined> = {};
  for (const note of notes) {
    noteTitleToIdMap[note.title.toLowerCase()] = note.id;
  }
  return noteTitleToIdMap;
}

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
    if (treeItem.id === targetId) {
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
  // no targetId matched, push to root
  tree.push(item);
  return true;
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

// wikiTree
export const insertWikiTree = (
  tree: WikiTreeItem[],
  wikiId: string,
  noteId: string | null
) => {
  for (let i = 0; i < tree.length; i++) {
    const treeItem = tree[i];
    if (treeItem.id === wikiId) {
      if (noteId) {
        const children = treeItem.children;
        if (children.includes(noteId)) {
          return true;  // dup
        }
        treeItem.children.push(noteId);
      }
      return true;
    }
  }
  const newItem = {id: wikiId, children: noteId ? [noteId] : []};
  tree.push(newItem);
  return true;
};

export const deleteWikiChild = (
  tree: WikiTreeItem[],
  wikiId: string,
  noteId: string,
): boolean => {
  for (let i = 0; i < tree.length; i++) {
    const treeItem = tree[i];
    if (treeItem.id === wikiId) {
      const children = treeItem.children;
      const idx = children.indexOf(noteId);
      if (idx >= 0) {
        treeItem.children.splice(idx, 1);
        return true;
      }
      // if (children.length == 0) {
      //   tree.splice(i, 1);
      // }
    }
  }
  return false;
};

export const getAllWikiId = (
  tree: WikiTreeItem[],
): string[] => {
  const wikiIds = [];
  for (let i = 0; i < tree.length; i++) {
    const treeItem = tree[i];
    wikiIds.push(treeItem.id);
  }
  return wikiIds;
};
