import { Draft } from 'immer';
import { setter, Setter, Store } from './store';

export enum Sort {
  TitleAscending = 'TITLE_ASCENDING',
  TitleDescending = 'TITLE_DESCENDING',
  DateModifiedAscending = 'DATE_MODIFIED_ASCENDING',
  DateModifiedDescending = 'DATE_MODIFIED_DESCENDING',
  DateCreatedAscending = 'DATE_CREATED_ASCENDING',
  DateCreatedDescending = 'DATE_CREATED_DESCENDING',
}

export const ReadableNameBySort = {
  [Sort.TitleAscending]: 'Title (A-Z)',
  [Sort.TitleDescending]: 'Title (Z-A)',
  [Sort.DateModifiedAscending]: 'Modified (old)',
  [Sort.DateModifiedDescending]: 'Modified (new)',
  [Sort.DateCreatedAscending]: 'Created (old)',
  [Sort.DateCreatedDescending]: 'Created (new)',
} as const;

export type UserSettings = {
  userId: string,
  setUserId: Setter<string>;
  darkMode: boolean;
  setDarkMode: Setter<boolean>;
  isSidebarOpen: boolean;
  setIsSidebarOpen: Setter<boolean>;
  isSettingsOpen: boolean;
  setIsSettingsOpen: Setter<boolean>;
  isAboutOpen: boolean;
  setIsAboutOpen: Setter<boolean>;
  isFindOrCreateModalOpen: boolean;
  setIsFindOrCreateModalOpen: Setter<boolean>;
  isRTL: boolean;
  setIsRTL: Setter<boolean>;
  noteSort: Sort;
  setNoteSort: Setter<Sort>;
  isCheckSpellOn: boolean;
  setIsCheckSpellOn: Setter<boolean>;
  readMode: boolean;
  setReadMode: Setter<boolean>;
  rawMode: string; // 'raw' | 'wysiwyg' | 'mindmap'; 
  setRawMode: Setter<string>;
  useAsset: boolean;
  setUseAsset: Setter<boolean>;
  recentDir: string[];
  setRecentDir: Setter<string[]>;
  upsertRecentDir: (dir: string) => void;
  deleteRecentDir: (dir: string) => void;
  pinnedDir: string;
  setPinnedDir: Setter<string>;
};

const userSettingsSlice = (
  set: (fn: (draft: Draft<Store>) => void) => void
) => ({
  userId: '',
  setUserId: setter(set, 'userId'),
  darkMode: true,
  setDarkMode: setter(set, 'darkMode'),
  isSidebarOpen: true,
  setIsSidebarOpen: setter(set, 'isSidebarOpen'),
  isSettingsOpen: false,
  setIsSettingsOpen: setter(set, 'isSettingsOpen'),
  isAboutOpen: false,
  setIsAboutOpen: setter(set, 'isAboutOpen'),
  isFindOrCreateModalOpen: false,
  setIsFindOrCreateModalOpen: setter(set, 'isFindOrCreateModalOpen'),
  isRTL: false,
  setIsRTL: setter(set, 'isRTL'),
  noteSort: Sort.TitleAscending,
  setNoteSort: setter(set, 'noteSort'),
  isCheckSpellOn: true,
  setIsCheckSpellOn: setter(set, 'isCheckSpellOn'),
  readMode: false,
  setReadMode: setter(set, 'readMode'),
  rawMode: 'wysiwyg',
  setRawMode: setter(set, 'rawMode'),
  useAsset: false,
  setUseAsset: setter(set, 'useAsset'),
  recentDir: [],
  setRecentDir: setter(set, 'recentDir'),
  upsertRecentDir: (dir: string) => {
    set((state) => {
      const history = state.recentDir || [];
      const idx = history.indexOf(dir);
      if (idx >= 0) {
        history.splice(idx, 1);
      }
      history.push(dir);
      state.recentDir = history;
    });
  },
  deleteRecentDir: (dir: string) => {
    set((state) => {
      const history = state.recentDir || [];
      const idx = history.indexOf(dir);
      if (idx >= 0) {
        history.splice(idx, 1);
      }
      state.recentDir = history;
    });
  },
  pinnedDir: '',
  setPinnedDir: setter(set, 'pinnedDir'),
});

export default userSettingsSlice;
