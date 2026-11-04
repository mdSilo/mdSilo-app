import { Draft } from "immer";
import {
  DEFAULT_READER_SETTINGS,
  type ReaderSettings,
} from "@/reader/settings";
import {
  DEFAULT_LIBRARY_SETTINGS,
  type LibrarySettings,
} from "@/reader/library/shelf";
import { isSystemDark, SYSTEM_THEME } from "@/lib/themes";
import { isMobileWidth } from "@/lib/hooks/useIsMobile";
import type { CustomFont } from "@/custom/fonts";
import type { CustomTheme } from "@/custom/themes";
import type { InstalledPlugin, PluginState } from "@/plugins/registry";
import { setter, Setter, Store } from "./store";

export enum Sort {
  TitleAscending = "TITLE_ASCENDING",
  TitleDescending = "TITLE_DESCENDING",
  DateModifiedAscending = "DATE_MODIFIED_ASCENDING",
  DateModifiedDescending = "DATE_MODIFIED_DESCENDING",
  DateCreatedAscending = "DATE_CREATED_ASCENDING",
  DateCreatedDescending = "DATE_CREATED_DESCENDING",
}

export type SideMenuOrientation = "auto" | "vertical" | "horizontal";

/** the folder opened on startup */
export type OpenOnStartup = "previous" | "pinned" | "none";

/** the view shown on startup; explorer: the explorer in the sidebar; book: the book last read */
export type StartupView =
  | "notes"
  | "library"
  | "book"
  | "feed"
  | "issues"
  | "project"
  | "chronicle"
  | "graph"
  | "journal";

export const STARTUP_VIEWS: [StartupView, string][] = [
  ["notes", "Explorer"],
  ["library", "Library"],
  ["book", "Last Book"],
  ["feed", "Feed Reader"],
  ["issues", "Issues"],
  ["project", "Projects"],
  ["chronicle", "Chronicle"],
  ["graph", "Graph"],
  ["journal", "Journals"],
];

/** automatic sync of the workspace (see sync/), where sync is set up */
export type SyncSettings = {
  /** minutes between syncs, 0 for none */
  interval: number;
  /** sync when the app closes */
  onExit: boolean;
};

export const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  interval: 0,
  onExit: false,
};

export const ReadableNameBySort = {
  [Sort.TitleAscending]: "Title (A-Z)",
  [Sort.TitleDescending]: "Title (Z-A)",
  [Sort.DateModifiedAscending]: "Modified (old)",
  [Sort.DateModifiedDescending]: "Modified (new)",
  [Sort.DateCreatedAscending]: "Created (old)",
  [Sort.DateCreatedDescending]: "Created (new)",
} as const;

