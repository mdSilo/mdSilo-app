# mdSilo plugins

A plugin is a folder with a `manifest.json` and a page (`index.html` by default). Install it from the
Plugins button of the side menu → Manage Plugins → Install from Folder (or Install from .zip: a
.zip of the folder, or of what is in it), then enable it and choose
what it may do. A plugin is kept on this device, or, with *Sync with workspace*, in
`.mdsilo/plugins/<id>/` and synced. Whether it is enabled, and with which permissions, stays on
each device: a plugin is never enabled by a sync, and a plugin of the workspace changed by a sync
stops until it is enabled again.

To develop a plugin, use **Develop…** instead of Install from Folder: the folder is watched, and when
its files change (once the writes pause) the plugin is installed again and reloaded: its open pages
and hidden frames load again, a trusted plugin is imported again. It is marked *Dev*; **Stop Dev**
keeps it installed as it is. Development is on this device only (keeping it in the workspace
stops it). If it can't be installed again (e.g. `manifest.json` is gone for a moment), the error
is shown under it and the last version installed keeps running; a `manifest.json` that can't be
read is installed, and shown as the error of the plugin.

Samples here:

- `csv-viewer/`: install it, enable it, then click a `.csv` file in the explorer.
- `tag-index/`: a view of the notes by tag; open it from the Plugins button of the side menu.
- `text-stats/`: a "Count words" button on the text selected, in the reader and the editor.
- `outline/`: a note mode, the headings of the note open as an outline to rename them; switch to
  it with its button by WYSIWYG, Markdown and MindMap above the note.
- `book-indent/`: a **trusted** plugin (see below): indents the paragraphs of books, and a view
  of the words of each note.
