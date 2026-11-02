# Customization: fonts, themes, plugins

## Context

Users want to make mdSilo their own: add their own fonts for reading and writing, define a color theme, and extend the app with plugins (new viewers for file types, editor/reader enhancements, new workspace-wide views). Today:

- Fonts are hard-coded: `FONTS` in `src/shell/settings/EditorSettings.tsx` (Sniglet, RobotoMono, IBMPlexSerif, KaTeX_SansSerif); reader `font: 'book' | 'serif' | 'sans-serif'` with fixed stacks `SERIF`/`SANS` in `src/reader/styles.ts`.
- Themes: daisyUI 5, built-in list in `src/lib/themes.ts`, CSS in `src/styles/styles.css`. Most app UI already uses semantic colors, but hard-coded colors remain: mdsmirror `packages/mdsmirror/src/styles/theme.ts` (~49) and `editor.ts` (~28), CodeMirror `src/writer/md/darkTheme.ts` (One Dark), `src/insight/ForceGraph.tsx`, reader page colors `src/reader/styles.ts` (`themeColors`), plus a few Tailwind literals (`src/issue/common.tsx` purple, `src/ui/BaseModal.tsx` gray overlay, `src/reader/components/BookPopups.tsx`, MediaViewer black overlays — those overlays are fine to keep).
- No plugin system. Views are a static `VIEWS` map in `src/shell/MainView.tsx`; `ViewAction` union in `src/state/viewReducer.ts`. Tauri CSP `script-src 'self' 'wasm-unsafe-eval'`.

Decisions (confirmed):
- **Storage, default mixed:** themes in the workspace (`.mdsilo/themes.json`, synced); fonts and plugins per device (app data). Each item can be moved to the other place by the user ("Sync with workspace" toggle).
- **Plugins, tiered:** sandboxed iframe by default; a `trusted` mode (explicit confirmation) loads in-process for deep editor/reader hooks.

Order: Fonts → Themes (de-hardcode first) → Plugin core + viewers → views → enhancers → (later) Obsidian shim. Each phase is its own branch, reviewed before commit (per commit policy); `docs/roadmap.md` updated at each milestone.

---

## Shared: customization storage (`src/custom/store.ts`)

One small module handles "device vs workspace" for all three kinds:

- Device: `<appData>/custom/{fonts,plugins}/…` (Tauri `appDataDir`); index kept in user settings (`src/state/userSettings.ts`, persisted, bump persist version + migration).
- Workspace: `.mdsilo/themes.json` (all themes of the workspace in one file), `.mdsilo/fonts/<file>` + `.mdsilo/fonts.json`, `.mdsilo/plugins/<id>/`. Reuse `WorkspaceFs` / existing write helpers in `src/workspace/write.ts` (atomic writes, watcher skips own writes).
- `moveTo(item, 'device' | 'workspace')` copies + updates the index. Merge rule when both exist: workspace wins for themes, device wins for plugins (never auto-enable code that arrived through sync — see Plugins).
- Web build: device storage = IndexedDB (fonts as blobs); workspace storage via the web `WorkspaceFs`.

---

## Phase 1 — Custom fonts

**Model** (`src/custom/fonts.ts`):
```ts
type CustomFont = { id: string; family: string; files: { path: string; weight?: string; style?: string }[]; where: 'device' | 'workspace' };
```
Also allow a "system font" entry (family name only, no file), since many users just want an installed font.

**Loading:** read bytes (Tauri fs / IndexedDB) → `new FontFace(family, buffer, {weight, style})` → `document.fonts.add`. Platform-independent, no asset-protocol scope changes. Keep blob URLs for the reader iframes (below).

**Global settings UI:** new "Fonts" section in `SettingsModal.tsx`: import .ttf/.otf/.woff/.woff2 (use `openFileDilog` in `src/workspace/open.ts`), family name (default from file name), preview line, remove, "Sync with workspace" toggle.

