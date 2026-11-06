# mdSilo plugins

A plugin is a folder with a `manifest.json` and a page (`index.html` by default). Install it from the
Plugins button of the side menu → Manage Plugins → Install Folder (or Install .zip: a
.zip of the folder, or of what is in it), then enable it and choose
what it may do. A plugin is kept on this device, or, with *Sync with workspace*, in
`.mdsilo/plugins/<id>/` and synced. Whether it is enabled, and with which permissions, stays on
each device: a plugin is never enabled by a sync, and a plugin of the workspace changed by a sync
stops until it is enabled again.

The app keeps where a plugin was installed from (its folder, or its .zip): its **Update** button in
Manage Plugins installs it again from there, to take what changed, enabled as it was. (The button
at the top only reads the plugins installed again.)

To develop a plugin, use **Develop** instead of Install Folder: the folder is watched, and when
its files change (once the writes pause) the plugin is installed again and reloaded: its open pages
and hidden frames load again, a trusted plugin is imported again. It is marked *Dev*; **Stop Dev**
keeps it installed as it is. Development is on this device only (keeping it in the workspace
stops it). If it can't be installed again (e.g. `manifest.json` is gone for a moment), the error
is shown under it and the last version installed keeps running; a `manifest.json` that can't be
read is installed, and shown as the error of the plugin.

Samples here:

- `csv-viewer/`: install it, enable it, then click a `.csv` file in the explorer.
- `tag-index/`: a view of the notes by tag; open it from the Plugins button of the side menu.
- `text-stats/`: a "Count words" button on the text selected, in the reader and the editor; its
  commands "Mark long paragraphs" and "Clear the paragraph marks" on the note open (`editor.*`).
- `outline/`: a note mode, the headings of the note open as an outline to rename them; switch to
  it with its button by WYSIWYG, Markdown and MindMap above the note.
- `book-indent/`: a **trusted** plugin (see below): indents the paragraphs of books, and a view
  of the words of each note.
