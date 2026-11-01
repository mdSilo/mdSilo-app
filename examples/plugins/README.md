# mdSilo plugins

A plugin is a folder with a `manifest.json` and a page (`index.html` by default). Install it in
Settings → Plugins → Install from Folder, then enable it and choose what it may do. Plugins are
kept on each device: a plugin is never enabled by a sync.

Two samples here:

- `csv-viewer/`: install it, enable it, then click a `.csv` file in the explorer.
- `tag-index/`: a view of the notes by tag; open it from the Plugins button of the side menu.

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

See `csv-viewer/index.html` for a small client.