**One font list for reader and editor** (`useFontOptions()` in `src/custom/fonts.ts`, and one `<FontSelect>` component in `src/ui/`):
- Groups: *Generic* (Serif, Sans-serif, Monospace — the stacks now in `reader/styles.ts` move here), *Bundled* (Sniglet, RobotoMono, IBMPlexSerif…), *System* (installed fonts by name; Tauri: list via a small Rust command using `fontdb`, pure Rust (`font-kit` was planned, left out: it links fontconfig and freetype), web: free-text family), *Custom* (imported files). The reader adds one extra entry, *As the book says*.
- A font value is a single string id (`generic:serif`, `bundled:Sniglet`, `system:Noto Serif`, `custom:<id>`) resolved by one `fontFamilyOf(id)` → CSS `font-family` stack; old values (`''`, `'Sniglet'`, `'serif'`…) are migrated.
- Settings that use it: editor font + new editor code font (mdsmirror `fontFamilyMono`); reader body font + optional CJK/fallback font (readup/Readest does this — check its code and port what fits).

**Consumers:**
- Editor: `EditorSettings.tsx` drops its own `FONTS` and uses `<FontSelect>`; the resolved family is passed to mdsmirror as today.
- Reader: `ReaderSettings.font` in `src/reader/settings.ts` becomes the shared id type (plus `book`); `bookStyles()` in `src/reader/styles.ts` uses `fontFamilyOf` and, for custom fonts, emits `@font-face { src: url(blob:…) }` (`document.fonts` doesn't reach foliate's iframes). `lookKey` already re-lays out on font change.

**Tests:** `fonts.test.ts` (model, family resolution, css generation), extend `styles.test.ts`, `settings.test.tsx`.

---

## Phase 2 — Custom themes

### 2a. Remove hard-coded colors (prerequisite, no user-visible change)
- **mdsmirror:** the app already passes a partial `theme` (`EDITOR_THEME` in `src/lib/themes.ts`). Extend `EDITOR_THEME` to map every color key of `packages/mdsmirror/src/styles/theme.ts` to daisyUI vars (`var(--color-base-content)`, `color-mix(in oklch, var(--color-base-content) 60%, transparent)` for secondary text, `--color-primary` for link/hashtag, etc.). mdsmirror keeps its own hex defaults so it stays standalone (stories).
- **CodeMirror:** replace One Dark constants in `src/writer/md/darkTheme.ts` with one theme built from daisy vars (base colors) + a syntax palette that uses `--color-primary/secondary/accent/info/success/warning/error`; same theme for light and dark.
- **Graph** (`ForceGraph.tsx`): canvas can't use CSS vars → read them with `getComputedStyle(document.documentElement)` and re-read on theme change (`useTheme` already knows when it changes).
- **Reader** `themeColors()` page theme `auto`: read `--color-base-100/base-content/primary` from the computed style instead of fixed light/dark values. Sepia/gray/dark page themes stay as they are.
- Literals: `issue/common.tsx` purple → `bg-secondary text-secondary-content` (or a "closed" token), `BookPopups` check icon, `BaseModal` overlay → `bg-base-content/40`. Highlight colors (`reader/highlight.ts`) stay user-chosen.
- Add a lint-style test that greps `src/**/*.tsx` for `(bg|text|border)-(gray|red|…)-\d` outside an allow-list, so new literals don't creep back.

### 2b. User-defined themes
- **Model** (`src/custom/themes.ts`): `{ id, name, dark: boolean, vars: Record<string,string> }` — the same variables as a daisyUI theme (colors, `--radius-*`, `--size-*`, `--border`, `--depth`, `--noise`).
- **Applying:** daisyUI 5 themes are just CSS variables under `[data-theme=…]`, so no Tailwind rebuild is needed: inject one `<style id="custom-themes">` with `[data-theme="user-<id>"]{color-scheme:…; --color-…}` per theme. `THEMES` becomes built-ins + custom (a store selector); `resolveTheme` and `useTheme` handle `user-*` ids and the `dark` flag (drives `darkMode`, mdsmirror `dark`, `.dark` class).
- **Editor UI** (Settings → Themes → New/Edit): start from any theme (copy its computed vars), color pickers for the ~20 color tokens with pairs shown together (primary/primary-content…), radius/border sliders, live preview (apply to the app while editing, revert on cancel), contrast warning for content-on-color pairs. Import/export: paste the CSS block from the daisyUI theme generator (`--color-x: value;` lines) or JSON.
- **Storage:** `.mdsilo/themes.json` by default (synced); toggle to keep on device only (user settings `customThemes`).

**Tests:** css generation, import parser, `resolveTheme` with custom themes, theme switch flows (`settings.test.tsx`).

---

## Phase 3+ — Plugins

