import type { Permission } from "./manifest";

/**
 * How a sandboxed plugin and the app talk, by `postMessage` between the page
 * of the plugin and the app (`window.parent`):
 * - the plugin calls the app: `{ mdsilo: 1, id, method, params }`, answered
 *   with `{ mdsilo: 1, id, result }` or `{ mdsilo: 1, id, error }`
 * - the app tells the plugin of a change: `{ mdsilo: 1, event, data }`
 * - the app asks the plugin: `{ mdsilo: 1, request, method, params }`,
 *   answered with `{ mdsilo: 1, reply: request, result }` or `{ …, error }`
 */
export const PROTOCOL = 1;

/** The look of the app, for a plugin to match it */
export type PluginStyle = {
  /** `data-theme` of the app */
  theme: string;
  dark: boolean;
  /** the daisyUI variables of the theme: `--color-base-100`, `--radius-box`… */
  vars: Record<string, string>;
  /** the CSS font-family of the editor, '' for the default */
  font: string;
};

export type NoteInfo = {
  /** relative to the workspace */
  path: string;
  title: string;
  created: string;
  updated: string;
  tags: string[];
  /** the titles of the notes it links to */
  links: string[];
};

export type BookInfo = {
  /** the book file, relative to the workspace */
  path: string;
  title: string;
  author: string;
  format: string;
  added: string;
  group?: string;
  status?: string;
  language?: string[];
  subjects?: string[];
};

export type IssueInfo = {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  /** the names of its labels */
  labels: string[];
  milestone?: string;
  due?: string;
  created: string;
  updated: string;
  closed?: string;
  /** the notes linked, relative to the workspace */
  notes: string[];
};

/**
 * The book open in the reader, given with what a plugin is asked about it
 * (`selection.action`, `command.run`) if it is granted `books:read`
 */
export type BookPlace = {
  /** the book file, relative to the workspace */
  path: string;
  title: string;
  author: string;
  /** the chapter shown, as the table of contents of the book names it */
  chapter?: string;
  /** the text selected, or the page shown, as an EPUB CFI */
  cfi?: string;
  /**
   * the book file on the web, when the workspace syncs it to a git repo on
   * GitHub, GitLab or Gitea; others can get it if the repo is public
   */
  url?: string;
  /** a link to read the book at `cfi` in the web app of mdSilo, with `url` */
  readUrl?: string;
};

/**
 * What is open in the app, given with what a plugin is asked: the note
 * (with `notes:read`) or the book (with `books:read`)
 */
export type PluginContext = {
  note?: NoteInfo;
  book?: BookPlace;
};

/** Where the reader is in the book open (`reader.info`, `reader.relocated`) */
export type ReaderInfo = BookPlace & {
  /** the page shown, as `cfi` */
  cfi: string;
  /** how far in the book, 0 to 1 */
  fraction: number;
};

/** A block of text of the book: a paragraph, a heading, an item... */
export type TextBlock = { cfi: string; text: string };

/** The colors of the marks over the text, as of the highlights */
export type MarkColor = "yellow" | "red" | "green" | "blue" | "violet";

/** A note found by `notes.search` */
export type NoteHit = {
  /** relative to the workspace */
  path: string;
  title: string;
  /** the blocks of the note with the words, up to 5 */
  snippets: string[];
};

/** The notes and the links between them (`notes.graph`), paths relative to the workspace */
export type NoteGraph = {
  nodes: { path: string; title: string; tags: string[] }[];
  /** a note links to another, once per pair and direction */
  links: { from: string; to: string }[];
  /** links to a title no note has */
  unresolved: { from: string; title: string }[];
};

type Method<P, R, Perm extends Permission | undefined = undefined> = {
  params: P;
  result: R;
  permission: Perm;
};