export type UserSettings = {
  userId: string;
  setUserId: Setter<string>;
  theme: string; // daisyUI theme name, or 'system'
  setTheme: Setter<string>;
  customThemes: CustomTheme[]; // themes made by the user, kept on this device
  setCustomThemes: Setter<CustomTheme[]>;
  workspaceThemes: CustomTheme[]; // themes of the workspace, not persisted
  setWorkspaceThemes: Setter<CustomTheme[]>;
  darkMode: boolean; // the applied theme is dark, follows `theme`
  setDarkMode: Setter<boolean>;
  font: string; // a font id, see custom/fonts
  setFont: Setter<string>;
  codeFont: string; // a font id for code in the editor, '' for the default monospace
  setCodeFont: Setter<string>;
  cjkFont: string; // a font id for CJK text in the editor, '' for none
  setCjkFont: Setter<string>;
  customFonts: CustomFont[]; // the fonts added by the user, kept on this device, see custom/fonts
  setCustomFonts: Setter<CustomFont[]>;
  workspaceFonts: CustomFont[]; // fonts of the workspace, not persisted
  setWorkspaceFonts: Setter<CustomFont[]>;
  /** the plugins installed on this device, read on startup, not persisted */
  installedPlugins: InstalledPlugin[];
  setInstalledPlugins: Setter<InstalledPlugin[]>;
  /** enabled and granted on this device, by plugin id; never synced, see plugins/registry */
  pluginStates: Record<string, PluginState>;
  setPluginStates: Setter<Record<string, PluginState>>;
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
  /** the plugin manager shown, see plugins/PluginManager */
  isPluginsOpen: boolean;
  setIsPluginsOpen: Setter<boolean>;
  /** the theme edited in its dialog, opened from the settings: an id, 'new', or none; not persisted */
  themeEditing: string | null;
  setThemeEditing: Setter<string | null>;
  /** the dialog of the fonts, opened from the settings; not persisted */
  isFontsOpen: boolean;
  setIsFontsOpen: Setter<boolean>;
  setIsAboutOpen: Setter<boolean>;
  isFindOrCreateModalOpen: boolean;
  setIsFindOrCreateModalOpen: Setter<boolean>;
  isRTL: boolean;
  setIsRTL: Setter<boolean>;
  noteSort: Sort;
  setNoteSort: Setter<Sort>;
  isCheckSpellOn: boolean;
  setIsCheckSpellOn: Setter<boolean>;
  openOnStartup: OpenOnStartup;
  setOpenOnStartup: Setter<OpenOnStartup>;
  startupView: StartupView;
  setStartupView: Setter<StartupView>;
  /** the book last read in each workspace, by the folder of the workspace */
  lastBooks: Record<string, string>;
  setLastBook: (dir: string, path: string) => void;
  showHistory: boolean;
  setShowHistory: Setter<boolean>;
  readMode: boolean;
  setReadMode: Setter<boolean>;
  rawMode: string; // 'raw' | 'wysiwyg' | 'mindmap' | 'plugin:<id>:<mode>', see plugins/registry;
  setRawMode: Setter<string>;
  useAsset: boolean;
  setUseAsset: Setter<boolean>;
  recentDir: string[];
  setRecentDir: Setter<string[]>;
  upsertRecentDir: (dir: string) => void;
  deleteRecentDir: (dir: string) => void;
  pinnedDir: string;
  setPinnedDir: Setter<string>;
  sidebarWidth: number;
  setSidebarWidth: Setter<number>;
  sideMenuOrientation: SideMenuOrientation;
  setSideMenuOrientation: Setter<SideMenuOrientation>;
  feedChannelWidth: number;
  setFeedChannelWidth: Setter<number>;
  feedArticleWidth: number;
  setFeedArticleWidth: Setter<number>;
  readerSidebarWidth: number;
  setReaderSidebarWidth: Setter<number>;
  readerSettings: ReaderSettings; // how books show, see reader/settings
  setReaderSettings: Setter<ReaderSettings>;
  librarySettings: LibrarySettings; // how the library shows, see reader/shelf
  setLibrarySettings: Setter<LibrarySettings>;
  syncSettings: SyncSettings;
  setSyncSettings: Setter<SyncSettings>;
};

// resizable panel widths in px
export const SIDEBAR_WIDTH = { min: 160, max: 640, default: 256 } as const;
export const FEED_CHANNEL_WIDTH = { min: 120, max: 480, default: 192 } as const;
export const FEED_ARTICLE_WIDTH = { min: 200, max: 720, default: 288 } as const;
export const READER_SIDEBAR_WIDTH = {
  min: 180,
  max: 560,
  default: 288,
} as const;