### Package format
```
<plugin-id>/
  manifest.json   { id, name, version, minAppVersion, author, mode: "sandboxed" | "trusted",
                    permissions: ["file:read", "notes:read", "notes:write", "books:read", "issues:read", "net"],
                    contributes: { viewers, views, codeBlocks, selectionActions, commands, themes, fonts } }
  index.html / main.js, assets…
```
Installed per device (`<appData>/custom/plugins/`) by default; can be put in `.mdsilo/plugins/` to sync. **A plugin that arrives through sync is never enabled automatically**: the enabled set + granted permissions live in device-only settings, and the user enables it on each device after seeing its permissions. Themes/fonts in `contributes` let a plugin ship them declaratively (no code).

### Runtime, sandboxed (default)
- Tauri: register a URI scheme (`register_uri_scheme_protocol("mdsplugin")`) in `src-tauri` that serves `mdsplugin://<id>/<path>` from the plugin dir with its own strict CSP (no `ipc:`; `connect-src` is the plugin scheme, plus `https: wss:` only if `net` granted; `Access-Control-Allow-Origin: *` so the opaque-origin iframe can `fetch` its own files, e.g. `.wasm`, and load module scripts). Add `mdsplugin:` to `frame-src` in `tauri.conf.json` CSP.
- Host: `<iframe sandbox="allow-scripts" src="mdsplugin://…">` (opaque origin, no Tauri IPC). `src/plugins/host.ts` speaks a small JSON-RPC over `postMessage`, checks each call against granted permissions, and pushes theme vars + font list so plugins can match the app look.
- A tiny `@mdsilo/plugin-api` (types + client, in `packages/plugin-api`) for authors.
- Web build: same iframe with a blob/srcdoc document; defer until desktop works.