- `bars/`: draws ```` ```bars ```` code blocks (`label: number` lines) as a bar chart, in the editor
  and in the published site; its command "How to write bars" is in the Plugins menu.
- `quote-card/`: a "Quote card" button on the text selected, in the reader and the editor: an image
  card of the text with the book or the note it is from, to copy, save, insert, or post (see
  Images).
- `speed-reader/`: a panel of the reader (its button in the header of the reader): the book read a
  word at a time (RSVP) from the page shown; the book behind it follows, the paragraph marked. And a
  note mode, "Speed read", for the note open (`note.blocks`).

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
- `icon`: its icon, a path in its folder: `"icon.svg"` (SVG, PNG, WebP, JPEG or GIF, square, shown
  at 16 to 24 px); in Manage Plugins, the Plugins menu, and the list of actions on the text
  selected. A puzzle piece if none.
- `permissions`: `file:read`, `file:write` (the file the plugin opens), `notes:read`, `notes:write`,
  `books:read`, `issues:read`, `reader:read` (the book open: where the reader is, its text, go to a
  place, mark text), `net` (`https:` and `wss:` from the page). The user can grant fewer.
- `contributes.viewers`: `[{ "extensions": ["csv"], "title": "Table", "page": "table.html" }]`, the
  plugin opens files of these extensions (not notes or books); `page` is the main page by default.
- `contributes.views`: `[{ "id": "stats", "title": "Reading Stats", "page": "stats.html" }]`, views of the
  whole workspace, in the Plugins menu of the side menu; `page` is the main page by default.
- `contributes.codeBlocks`: `["plantuml"]`, the languages of the code blocks it draws (see below).
- `contributes.selectionActions`: `[{ "id": "explain", "title": "Explain", "where": ["reader"] }]`,
  actions on the text selected (see below), in a list under the Plugins button of its toolbar, with
  the icon and the name of the plugin; `where` is `reader`, `editor` or both (default).
- `contributes.commands`: `[{ "id": "today", "title": "Stats of today" }]`, in the Plugins menu of
  the side menu (see below).
- `contributes.noteModes`: `[{ "id": "cards", "title": "Cards", "page": "cards.html" }]`, modes of
  the note open, beside WYSIWYG, Markdown and MindMap, with the icon of the plugin (more than two
  of them: in a list under one button); its page shows in place of the editor (see below). `page`
  is the main page by default.
- `contributes.readerPanels`: `[{ "id": "rsvp", "title": "Speed reading", "placement": "overlay" }]`,
  panels of the reader, from a button in its header with the icon of the plugin (more than two of
  them: in a list under one button): its page over the book (`overlay`, by default) or beside it
  (`side`); see below. `page` is the main page by default.
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
| `app.openUrl` `{ url }` | | `true`; opens an `http:` or `https:` page in the browser, one a second at most; the hidden main page may only while it answers an action or a command |
| `markdown.render` `{ text }` | | the HTML of the Markdown, as the app reads it; sanitized (no scripts, styles or forms) |
| `file.info` | | `{ name, ext, path }` of the file opened; `path` relative to the workspace, if in it |
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

Note modes have, for the note open only, and `app.open` as views:

| Method | Permission | Gives |
|---|---|---|
| `note.info` | | `{ title, readOnly, path, tags, created, updated }`: `readOnly` in the read mode of the app; `path` and the rest if the note is in the workspace |
| `note.read` | `notes:read` | the text of the note |
| `note.blocks` `{ from?, count? }` | `notes:read` | `{ blocks: [{ index, text }], next? }`: its blocks of text (paragraphs, headings, items…) from `from` (0) on, `count` of them (50, 500 at most) |
| `note.write` `{ text }` | `notes:write` | `true`; saved as the editor saves, once the writes pause |

| Event | When |
|---|---|
| `style` | the theme or the font changed; data as `app.style` |
| `file.changed` | the file was changed by another app or a sync (not by the plugin) |
| `note.changed` | the note was changed by another app or a sync (not by the plugin); read it again |
| `notes.changed` | views: notes were edited (in the app too), made, renamed or deleted; `{ paths }`, once the changes pause |
| `files.changed` | views: files of the workspace changed on the disk; `{ paths, event }` as the watcher saw them (not hidden folders) |
| `reader.relocated` | panels of the reader: the page shown changed; data as `reader.info` |

## The note open in the editor

The hidden main page (an action, a command) and trusted plugins can act on the note open in the
editor (WYSIWYG), by its blocks of text: its paragraphs, headings, items… numbered from 0, as
`note.blocks` gives them.

| Method | Permission | Gives |
|---|---|---|
| `editor.info` | `notes:read` | `{ note, block, blocks }`: the note (as `notes.list`), the block of the cursor, how many there are; `null` if no note is open in the editor |
| `editor.blocks` `{ from?, count? }` | `notes:read` | `{ blocks: [{ index, text }], next? }` from `from` (`"current"`, the block of the cursor, by default; or a number) on |
| `editor.goTo` `{ block }` | `notes:read` | `true`; the cursor at the start of the block, shown |
| `editor.mark` `{ block, color? }` | `notes:read` | `true`; a color behind the block (`yellow`, `red`, `green`, `blue`, `violet`), not in the note: it follows the edits, gone when the note closes |
| `editor.clearMarks` | `notes:read` | `true`; takes back the marks of the plugin |

## Panels of the reader

A panel of `readerPanels` opens from the header of the reader: its page over the book, or beside it,
under a bar with its name and a close button; one at a time, closed with the book. Its page gets the
keys once open (Escape is the plugin's to handle: call `panel.close`). It has the methods of views,
`panel.info` (`{ id }`), `panel.close`, and those of the book open, which the hidden main page has
too (for an action or a command on the book):

| Method | Permission | Gives |
|---|---|---|
| `reader.info` | `reader:read` | `{ path, title, author, chapter, cfi, fraction }` of the book open and the page shown; `null` if none |
| `reader.blocks` `{ from?, count? }` | `reader:read` | `{ blocks: [{ cfi, text }], next? }`: the paragraphs, headings, items… of the book from `from` (`"current"`, the page shown, by default; or a CFI) on, across chapters, `count` of them (50 by default, 500 at most); `next` to go on from, none at the end |
| `reader.goTo` `{ cfi }` | `reader:read` | `true`; shows that place |
| `reader.mark` `{ cfi, color? }` | `reader:read` | `true`; marks the text (`yellow`, `red`, `green`, `blue`, `violet`) while the book is open, not kept as a highlight |
| `reader.clearMarks` | `reader:read` | `true`; takes back the marks of the plugin |

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
// { mdsilo: 1, request, method: 'selection.action', params: { action, text, where, lang, … } }
// answer text, { html } to show (sanitized: no scripts, styles or forms), or { image } (see Images)
parent.postMessage({ mdsilo: 1, reply: request, result: { html: '<p>…</p>' } }, '*');
```

