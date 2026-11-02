# @mdsilo/plugin-api

Types and a small client for [mdSilo](https://mdsilo.com) plugins: the manifest, the methods the
app answers, its events, and what it asks of a plugin. The app itself uses these types, so they
are what it does. How plugins work, with samples: [examples/plugins](../../examples/plugins/README.md).

## Use it

In a bundled plugin (Vite, esbuild…), import it:

```ts
import { createClient, followStyle } from "@mdsilo/plugin-api";

const app = createClient();
await followStyle(app); // the theme variables of the app on the page, now and on changes

const text = await app.call("file.read"); // typed: Promise<string>
app.on("file.changed", async () => show(await app.call("file.read")));
```

In a plain page, build the client once and copy it into the plugin folder (the page may load
scripts of its own folder only):

```sh
pnpm --filter @mdsilo/plugin-api build   # dist/mdsilo-plugin.js and dist/types/
```

```html
<script type="module">
  import { createClient } from "./mdsilo-plugin.js";
  const app = createClient();
</script>
```

## The client

- `createClient({ timeout? })`: talks to `window.parent`. `timeout` (ms) rejects a call with no
  answer; none by default.
- `app.call(method, params?)`: calls a method of the app, see `Methods` for each method, its params,
  its result and the permission it needs. A call the user did not permit rejects with
  `Not permitted: <permission>`.
- `app.on(event, listener)`: `style`, `file.changed`, `note.changed`; gives the function to stop.
- `app.handle(request, handler)`: answers what the app asks the main page: `code.render`,
  `selection.action`, `command.run` (see `Requests`). What the handler returns, or a promise of it,
  is the answer; what it throws is the error.
- `app.close()`: stops listening; calls waiting are rejected.
- `applyStyle(style, element?)` and `followStyle(app, element?)`: the daisyUI variables of the theme
  (`--color-base-100`, `--color-primary`…), the color scheme and the font of the app on the page,
  so that `background: var(--color-base-100)` looks like the app.

A sandboxed page has no other way to the app: no Tauri, no storage of the app. Only the methods
of the place it shows in are there (a file viewer, a view, a note mode, the hidden main page),
see the tables in [examples/plugins](../../examples/plugins/README.md).

## Types

- `ManifestJson`: `manifest.json` as written; `PluginManifest`: as the app reads it, defaults
  filled in.
- `Permission`, `PERMISSIONS`.
- `Methods`, `Events`, `Requests`, and `NoteInfo`, `BookInfo`, `IssueInfo`, `PluginStyle`.
- The messages themselves (`CallMessage`, `AnswerMessage`, `EventMessage`, `RequestMessage`,
  `ReplyMessage`), to talk to the app without the client.

MIT licensed, so plugins can use it whatever their license.