### Runtime, trusted (opt-in)
- Loaded in-process as an ES module (via the same scheme; needs `mdsplugin:` in `script-src`, only added when at least one trusted plugin is enabled — or always, since sandboxed iframes can't escape anyway). Gets a JS API object with direct hooks: mdsmirror extensions (ProseMirror plugins / markdown-it rules — mdsmirror already accepts extra markdown-it plugins for `renderToHtml`), reader hooks (book styles, foliate events), and register functions for viewers/views as React components.
- Enabling shows a clear warning ("full access to your files"); listed separately in the plugin manager.

### Extension points (sandboxed API; trusted gets the same plus direct hooks)
1. **File viewers** (`contributes.viewers: [{ extensions: ["csv"], title }]`) — per-file, phase 3.
   - New `ViewAction` `{ view: 'plugin-file'; plugin: string; path: string }` + `PluginFileView` in `VIEWS`. The sidebar file click (`src/shell/sidebar/SidebarNoteLink.tsx`) routes by extension: md → editor, books → reader, plugin-registered ext → plugin viewer; "Open with…" menu when several match.
   - API: `file.read()`, `file.write()` (only the opened file; `write` permission), `onFileChanged` (from the watcher).
   - Good first plugins to validate: CSV table viewer, JSON tree, Excalidraw/drawio viewer.
2. **Workspace views** (`contributes.views: [{ id, title, icon }]`) — phase 4.
   - `{ view: 'plugin'; plugin: string; viewId: string }`; entry in SideMenu (a "Plugins" group) and in `STARTUP_VIEWS`.
   - API (permission-gated): `notes.list/query` (backed by the existing index `src/lib/linkIndex.ts` + full-text search), `notes.read/write`, `books.list`, `issues.list`, `links.backlinks`, `app.open(target)` (dispatch a view: note, book `book:<id>#cfi`, issue).
   - Validation plugins: Dataview-like query table, calendar of notes, reading stats.
3. **Enhancers** — phase 5, all message-based so they work sandboxed:
   - `codeBlocks: ["plantuml", "abc"]`: editor and publish render ```` ```lang ```` via the plugin (returns SVG/HTML, sanitized with DOMPurify). Reuse the mdsmirror Diagram widget path and the `Renderers` hook in `src/publish/renderers.ts`.
   - `selectionActions`: extra buttons in the reader toolbar (`BookPopups.tsx`) and the editor selection toolbar; plugin gets text + context, returns markdown/HTML to show in a popup or text to insert/replace.
   - `commands`: command palette / hotkey entries running in the plugin.
   - Deeper changes (new editor nodes, reader layout) → trusted mode only.

### Compatibility with other apps' plugins (Obsidian…)
Not easy in full; a partial shim is doable later. Recommendation: design our own API (above), then add an **optional Obsidian shim** as a late phase, aimed at simple plugins.
- Obsidian plugins are trusted in-process CommonJS modules that `require('obsidian')` and use its classes directly, with no sandbox, so they can only run in our **trusted** mode.
- Maps well (a shim module `obsidian` provided to `require`): `Plugin` lifecycle (`onload/onunload`, `loadData/saveData`), `Vault` (read/modify/create/list → our workspace fs), `MetadataCache` (links, tags, front matter → `src/lib/linkIndex.ts`), `registerMarkdownCodeBlockProcessor` (→ our `codeBlocks`), `addCommand`, `addRibbonIcon`, `registerView` + `ItemView` (→ our plugin views), `registerExtensions` (→ viewers), `Notice`, `Modal`, `Setting`/`PluginSettingTab`, `requestUrl`, and Obsidian's DOM helpers (`createEl`, `createDiv`, `empty`… on `HTMLElement.prototype`).
- Doesn't map: anything touching the editor (Obsidian uses CodeMirror 6 Live Preview, we use ProseMirror/mdsmirror) — `registerEditorExtension`, `Editor`, `MarkdownView` internals; workspace layout (leaves, splits, tabs); undocumented internals that many popular plugins use. So big plugins (Dataview, Excalidraw, Kanban, Templater) would fail or need a lot of shim work; small ones (code block renderers, commands, simple views) are realistic.
- Logseq plugins are sandboxed iframes like ours, but their API is block/outliner based — poor fit. Not worth targeting.
- Practical aim: run a curated list of known-working Obsidian plugins, marked "compat (partial)" in the plugin manager. The `obsidian` API typings are MIT, so the shim can follow them.

### Plugin manager (Settings → Plugins)
Install from folder / .zip, list (mode, permissions, where stored), enable/disable, grant permissions, reload (dev mode: reload on file change), uninstall, "Sync with workspace" toggle. A plugin registry/marketplace is out of scope for now.

---

## Critical files
- `src/state/userSettings.ts`, `src/state/store.ts` — new settings + migration
- `src/shell/settings/SettingsModal.tsx`, `EditorSettings.tsx` — UI
- `src/reader/settings.ts`, `src/reader/styles.ts` — reader fonts, page colors
- `src/lib/themes.ts`, `src/styles/styles.css`, theme hook (`useTheme`)
- `packages/mdsmirror/src/styles/theme.ts`, `src/writer/md/darkTheme.ts`, `src/insight/ForceGraph.tsx`
- `src/shell/MainView.tsx`, `src/state/viewReducer.ts`, `src/shell/sidebar/SidebarNoteLink.tsx`, `src/shell/SideMenu.tsx`
- `src-tauri/tauri.conf.json` (CSP), `src-tauri/src` (URI scheme)
- New: `src/custom/{store,fonts,themes}.ts`, `src/plugins/{host,registry,PluginFileView,PluginView}.tsx`, `packages/plugin-api`

## Verification
- `pnpm test`, `pnpm lint`, `pnpm tc`; `cargo test` + clippy for the Rust scheme.
- Fonts: import a TTF, pick it in editor and reader (EPUB + a CJK book), restart app → still loaded; toggle to workspace → appears in `.mdsilo/fonts/`.
- Themes: after 2a, switch through all built-in themes in headless Chrome (web build) and screenshot editor, CodeMirror, Graph, reader `auto` page — no leftover fixed colors. Create a theme, edit live, export/import, sync it to a second workspace clone.
- Plugins: sample CSV viewer (sandboxed) — open a .csv, edit, save; confirm the iframe can't call `invoke` (devtools check). Sample view plugin listing notes; sample code-block renderer in editor and in a published site. Trusted sample: confirmation shown, hook applied. Synced plugin on a second clone stays disabled until enabled.


## not done

Here is everything not done, from the plan in `docs/customization.md` and the roadmap entries. 

**Not tried in the real app (all of C1–C5)**
- Importing a font, the theme editor, and the plugin pieces: the `mdsplugin://` scheme and its CSP, the sandboxed iframe, the hidden background frames, and all four samples (csv-viewer, tag-index, bars, text-stats).
- Checking every built-in theme in a browser, with screenshots of the editor, CodeMirror, Graph and the reader's `auto` page.

**Shared storage** — done (branch `customization-2`, M1)
- `src/custom/store.ts`: a `Kind` per kind of item (themes, fonts, plugins) says how its items are listed, saved, copied and removed in each place; `keep`, `moveTo(kind, item, 'device' | 'workspace')`, `drop` and `merged` are shared. Themes and fonts: workspace wins; plugins: device wins (merged in Rust, which also serves each plugin from the folder it was listed in).
- Fonts: `.mdsilo/fonts.json` + `.mdsilo/fonts/<file>`, a per-font "Sync with workspace" checkbox in Settings → Fonts. File names from the synced list are reduced to plain names.
- Plugins: `.mdsilo/plugins/<id>/`, a "Sync with workspace" checkbox in Manage Plugins. A synced plugin is never enabled by the sync; a workspace plugin carries a hash of its files, saved when enabled on this device: when a sync changes the files, it stops until enabled again.
- A git sync that changes `themes.json`, `fonts.json`, `fonts/` or `plugins/` reloads them (themes used to be read only on opening the workspace).

**C1 Fonts**
- The web build: a manual check, and a free-text family name.

**C1 Fonts — done (branch `customization-2`, M4)**
- A font for code in the editor (`codeFont`: mdsmirror's `fontFamilyMono`, and the text of the Markdown mode).
- A font for CJK text in the reader (`cjkFont`): after the font chosen (for a generic stack, between its Latin and CJK fonts); with the font of the book, set on the body, where the book sets no font.

**C1 Fonts — done (branch `customization-2`, M3)**
- Installed fonts listed from Rust with `fontdb` (`system_fonts`, pure Rust, no C library; on Linux it reads the fontconfig settings itself; listed once and kept): a *System* group in every font list (id `system:<family>`), and suggestions for "add by name" in Settings → Fonts. A chosen font that is no longer installed stays selectable.

**C2 Themes**
- A contrast warning for content-on-color pairs.
- Sliders for radius and border (the values are kept, there's no UI).

**C3 Plugin core**
- Reading binary files in file viewers (text only now).
- "Open with…" when several plugins match an extension (the first one wins now).
- Dev mode that reloads a plugin when its files change.
- Plugins in the web build (X).

**C4 Views**
- A plugin view as a startup view (`STARTUP_VIEWS`).
- `notes.search` for full-text search.
- Creating new notes with `notes.write`.
- Graph data beyond `notes.backlinks`.
- A `view.info`-style way for views to be told about changes (note edited, files changed).

**C5 Enhancers**
- Commands only show an answer. The background page has no notes, books or issues methods.
- Hotkeys for commands, or a command palette.
- Plugin code blocks in the editor, and plugin selection actions: both are tested, but I haven't seen them run in the real app.
- Plugin code blocks are drawn only in the light theme on published sites.

**Plugins — done (branch `customization-2`, M2)**
- Install from a `.zip` (`unpack_plugin`: names out of the folder and links left out, 5000 files / 256 MB at most; manifest at the root or in its only folder).
- Note modes: `contributes.noteModes`, a button each in the note header, the page in place of the editor with `note.info/read/write` and `note.changed`; sample `outline`.
- `packages/plugin-api` (`@mdsilo/plugin-api`, MIT): manifest and protocol types (the app uses them too), `createClient`, `applyStyle`/`followStyle`, `TrustedApi`; builds `dist/mdsilo-plugin.js` for plain pages.
- Trusted mode: `main.js` imported in-process after a warning, listed apart; pages drawn into the app in place of frames; `handle`, `page`, `contribute`, `editor.addExtension` (mdsmirror), `reader.addStyles`, `onUnload`; app CSP `script-src` allows the plugin scheme. Sample `book-indent`.
- Obsidian layer (`src/plugins/obsidian`): Obsidian manifests run as trusted, `compat: "obsidian"`; `main.js` served as a module by the scheme (`__cjs/`), the `obsidian` module mapped onto ours (see examples/plugins/README.md for what is in and out).

**Plugins — still open**
- Obsidian: `registerExtensions` (viewers), editor callbacks and extensions, `vault.create`, `moment`, front matter in `getFileCache`; a curated list of known-working plugins.
- Trusted and Obsidian plugins are tested in jsdom only, not in the desktop app (module import over the plugin scheme, CSP).

**Housekeeping**
- The flaky `reader.test.tsx` vocabulary test fails now and then and isn't related to plugins.