With the text the plugin is given where it is: in the editor `markdown`, the text selected as
Markdown (its bold, links, math), and `note`, the note (as `notes.list` gives it) if the plugin
may read notes; in the reader `book`, `{ path, title, author, chapter, cfi }` (`cfi` the text
selected), if it may read books. A book synced with the workspace's git repo on GitHub, GitLab or
Gitea also has `url`, the book file there, and `readUrl`, a link that opens it at `cfi` in the web
app (`https://mdsilo.github.io/mdSilo-app/?read=<url>&cfi=<cfi>`): who opens it is asked, and the
book is downloaded into `reading/` of their workspace and opened there, the text at `cfi` marked
(not kept as a highlight). It works for others if the repo is public.

In the reader, the answer shows in a popup by the text, with a button to keep it as the note of a
highlight; with `highlight: true` beside the text, HTML or image answered, the text selected is
highlighted at once, as the user would (`quote-card` does, for the text it quotes). In the editor, it shows in a dialog, to insert after the text or copy; or the plugin
changes the text itself by answering `{ replace: '…' }` (in place of the text selected) or
`{ insert: '…' }` (after it), in the editor only.

## Images

An action or a command may answer an image, e.g. a card drawn on a canvas:

```js
canvas.toBlob((blob) =>
  parent.postMessage({ mdsilo: 1, reply: request, result: { image: blob, name: 'quote.png', alt: 'A quote of Dune' } }, '*'),
);
```

`image` is a `Blob`, a `Uint8Array`, an `ArrayBuffer` or a `data:` URL, of a PNG, JPEG, WebP, GIF or
SVG (known by its bytes, not by the type said), 20 MB at most. The app shows it with its own
buttons, as the page of the plugin can't reach the clipboard or the files: **Copy** (as PNG),
**Save…**, **Share** (where the system has a share sheet: macOS, iOS, Android) and, for an action in
the editor, **Insert**: saved in `assets/` of the notes (a new name if taken) and put after the
paragraph of the text, as `![alt](./assets/quote.png)`.

With `links: [{ title, url }]` (4 at most, `http:` or `https:`), it has buttons to open those pages
too, e.g. to post it: `https://bsky.app/intent/compose?text=…`. Such a page takes text, not an
image: copy the image first, then paste it there. `quote-card` puts the `readUrl` of the book in
what it posts, and a button to open it.

## Commands

A command of `commands` asks the main page, in the same hidden frame:

```js
// { mdsilo: 1, request, method: 'command.run', params: { command, note?, book? } }
// answer nothing, text, { html } (sanitized) or { image } (see Images) to show in a dialog
parent.postMessage({ mdsilo: 1, reply: request, result: { html: '<p>…</p>' } }, '*');
```