const userSettingsSlice = (
  set: (fn: (draft: Draft<Store>) => void) => void,
) => ({
  userId: "",
  setUserId: setter(set, "userId"),
  theme: SYSTEM_THEME,
  setTheme: setter(set, "theme"),
  customThemes: [],
  setCustomThemes: setter(set, "customThemes"),
  workspaceThemes: [],
  setWorkspaceThemes: setter(set, "workspaceThemes"),
  // as the system theme, not to re-render the editors on start
  darkMode: isSystemDark(),
  setDarkMode: setter(set, "darkMode"),
  font: "",
  setFont: setter(set, "font"),
  codeFont: "",
  setCodeFont: setter(set, "codeFont"),
  cjkFont: "",
  setCjkFont: setter(set, "cjkFont"),
  customFonts: [],
  setCustomFonts: setter(set, "customFonts"),
  workspaceFonts: [],
  setWorkspaceFonts: setter(set, "workspaceFonts"),
  installedPlugins: [],
  setInstalledPlugins: setter(set, "installedPlugins"),
  pluginStates: {},
  setPluginStates: setter(set, "pluginStates"),
  fontSize: 1.1,
  setFontSize: setter(set, "fontSize"),
  fontWt: 400,
  setFontWt: setter(set, "fontWt"),
  lineHeight: 1.6,
  setLineHeight: setter(set, "lineHeight"),
  // a phone has no room beside the page: start with the page
  isSidebarOpen: typeof window === "undefined" || !isMobileWidth(),
  setIsSidebarOpen: setter(set, "isSidebarOpen"),
  isSettingsOpen: false,
  setIsSettingsOpen: setter(set, "isSettingsOpen"),
  isAboutOpen: false,
  setIsAboutOpen: setter(set, "isAboutOpen"),
  isPluginsOpen: false,
  setIsPluginsOpen: setter(set, "isPluginsOpen"),
  themeEditing: null,
  setThemeEditing: setter(set, "themeEditing"),
  isFontsOpen: false,
  setIsFontsOpen: setter(set, "isFontsOpen"),
  isFindOrCreateModalOpen: false,
  setIsFindOrCreateModalOpen: setter(set, "isFindOrCreateModalOpen"),
  isRTL: false,
  setIsRTL: setter(set, "isRTL"),
  noteSort: Sort.TitleAscending,
  setNoteSort: setter(set, "noteSort"),
  isCheckSpellOn: true,
  setIsCheckSpellOn: setter(set, "isCheckSpellOn"),
  openOnStartup: "previous" as OpenOnStartup,
  setOpenOnStartup: setter(set, "openOnStartup"),
  startupView: "notes" as StartupView,
  setStartupView: setter(set, "startupView"),
  lastBooks: {},
  setLastBook: (dir: string, path: string) => {
    set((state) => {
      state.lastBooks = { ...state.lastBooks, [dir]: path };
    });
  },
  showHistory: false,
  setShowHistory: setter(set, "showHistory"),
  readMode: false,
  setReadMode: setter(set, "readMode"),
  rawMode: "wysiwyg",
  setRawMode: setter(set, "rawMode"),
  useAsset: true,
  setUseAsset: setter(set, "useAsset"),
  recentDir: [],
  setRecentDir: setter(set, "recentDir"),
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
  pinnedDir: "",
  setPinnedDir: setter(set, "pinnedDir"),
  sidebarWidth: SIDEBAR_WIDTH.default as number,
  setSidebarWidth: setter(set, "sidebarWidth"),
  sideMenuOrientation: "auto" as SideMenuOrientation,
  setSideMenuOrientation: setter(set, "sideMenuOrientation"),
  feedChannelWidth: FEED_CHANNEL_WIDTH.default as number,
  setFeedChannelWidth: setter(set, "feedChannelWidth"),
  feedArticleWidth: FEED_ARTICLE_WIDTH.default as number,
  setFeedArticleWidth: setter(set, "feedArticleWidth"),
  readerSidebarWidth: READER_SIDEBAR_WIDTH.default as number,
  setReaderSidebarWidth: setter(set, "readerSidebarWidth"),
  readerSettings: DEFAULT_READER_SETTINGS,
  setReaderSettings: setter(set, "readerSettings"),
  librarySettings: DEFAULT_LIBRARY_SETTINGS,
  setLibrarySettings: setter(set, "librarySettings"),
  syncSettings: DEFAULT_SYNC_SETTINGS,
  setSyncSettings: setter(set, "syncSettings"),
});

export default userSettingsSlice;
