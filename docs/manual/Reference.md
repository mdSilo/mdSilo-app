# Reference

#manual#

## Keyboard shortcuts

`Mod` is `Ctrl` on Windows and Linux, `⌘` on macOS.

### App

| Shortcut | Action |
|----------|--------|
| `Mod + N` | Find or create a note |
| `Alt + X` | Show or hide the sidebar |
| `Mod + Shift + D` | Sidebar: Silo (file tree) |
| `Mod + Shift + F` | Sidebar: Search |
| `Mod + Shift + H` | Sidebar: Hashtags |
| `Mod + Shift + P` | Sidebar: Playlist |
| `Mod + Shift + R` | View: Feeds |
| `Mod + Shift + L` | View: Library |
| `Mod + Shift + I` | View: Issues |
| `Mod + Shift + T` | View: Tasks |
| `Mod + Shift + K` | View: Projects |
| `Mod + Shift + C` | View: Chronicle |
| `Mod + Shift + G` | View: Graph |

### Editor

| Shortcut | Action |
|----------|--------|
| `Mod + B` / `I` / `U` | Bold / italic / underline |
| `Mod + D` | Strikethrough |
| `Mod + H` | Highlight |
| ``Mod + ` `` | Inline code |
| `Mod + K` | Link |
| `Mod + Shift + Space` | Insert a table |
| `/` | Slash command menu |
| `[[` | Link a note or an issue |
| `{{` | Link a book or a highlight |
| `#tag#` | Hashtag |
| `Ctrl + 1` / `2` / `3` | Headings |
| `Ctrl + 7` / `8` / `9` | Task, bullet, ordered list |

## Search

The **Search** tab of the sidebar searches the full text of the workspace: notes, the annotations of your books and the text of the books you have opened. Results show where the words are. The index is built in the background and updated as you edit; Chinese and other languages written without spaces are split into words.

## Settings

The gear at the bottom of the side menu opens the global settings:

- **Theme**: mdSilo light and dark, or follow the system, plus eight built-in themes.
- **Side menu orientation**: vertical or horizontal.
- **Open on startup**: the last folder, a fixed folder, or none; and the **view on startup**.

Settings of one area are kept where you use them: the editor's in the gear of a note (font, size, spell check, attachment folder), the reader's in *Font and layout* of the top bar, the feed's in *Manage Channels and Settings*.

## The web version

The web version at the same address as this manual is the same app. Differences:

- Your workspace is **stored in your browser** (IndexedDB). Nothing is sent to any server.
- Use **Open Folder** to import a folder from your device, and the options of a note to export it; files are downloaded by your browser.
- Feeds go through a CORS proxy, see [[6 Feeds|Feeds]].
- No native file watching, no git sync and no publishing; the desktop app is the choice for big libraries.

:::warning
**Back up.** Clearing the site data of your browser deletes your notes. Use the **File Menu** (the folder icon at the bottom of the side menu) > **Backup** to download everything as a zip. To restore, unzip it and import the folder with *Open Folder*.
:::

:::info
**Remove the demo.** The manual, the sample book and the sample issues that the web version starts with can be removed in one click: **File Menu** (the folder icon at the bottom of the side menu) > **Remove demo**. What you made yourself (notes, issues, books) is kept.
:::

## The desktop app

Available for Windows, macOS and Linux. Your workspace is a real folder: sync it with the built-in git sync (see [[9 Sync and Publish|Sync and Publish]]), or with Dropbox, Syncthing; edit the files with another editor and the changes appear in mdSilo.

## Plain files, for good

| What | Where | Format |
|------|-------|--------|
| Notes | `writing/**/*.md` | Markdown |
| Book annotations | `reading/Foo.epub.md` | Markdown with comments |
| Clipped articles | `reading/clips/*.md` | Markdown |
| Library | `.mdsilo/books.json` | JSON |
| Reading progress | `.mdsilo/books/<id>.json` | JSON |
| Issues, labels, projects | `.mdsilo/` | JSON |
| Feeds | `.mdsilo/feeds.json` | JSON |
| What to publish | `.mdsilo/publish.json` | JSON |
| Vocabulary | `.mdsilo/vocabulary.json` | JSON |

## Help

- Questions, feedback and ideas: [Discord](https://discord.gg/EXYSEHRTFt) or [Bluesky](https://bsky.app/profile/mdsilo.com).
- Bugs and features: the GitHub repository, where the app is open source.

Back to the [[0 Start Here|start page]].
