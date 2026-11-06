/**
 * The manifest of a plugin, `manifest.json` at the root of its folder. The
 * app checks it (src/plugins/manifest.ts) and fills in the defaults: these
 * are the types of the manifest as the app reads it.
 */

export const PERMISSIONS = [
  "file:read",
  "file:write",
  "notes:read",
  "notes:write",
  "books:read",
  "issues:read",
  "reader:read",
  "net",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type PluginMode = "sandboxed" | "trusted";

/** Opens files of these extensions, in place of the editor or the reader; its page is `page`, or the main page */
export type ViewerContribution = {
  extensions: string[];
  title: string;
  page?: string;
};

/** A view of the whole workspace, in the side menu; its page is `page`, or the main page */
export type ViewContribution = {
  id: string;
  title: string;
  icon?: string;
  page?: string;
};

export type SelectionPlace = "reader" | "editor";

/** A button on the text selected, in the reader, the editor, or both */
export type SelectionAction = {
  id: string;
  title: string;
  where: SelectionPlace[];
};

/** A command, run from the Plugins menu of the side menu */
export type CommandContribution = { id: string; title: string };

/**
 * A mode of the note open, beside WYSIWYG, Markdown and MindMap: its page
 * (`page`, or the main page) shows in place of the editor.
 */
export type NoteModeContribution = { id: string; title: string; page?: string };

/**
 * A panel of the reader, opened from its header: its page (`page`, or the
 * main page) over the book (`overlay`, by default) or beside it (`side`),
 * with the methods of the book open (`reader.*`)
 */
export type ReaderPanelContribution = {
  id: string;
  title: string;
  page?: string;
  placement: "overlay" | "side";
};

export type Contributes = {
  viewers: ViewerContribution[];
  views: ViewContribution[];
  /** the languages of the code blocks it draws, ```lang, by its main page */
  codeBlocks: string[];
  /** buttons on the text selected, answered by its main page */
  selectionActions: SelectionAction[];
  /** commands, run by its main page */
  commands: CommandContribution[];
  /** modes of the note open */
  noteModes: NoteModeContribution[];
  /** panels of the reader, on the book open */
  readerPanels: ReaderPanelContribution[];
};

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  minAppVersion?: string;
  author?: string;
  description?: string;
  /**
   * its icon, relative to its folder: SVG, PNG, WebP, JPEG or GIF, square,
   * shown at 16 to 24 px (in the plugin manager, the menus, the toolbars of
   * the text selected); a puzzle piece if none
   */
  icon?: string;
  mode: PluginMode;
  /** a plugin made for another app, run by a compatibility layer: trusted */
  compat?: "obsidian";
  permissions: Permission[];
  /** the page of the plugin (sandboxed), or its module (trusted), relative to its folder */
  main: string;
  contributes: Contributes;
};

/** A manifest as written: what has a default can be left out. */
export type ManifestJson = Omit<
  PluginManifest,
  "mode" | "compat" | "permissions" | "main" | "contributes"
> & {
  mode?: PluginMode;
  permissions?: Permission[];
  main?: string;
  contributes?: Partial<
    Omit<Contributes, "selectionActions" | "readerPanels"> & {
      selectionActions: (Omit<SelectionAction, "where"> & {
        where?: SelectionPlace[];
      })[];
      readerPanels: (Omit<ReaderPanelContribution, "placement"> & {
        placement?: ReaderPanelContribution["placement"];
      })[];
    }
  >;
};
