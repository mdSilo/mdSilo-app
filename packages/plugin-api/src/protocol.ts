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
  // note modes: the note open only
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
  /** views: files of the workspace changed on the disk, as the watcher saw them */
  "files.changed": { paths: string[]; event: string };
};

export type EventName = keyof Events;

/** Some HTML to show: sanitized by the app, no scripts, styles or forms */
export type Html = { html: string };

/** What the app asks the main page of a plugin, with what it wants back */
export type Requests = {
  /** draw a code block of a language in `contributes.codeBlocks`: SVG or HTML */
  "code.render": {
    params: { lang: string; code: string; dark: boolean };
    result: string;
  };
  /** a button of `contributes.selectionActions` was clicked on the text selected */
  "selection.action": {
    params: {
      action: string;
      text: string;
      where: "reader" | "editor";
      lang?: string;
    };
    /** text or HTML to show; in the editor, or text to put in place of the selection, or after it */
    result: string | Html | { replace: string } | { insert: string };
  };
  /** a command of `contributes.commands` was run */
  "command.run": {
    params: { command: string };
    result: void | string | Html;
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