- `bars/`: draws ```` ```bars ```` code blocks (`label: number` lines) as a bar chart, in the editor
  and in the published site; its command "How to write bars" is in the Plugins menu.

## manifest.json

```json
{
  "id": "csv-viewer",
  "name": "CSV Viewer",
  "version": "0.1.0",
  "minAppVersion": "0.8.0",
  "description": "Shows .csv files as a table.",
  "main": "index.html",
  "permissions": ["file:read", "file:write"],
  "contributes": {
    "viewers": [{ "extensions": ["csv", "tsv"], "title": "Table" }]
  }
}
```

- `id`: lowercase letters, digits, `.`, `_`, `-`; it is the name of the installed folder.
- `permissions`: `file:read`, `file:write` (the file the plugin opens), `notes:read`, `notes:write`,
  `books:read`, `issues:read`, `net` (`https:` and `wss:` from the page). The user can grant fewer.
- `contributes.viewers`: the plugin opens files of these extensions (not notes or books).
- `contributes.views`: `[{ "id": "stats", "title": "Reading Stats", "page": "stats.html" }]`, views of the
  whole workspace, in the Plugins menu of the side menu; `page` is the main page by default.
- `contributes.codeBlocks`: `["plantuml"]`, the languages of the code blocks it draws (see below).
- `contributes.selectionActions`: `[{ "id": "explain", "title": "Explain", "where": ["reader"] }]`,
  buttons on the text selected (see below); `where` is `reader`, `editor` or both (default).
- `contributes.commands`: `[{ "id": "today", "title": "Stats of today" }]`, in the Plugins menu of
  the side menu (see below).
- `contributes.noteModes`: `[{ "id": "cards", "title": "Cards", "page": "cards.html" }]`, modes of
  the note open, beside WYSIWYG, Markdown and MindMap; its page shows in place of the editor (see
  below). `page` is the main page by default.
- `mode`: `sandboxed` (default), or `trusted` (see the end). For a trusted plugin `main` is its ES
  module, `main.js` by default, and `permissions` are not asked: it has them all.

## The page

The page runs in a sandboxed iframe (`allow-scripts` only, no dialogs) with a strict CSP: scripts,
styles, images and fonts come from the plugin folder (inline is allowed). The page can `fetch` files
of its folder, and run WebAssembly: `WebAssembly.instantiateStreaming(fetch('app.wasm'))`. A bundled
app (React with Vite, say) works too, `type="module"` scripts included: build it with relative paths
(`base: './'`) into the plugin folder. It talks to the app by messages; `packages/plugin-api` (`@mdsilo/plugin-api`) has their types and a
small client (`createClient`, `app.call`, `app.on`, `app.handle`), see its README:

```js
// call: answered with { mdsilo: 1, id, result } or { mdsilo: 1, id, error }
parent.postMessage({ mdsilo: 1, id: 1, method: 'file.read' }, '*');
// events from the app: { mdsilo: 1, event, data }
```

| Method | Permission | Gives |
|---|---|---|
| `app.info` | | `{ id, version, permissions }` |
| `app.style` | | `{ theme, dark, vars, font }`: the daisyUI variables of the theme and the editor font |
| `file.info` | | `{ name, ext }` of the file opened |
| `file.read` | `file:read` | the text of the file |
| `file.write` `{ text }` | `file:write` | `true` |
| `file.readBytes` | `file:read` | the file as a `Uint8Array` (images, databases, any file not of text) |
| `file.writeBytes` `{ data }` | `file:write` | `true`; `data` a `Uint8Array` or an `ArrayBuffer` |

Views (not file viewers) also have, with paths relative to the workspace; only the notes the app
knows can be read or written, not other files:

| Method | Permission | Gives |
|---|---|---|
| `view.info` | | `{ id }` of the view shown |
| `notes.list` `{ folder?, tag? }` | `notes:read` | `[{ path, title, created, updated, tags, links }]` |
| `notes.read` `{ path }` | `notes:read` | the text of the note |
| `notes.write` `{ path, text, create? }` | `notes:write` | `true`; the note must exist, or with `create: true` a new Markdown note is made (folders as needed; not over a file the app doesn't know, not in a hidden folder) |
| `notes.backlinks` `{ path }` | `notes:read` | the paths of the notes linking to it |
| `notes.search` `{ query, limit? }` | `notes:read` | `[{ path, title, snippets }]`: the full-text search of the app, the blocks with the words (up to 5 a note); `limit` 50 by default, 300 at most |
| `notes.graph` | `notes:read` | `{ nodes: [{ path, title, tags }], links: [{ from, to }], unresolved: [{ from, title }] }`: the links between notes, resolved by title as the Graph does |
| `books.list` | `books:read` | `[{ path, title, author, format, added, group, status, language, subjects }]` |
| `issues.list` | `issues:read` | `[{ number, title, body, state, labels, milestone, due, created, updated, closed, notes }]` |
| `app.open` `{ note }`, `{ book }` or `{ issue }` | | opens it in the app |

Note modes have, for the note open only:

| Method | Permission | Gives |
|---|---|---|
| `note.info` | | `{ title, readOnly }`: `readOnly` in the read mode of the app |
| `note.read` | `notes:read` | the text of the note |
| `note.write` `{ text }` | `notes:write` | `true`; saved as the editor saves, once the writes pause |

| Event | When |
|---|---|
| `style` | the theme or the font changed; data as `app.style` |
| `file.changed` | the file was changed by another app or a sync (not by the plugin) |
| `note.changed` | the note was changed by another app or a sync (not by the plugin); read it again |
| `notes.changed` | views: notes were edited (in the app too), made, renamed or deleted; `{ paths }`, once the changes pause |
| `files.changed` | views: files of the workspace changed on the disk; `{ paths, event }` as the watcher saw them (not hidden folders) |

## Drawing code blocks

A plugin with `contributes.codeBlocks` has its main page loaded in a hidden frame, and is asked to
draw each code block of its languages:

```js
// from the app: { mdsilo: 1, request: 7, method: 'code.render', params: { lang, code, dark } }
// answer with SVG or HTML; scripts, <style> and forms are removed
parent.postMessage({ mdsilo: 1, reply: 7, result: '<svg>…</svg>' }, '*');
// or: parent.postMessage({ mdsilo: 1, reply: 7, error: 'Bad syntax' }, '*');
```

The app waits 15 seconds for an answer. For a published site each block is asked twice, with
`dark: false` and `dark: true`; the site shows the one of the reader's color scheme.

## Actions on the text selected

The button of a `selectionActions` entry asks the main page, in the same hidden frame:

```js
// { mdsilo: 1, request, method: 'selection.action', params: { action, text, where, lang } }
// answer text, or { html } to show (sanitized: no scripts, styles or forms)
parent.postMessage({ mdsilo: 1, reply: request, result: { html: '<p>…</p>' } }, '*');
```

In the reader, the answer shows in a popup by the text, with a button to keep it as the note of a
highlight. In the editor, it shows in a dialog, to insert after the text or copy; or the plugin
changes the text itself by answering `{ replace: '…' }` (in place of the text selected) or
`{ insert: '…' }` (after it), in the editor only.

## Commands

A command of `commands` asks the main page, in the same hidden frame:

```js
// { mdsilo: 1, request, method: 'command.run', params: { command } }
// answer nothing, text, or { html } to show in a dialog (sanitized)
parent.postMessage({ mdsilo: 1, reply: request, result: { html: '<p>…</p>' } }, '*');
```

The hidden frame has `app.info` and `app.style` only: commands can't read notes yet.

See `csv-viewer/index.html` for a small client.

## Trusted plugins

`"mode": "trusted"` runs the plugin in the app itself, not in a sandbox. It can do anything the
app can: read and write any file, reach the internet, change the app. Use it only for what a
sandboxed plugin can't do; the user is warned before enabling it, and trusted plugins are listed
apart in Manage Plugins.

`main` is an ES module that exports `activate(api)` (or a default function), and may export
`deactivate()`. `api` (`TrustedApi` of `@mdsilo/plugin-api`) has:

- `api.call(method, params)`: the methods of the tables above for views (`notes.*`, `books.list`,
  `issues.list`, `app.open`, `app.info`, `app.style`), no permission asked.
- `api.handle(request, handler)`: answers `code.render`, `selection.action`, `command.run`, as the
  main page of a sandboxed plugin does; declare them in `contributes` as well.
- `api.page(name, mount)`: draws a page of the plugin into the app, in place of a frame: the
  `page` of a view or a note mode, or `main` (a viewer, or one with no `page`). `mount(element,
  page)` gets the element and `page.call` / `page.on` with the methods and events of that place
  (`file.read`, `note.write`, `note.changed`…); it may give a function to run when it closes.
- `api.editor.addExtension(ext)`: an extension of the editor, made from `api.editor.Extension`
  (mdsmirror): nodes, marks, ProseMirror plugins, input rules. The editor is made again with it.
- `api.reader.addStyles(css)`: CSS for the pages of the books, after the styles of the app.
- `api.onUnload(fn)`: run when the plugin is disabled, uninstalled, or installed again.

- `api.contribute(kind, item)`: adds, as the plugin runs, what its manifest could have declared:
  `api.contribute("commands", { id, title })`, `("codeBlocks", "lang")`, `("views", { id, title,
  page })`… answered by `handle` and `page` as the declared ones.

Each of `handle`, `page`, `contribute`, `addExtension`, `addStyles` gives a function to take it
back. All of them are taken back when the plugin unloads. A trusted plugin may also have a page
named `settings`: Manage Plugins shows it under a Settings button.

## Obsidian plugins (partial)

A folder of an Obsidian plugin (`manifest.json`, `main.js`, maybe `styles.css`) installs as it is:
its manifest is known by `isDesktopOnly`, and it runs as a trusted plugin (with the same warning),
marked "Obsidian (partial)". `main.js` is served as a module (the app runs no `eval`), and
`require("obsidian")` gets a layer over the API of mdSilo (`src/plugins/obsidian`):

- `Plugin`: `onload`/`onunload`, `loadData`/`saveData` (`data.json` in its folder, left out of the
  check for changes by a sync), `addCommand` (`callback`, `checkCallback`) and `addRibbonIcon` (both
  in the Plugins menu), `registerMarkdownCodeBlockProcessor` (in the editor and published sites),
  `registerView` + `ItemView` (views in the Plugins menu, `workspace.getLeaf().setViewState`),
  `addSettingTab` + `PluginSettingTab` + `Setting` (text, text area, toggle, slider, dropdown,
  button), `register*` cleanups.
- `app.vault` (the notes: `getMarkdownFiles`, `read`, `modify`, `process`, `adapter`),
  `app.metadataCache` (tags and links), `app.workspace` (`getActiveFile`, `file-open`,
  `onLayoutReady`, `openLinkText`), `Notice`, `Modal`, `MarkdownRenderer`, `requestUrl`,
  `normalizePath`, `debounce`, `Platform`, and the DOM helpers (`createEl`, `createDiv`, `empty`…).

Not there: anything of Obsidian's editor (`editorCallback`, `registerEditorExtension`,
`MarkdownView` internals; mdSilo's editor is ProseMirror, not CodeMirror), its layout of leaves and
splits, `registerExtensions`, `vault.create`, `moment`, and its internals. So small plugins (code
block renderers, commands, simple views and settings) run; big ones (Dataview, Excalidraw, Kanban,
Templater) don't.
