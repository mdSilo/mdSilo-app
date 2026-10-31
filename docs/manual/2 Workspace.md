# Workspace

#manual#

A **workspace** is a folder. mdSilo shows it in the sidebar, indexes it, and keeps everything it creates inside it.

## Layout

```
my-workspace/
├── reading/        books, their annotations (Foo.epub.md), clips
├── writing/        notes, attachments, daily notes
└── .mdsilo/        data: books.json, issues, feeds.json, vocabulary
    └── local/      this device only, never synced: search index, caches
```

- **writing/** holds your notes. A note is a Markdown file; its title is its file name. Folders can be nested as deep as you like.
- **reading/** holds the books you read and the Markdown file of annotations that sits next to each book (`Foo.epub` → `Foo.epub.md`). Clipped web articles go to `reading/clips/`.
- **.mdsilo/** holds what is not meant to be read by hand: the library, reading progress, issues, feed subscriptions. All of it is plain JSON.

Because everything is a file, you can sync the whole workspace with git, Dropbox or anything else. The desktop app syncs it with a git repository by itself, and can publish chosen notes as a website: see [[9 Sync and Publish|Sync and Publish]]. Books are not added to git unless you choose to, book by book (see [[5 Reader|Reader]]). The `local/` folder is excluded automatically.

:::tip
An empty folder you open becomes a workspace by itself. A folder that already has Markdown files is opened as it is (a *legacy* workspace); the sidebar then offers **Upgrade** to move into this layout.
:::

## The side menu

The narrow bar at the edge of the window switches between views.

| Icon | View | Shortcut |
|------|------|----------|
| ☰ | Toggle the explorer (sidebar) | `Alt + X` |
| RSS | Feeds and podcasts, see [[6 Feeds\|Feeds]] | `Ctrl/Cmd + Shift + R` |
| Books | Library, see [[5 Reader\|Reader]] | `Ctrl/Cmd + Shift + L` |
| Pen | New writing | `Ctrl/Cmd + N` |
| Circle dot | Issues, see [[7 Issues\|Issues]] | `Ctrl/Cmd + Shift + I` |
| Board | Projects | `Ctrl/Cmd + Shift + K` |
| Calendar | Chronicle | `Ctrl/Cmd + Shift + C` |
| Graph | Graph | `Ctrl/Cmd + Shift + G` |
| Folder | File menu: open a folder or file; **Publish** (desktop), **Backup** (web) | |
| Headphones | Show or hide the player: a podcast, a book read aloud | |
| Circling arrows | Sync, see [[9 Sync and Publish\|Sync and Publish]] | |
| Gear | Settings | |

The tasks list is the **Tasks** tab of Issues (`Ctrl/Cmd + Shift + T`).

## The sidebar

The sidebar has four tabs:

- **Silo** (`Ctrl/Cmd + Shift + D`): the file tree. Use the `…` menu of an item to create, rename, move and delete. Sort the tree with the sort button.
- **Search** (`Ctrl/Cmd + Shift + F`): full-text search over notes, annotations and the text of your books. See [[Reference]].
- **Hashtag** (`Ctrl/Cmd + Shift + H`): every `#tag#` in the workspace, click one to list its notes. See [[4 Linking|Linking]].
- **Playlist** (`Ctrl/Cmd + Shift + P`): the episodes of your podcast channels.

The count in the sidebar header is the number of notes. Below it, **Reading** and **Writing** are the two roots of the tree.

## Creating and opening

- `Ctrl/Cmd + N` opens *find or create*: type to search notes, press Enter on a name that does not exist yet to create it.
- Open any other folder or Markdown file with the folder icon at the bottom of the side menu.
- The last folder is reopened at startup. In Settings you can choose to start with a fixed folder, with none, and which view to show first.

Next: [[3 Editor|Editor]].