/** What a plugin can call, with what, and the permission it needs */
export type Methods = {
  // every page
  "app.info": Method<
    void,
    { id: string; version?: string; permissions: Permission[] }
  >;
  "app.style": Method<void, PluginStyle>;
  /**
   * opens a web page (http or https) in the browser, one a second at most;
   * from the hidden main page only while it answers an action or a command
   */
  "app.openUrl": Method<{ url: string }, true>;
  // file viewers: the file opened only
  /** `path` relative to the workspace, if the file is in it */
  "file.info": Method<void, { name: string; ext: string; path?: string }>;
  "file.read": Method<void, string, "file:read">;
  "file.write": Method<{ text: string }, true, "file:write">;
  /** the file as bytes, for a file not of text (an image, a database…) */
  "file.readBytes": Method<void, Uint8Array, "file:read">;
  "file.writeBytes": Method<{ data: Uint8Array }, true, "file:write">;
  // views of the workspace
  "view.info": Method<void, { id: string }>;
  "notes.list": Method<
    { folder?: string; tag?: string } | void,
    NoteInfo[],
    "notes:read"
  >;
  "notes.read": Method<{ path: string }, string, "notes:read">;
  /** with `create`, a new note if there is none at the path */
  "notes.write": Method<
    { path: string; text: string; create?: boolean },
    true,
    "notes:write"
  >;
  "notes.backlinks": Method<{ path: string }, string[], "notes:read">;
  "notes.search": Method<
    { query: string; limit?: number },
    NoteHit[],
    "notes:read"
  >;
  "notes.graph": Method<void, NoteGraph, "notes:read">;
  "books.list": Method<void, BookInfo[], "books:read">;
  "issues.list": Method<void, IssueInfo[], "issues:read">;
  "app.open": Method<
    { note: string } | { book: string } | { issue: number },
    true
  >;
  // the book open in the reader: in a panel of the reader, an action, a command
  /** where the reader is; null if no book is open */
  "reader.info": Method<void, ReaderInfo | null, "reader:read">;
  /**
   * `count` blocks of text (50 by default, 500 at most) from `from` on: the
   * page shown (`"current"`, by default) or a CFI; `next` the CFI to go on
   * from, none at the end of the book
   */
  "reader.blocks": Method<
    { from?: string; count?: number } | void,
    { blocks: TextBlock[]; next?: string },
    "reader:read"
  >;
  /** shows the place, a CFI */
  "reader.goTo": Method<{ cfi: string }, true, "reader:read">;
  /** marks the text at the CFI, while the book is open: not kept as a highlight */
  "reader.mark": Method<
    { cfi: string; color?: MarkColor },
    true,
    "reader:read"
  >;
  /** takes back the marks of the plugin */
  "reader.clearMarks": Method<void, true, "reader:read">;
  // a panel of the reader
  "panel.info": Method<void, { id: string }>;
  /** closes the panel, e.g. on Escape: the keys go to the panel while it shows */
  "panel.close": Method<void, true>;
  // note modes: the note open only (and app.open, as views)
  "note.info": Method<void, { title: string; readOnly: boolean }>;
  "note.read": Method<void, string, "notes:read">;
  "note.write": Method<{ text: string }, true, "notes:write">;
};

export type MethodName = keyof Methods;
export type ParamsOf<M extends MethodName> = Methods[M]["params"];
export type ResultOf<M extends MethodName> = Methods[M]["result"];

/** What the app tells a plugin */
export type Events = {
  /** the theme or the font changed */
  style: PluginStyle;
  /** the file opened was changed by another app or a sync */
  "file.changed": undefined;
  /** the note open was changed by another app or a sync; read it again */
  "note.changed": undefined;
  /** views: notes were edited (in the app too), made, renamed or deleted; paths relative to the workspace */
  "notes.changed": { paths: string[] };
  /** panels of the reader: the page shown changed */
  "reader.relocated": ReaderInfo;
  /** views: files of the workspace changed on the disk, as the watcher saw them */
  "files.changed": { paths: string[]; event: string };
};

export type EventName = keyof Events;

/** Some HTML to show: sanitized by the app, no scripts, styles or forms */
export type Html = { html: string };

/**
 * An image to show, e.g. a card drawn on a canvas: PNG, JPEG, WebP, GIF or
 * SVG, of 20 MB at most. The app shows it with buttons to copy it, save it,
 * share it (where the system can) and, in the editor, put it in the note
 * (saved in `assets/`).
 */
export type ImageAnswer = {
  /** the bytes (a `Uint8Array`, an `ArrayBuffer`, a `Blob`) or a `data:` URL */
  image: Uint8Array | ArrayBuffer | Blob | string;
  /** the file name to save it as, e.g. `quote.png` */
  name?: string;
  /** what it shows, for those who can't see it, and the text of the image in a note */
  alt?: string;
  /**
   * buttons to open web pages by the image, 4 at most: to post it, say
   * (`https://bsky.app/intent/compose?text=…`); http(s) only
   */
  links?: { title: string; url: string }[];
};

/** What the app asks the main page of a plugin, with what it wants back */
export type Requests = {
  /** draw a code block of a language in `contributes.codeBlocks`: SVG or HTML */
  "code.render": {
    params: { lang: string; code: string; dark: boolean };
    result: string;
  };
  /**
   * a button of `contributes.selectionActions` was clicked on the text
   * selected: in the note open (`note`) or the book open (`book`, its `cfi`
   * the text selected)
   */
  "selection.action": {
    params: PluginContext & {
      action: string;
      text: string;
      /** in the editor: the text selected as Markdown, with its marks and links */
      markdown?: string;
      where: "reader" | "editor";
      lang?: string;
    };
    /**
     * text, HTML or an image to show; in the editor, or text to put in place
     * of the selection, or after it. In the reader, `highlight: true` with
     * them highlights the text selected too, as the user would (e.g. a quote)
     */
    result:
      | string
      | (({ text: string } | Html | ImageAnswer) & { highlight?: boolean })
      | { replace: string }
      | { insert: string };
  };
  /** a command of `contributes.commands` was run, with the note or the book open */
  "command.run": {
    params: PluginContext & { command: string };
    result: void | string | Html | ImageAnswer;
  };
};

export type RequestName = keyof Requests;

export type CallMessage = {
  mdsilo: typeof PROTOCOL;
  id: number | string;
  method: string;
  params?: unknown;
};

export type AnswerMessage = {
  mdsilo: typeof PROTOCOL;
  id: number | string;
  result?: unknown;
  error?: string;
};

export type EventMessage = {
  mdsilo: typeof PROTOCOL;
  event: string;
  data?: unknown;
};

export type RequestMessage = {
  mdsilo: typeof PROTOCOL;
  request: number;
  method: string;
  params?: unknown;
};

export type ReplyMessage = {
  mdsilo: typeof PROTOCOL;
  reply: number;
  result?: unknown;
  error?: string;
};
