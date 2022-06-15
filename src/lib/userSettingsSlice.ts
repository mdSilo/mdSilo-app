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
  isRTL: boolean;
  setIsRTL: Setter<boolean>;
  noteSort: Sort;
  setNoteSort: Setter<Sort>;
  isCheckSpellOn: boolean;
  setIsCheckSpellOn: Setter<boolean>;
  readMode: boolean;
  setReadMode: Setter<boolean>;
  rawMode: boolean;  // Raw markdown or WYSIWYG
  setRawMode: Setter<boolean>;
  recentDir: string[];
  setRecentDir: Setter<string[]>;
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
  isRTL: false,
  setIsRTL: setter(set, 'isRTL'),
  noteSort: Sort.TitleAscending,
  setNoteSort: setter(set, 'noteSort'),
  isCheckSpellOn: true,
  setIsCheckSpellOn: setter(set, 'isCheckSpellOn'),
  readMode: false,
  setReadMode: setter(set, 'readMode'),
  rawMode: false,
  setRawMode: setter(set, 'rawMode'),
  recentDir: [],
  setRecentDir: setter(set, 'recentDir'),
});

export default userSettingsSlice;