A command is given what is shown, as an action is: `note` (with `notes:read`) or `book` (with
`books:read`, `cfi` the page shown). The hidden frame has the methods of views (`notes.read`,
`notes.write`, `books.list`, `app.open`…), each with its permission, to read the whole note, say.

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
  check for changes by a sync), `addCommand` (`callback`, `checkCallback`, and `editorCallback`,
  `editorCheckCallback` on the note open) and `addRibbonIcon` (both in the Plugins menu),
  `registerEditorExtension` (CodeMirror extensions, in the Markdown mode of notes;
  `require("@codemirror/state" | "view" | "language" | "commands")` and `@lezer/highlight` give the
  app's own), `registerMarkdownCodeBlockProcessor` (in the editor and published sites),
  `registerView` + `ItemView` (views in the Plugins menu, `workspace.getLeaf().setViewState`),
  `registerExtensions` + `FileView`/`TextFileView` (the files of those extensions open in the view;
  `vault.read`/`modify`, `readBinary`/`modifyBinary` for that file; reloaded when it changes),
  `addSettingTab` + `PluginSettingTab` + `Setting` (text, text area, toggle, slider, dropdown,
  button), `register*` cleanups.
- `app.vault` (the notes: `getMarkdownFiles`, `read`, `modify`, `process`, `append`, `create`
  (Markdown notes), `createFolder`, `adapter`), `app.metadataCache` (tags, links and front matter,
  `resolvedLinks`), `app.fileManager.processFrontMatter`, `app.workspace` (`getActiveFile`,
  `file-open`, `onLayoutReady`, `openLinkText`, `getActiveViewOfType(MarkdownView)`,
  `activeEditor`), an `Editor` (`getValue`/`setValue`, lines, `getCursor`, `getSelection`,
  `replaceSelection`, `replaceRange`, `offsetToPos`…): over the CodeMirror of the Markdown mode, or,
  as WYSIWYG, over the text of the note (the selection found in it; saved after the command, the
  note shown again), `Notice`, `Modal`, `MarkdownRenderer`,
  `requestUrl`, `normalizePath`, `debounce`, `moment` (also `window.moment`), `parseYaml`,
  `stringifyYaml`, `Platform`, and the DOM helpers (`createEl`, `createDiv`, `empty`…).

Also: `Menu` (a simple list at the mouse), `Keymap.isModEvent`, `MarkdownRenderChild` (loaded with
the code block), `parseFrontMatterTags`, `sanitizeHTMLToDom`, `prepareSimpleSearch`, and the editor
fields `editorInfoField`/`editorLivePreviewField` (null and false). `registerEditorSuggest`,
`EditorSuggest`, `AbstractInputSuggest` and `registerObsidianProtocolHandler` are accepted but do
nothing. A code block is drawn in the page out of sight (720 px wide); its canvases (charts) are
taken as images once drawn (about a second).

Not there: the WYSIWYG editor for editor extensions (it is ProseMirror, not CodeMirror; they run in
the Markdown mode only), `MarkdownView` internals, its layout of leaves and splits, and its
internals. So small plugins (code
block renderers, commands, simple views and settings) run; big ones (Dataview, Excalidraw, Kanban,
Templater) don't.

### Known plugins

Checked by reading their released `main.js` against this layer (which modules they `require`, which
of Obsidian's API they use), **not run in the app yet** (2026-11-02):

| Plugin | Version | Expected |
|---|---|---|
| Kroki (`obsidian-kroki`) | 1.3.1 | works: diagram code blocks as SVG from kroki.io (`net`) |
| Charts (`obsidian-charts`) | 3.9.0 | works: `chart` code blocks, drawn as images |
| Vega (`obsidian-vega`) | 0.1.1 | works: `vega`/`vega-lite` code blocks, drawn as images |
| Smart Typography (`obsidian-smart-typography`) | 1.0.18 | works in the Markdown mode (an editor extension) |
| Natural Language Dates (`nldates-obsidian`) | 0.6.4 | partly: its commands; not the `@` suggestions |
| Better Word Count, Reading Time | 0.10.1, 1.1.2 | load; their status bar items show nowhere |
| Hider (`obsidian-hider`) | 1.7.1 | loads; hides parts of Obsidian, none of mdSilo |
| Calendar (`calendar`) | 2.0.0 | unknown: a side view, relies on Obsidian's daily notes |
| Auto Link Title, Paste URL into selection | 1.5.5, 1.11.4 | no: they need Electron or Node (`path`) |
| PlantUML (`obsidian-plantuml`) | 1.9.0 | no: needs `@codemirror/search`, `FileSystemAdapter` |
| Dataview, Admonition, Outliner | 0.5.68, 12.0.11, 4.10.2 | no: post processors, live preview, Obsidian's editor |

