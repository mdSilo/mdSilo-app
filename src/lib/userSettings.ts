import { Draft } from 'immer';
import { createSetter, Setter, Store } from './store';

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
  font: string;
  setFont: Setter<string>;
  fontSize: number;
  setFontSize: Setter<number>;
  fontWt: number;
  setFontWt: Setter<number>;
  lineHeight: number;
  setLineHeight: Setter<number>;
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
  isOpenPreOn: boolean;
  setIsOpenPreOn: Setter<boolean>;
  showHistory: boolean,
  setShowHistory: Setter<boolean>;
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
  setUserId: createSetter(set, 'userId'),
  darkMode: true,
  setDarkMode: createSetter(set, 'darkMode'),
  font: '',
  setFont: createSetter(set, 'font'),
  fontSize: 1.1,
  setFontSize: createSetter(set, 'fontSize'),
  fontWt: 400,
  setFontWt: createSetter(set, 'fontWt'),
  lineHeight: 1.6,
  setLineHeight: createSetter(set, 'lineHeight'),
  isSidebarOpen: true,
  setIsSidebarOpen: createSetter(set, 'isSidebarOpen'),
  isSettingsOpen: false,
  setIsSettingsOpen: createSetter(set, 'isSettingsOpen'),
  isAboutOpen: false,
  setIsAboutOpen: createSetter(set, 'isAboutOpen'),
  isFindOrCreateModalOpen: false,
  setIsFindOrCreateModalOpen: createSetter(set, 'isFindOrCreateModalOpen'),
  isRTL: false,
  setIsRTL: createSetter(set, 'isRTL'),
  noteSort: Sort.TitleAscending,
  setNoteSort: createSetter(set, 'noteSort'),
  isCheckSpellOn: true,
  setIsCheckSpellOn: createSetter(set, 'isCheckSpellOn'),
  isOpenPreOn: true,
  setIsOpenPreOn: createSetter(set, 'isOpenPreOn'),
  showHistory: false,
  setShowHistory:createSetter(set, 'showHistory'),
  readMode: false,
  setReadMode: createSetter(set, 'readMode'),
  rawMode: 'wysiwyg',
  setRawMode: createSetter(set, 'rawMode'),
  useAsset: true,
  setUseAsset: createSetter(set, 'useAsset'),
  recentDir: [],
  setRecentDir: createSetter(set, 'recentDir'),
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
  setPinnedDir: createSetter(set, 'pinnedDir'),
});

export default userSettingsSlice;
