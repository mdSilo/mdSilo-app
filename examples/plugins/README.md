# mdSilo plugins

A plugin is a folder with a `manifest.json` and a page (`index.html` by default). Install it from the
Plugins button of the side menu → Manage Plugins → Install from Folder, then enable it and choose
what it may do. Plugins are
kept on each device: a plugin is never enabled by a sync.

Two samples here:

- `csv-viewer/`: install it, enable it, then click a `.csv` file in the explorer.
- `tag-index/`: a view of the notes by tag; open it from the Plugins button of the side menu.
- `text-stats/`: a "Count words" button on the text selected, in the reader and the editor.
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
- `mode`: `sandboxed` (default). `trusted` plugins are not supported yet.

## The page

The page runs in a sandboxed iframe (`allow-scripts` only, no dialogs) with a strict CSP: scripts,
styles, images and fonts come from the plugin folder (inline is allowed). It talks to the app by
messages:

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

Views (not file viewers) also have, with paths relative to the workspace; only the notes the app
knows can be read or written, not other files:

| Method | Permission | Gives |
|---|---|---|
| `view.info` | | `{ id }` of the view shown |
| `notes.list` `{ folder?, tag? }` | `notes:read` | `[{ path, title, created, updated, tags, links }]` |
| `notes.read` `{ path }` | `notes:read` | the text of the note |
| `notes.write` `{ path, text }` | `notes:write` | `true`; the note must exist |
| `notes.backlinks` `{ path }` | `notes:read` | the paths of the notes linking to it |
| `books.list` | `books:read` | `[{ path, title, author, format, added, group, status, language, subjects }]` |
| `issues.list` | `issues:read` | `[{ number, title, body, state, labels, milestone, due, created, updated, closed, notes }]` |
| `app.open` `{ note }`, `{ book }` or `{ issue }` | | opens it in the app |

| Event | When |
|---|---|
| `style` | the theme or the font changed; data as `app.style` |
| `file.changed` | the file was changed by another app or a sync (not by the plugin) |

## Drawing code blocks

A plugin with `contributes.codeBlocks` has its main page loaded in a hidden frame, and is asked to
draw each code block of its languages:

```js
// from the app: { mdsilo: 1, request: 7, method: 'code.render', params: { lang, code, dark } }
// answer with SVG or HTML; scripts, <style> and forms are removed
parent.postMessage({ mdsilo: 1, reply: 7, result: '<svg>…</svg>' }, '*');
// or: parent.postMessage({ mdsilo: 1, reply: 7, error: 'Bad syntax' }, '*');
```

The app waits 15 seconds for an answer.

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
