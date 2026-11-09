# Changelog 

## app-v0.8.1

2026-XX-XX

- Performance: Big books open without being read into memory whole: the reader reads the parts it asks for, on the desktop and on the web; PDF, MOBI, AZW and AZW3 too
- Performance: Importing MOBI, AZW and AZW3 books reads only what their metadata, cover and text need, not their images; a book dropped in on the web is written as it is, not read into memory first
- Performance: Feed books get smaller photos (at most 1600 px wide and 2.56 megapixels), in Rust on the desktop and in the browser on the web; a feed book made before gets them when it is updated. A 198 MB book became 63 MB, and an article of big photos opens about twice as fast
- Performance: Videos and audio in a book no longer play by themselves or load before you press play: an article of a feed book with eight looping videos from the web took 14 s of CPU to show in the desktop app, now 2 s
- Fix: Pressing play on a video in a book jumped to the start of the chapter, on a page with nothing but the video

## app-v0.8.0 

2026-11-08

- Feat: OPDS catalogs in Feeds, browse, search and download books
- Feat: Customize fonts and theme  
- Feat: Custom plugins
- Feat: Drag and drop to move files and folders in the explorer tree  
- Feat: Support JSON feed and make/update book from feed  
- Feat: support MDict files (.mdx/.mdd) and customize web resource on Dictionary  
- Feat: Word lens shows a short meaning under the words of your vocabulary  
- Feat: Ask before syncing files over 50 MB (books, dictionary files)
- Feat: Look up the text selected in a note in the dictionaries, from the editor toolbar
- Feat: A dictionary site added can have an API key (`%KEY%` in its url): looked up in the app when it answers as Merriam-Webster's APIs do
- Improve: The numbers in the settings are set by − and + buttons
- Performance: Index book(epub/mobi/azw/azw3/fb) in Rust end  
- Performance: Faster Library and lists, using react-virtuoso+OverlayScrollbars
- Fix: Cannot import or open EPUB books on iOS 16 Safari (polyfill `Object.groupBy`)
- Fix: On older Safari (iOS 16/17): mermaid links, PDF page colors in themes, faster scanned PDFs; a note on JPEG XL comic pages a browser cannot show; macOS 11+ required 
- Fix: keep settings, reading progress and issues across relaunch PWA  
- Improve: Wikipedia is one of the dictionaries, no longer a button of its own; Free Dictionary removed (it failed to load)
- Support Speed reading mode and share quote via plugins. 

## app-v0.7.0 

2026-10-30

- Feat: ebook reader
- Feat: Git sync
- Feat: Publish as a static site
- Improve Linking and Graph

## app-v0.6.2 

2026-10-27

- Fix bugs and improve performance.   
- Upgrade dependencies and toolchain to latest version.  

## app-v0.6.1 

2026-10-23

- Feat: support comments `<!-- ... -->` in Markdown 
- Feat: move table rows and columns (close #780)
- Fix tray icon missing
- Fix Link Editor bug on creating link
- Fix bug on inserting local image and displaying images with paths relative to the note 

## app-v0.6.0 

2026-10-07

- Sidebar workspace explorer: expand folders in place as a multi-level tree (close #751).
- Sidebar: resize by dragging its edge; tree scrolls horizontally for deep folders.
- Faster folder listing in sidebar explorer, rust end and frontend.
- Feed reader: resizable channel and article columns, channel list scrolls horizontally.
- Upgrade zustand 5, immer 11: faster store updates
- Notes kept in an immutable bucketed NoteMap: editing a note no longer copies all notes.
- Fix wiki links with `_`/`*` in title (e.g. `[[_draft_]]`): parsed as links, no longer broken on save.
- Backlinks: faster computing (parse cached per note), mentions exclude link text, plain text context.
- Fix inserting local image: enable Tauri 2 asset protocol, resolve local image paths, insert at the current cursor.
- Fix raw mode (Markdown source): upgrade CodeMirror packages to latest, one copy of each; editor lifecycle safe in StrictMode.
- Fix app hanging in loading after reload / dev tools: dir watcher no longer blocks a backend thread, one watcher and listener at a time.
- Fix creating link from the selection toolbar: the link editor shows again; toolbar commands act on the editor's own schema and view.
- CSP allows Tauri 2 IPC (`ipc:`, `http://ipc.localhost`): no more fallback to the slower postMessage IPC.
- Tooltip built on tippy.js directly: `@tippyjs/react` read `element.ref`, removed in React 19.
- Rename/delete note: update links with alias, escapes, several per line; skip code; wait for notes loaded. 
- SideMenu Orientation setting with Auto, Vertical, and Horizontal options.
- Add frontend test with more coverage.
- Personal issue tracker.


## app-v0.5.10 

2026-09-20

Upgrade React to version 19 and Tauri to version 2.

## app-v0.5.9 

2024-03-06

- Organize notes using Kanban

## app-v0.5.8 

2024-02-22

bug fixes and small improvements.

## app-v0.5.7 

2023-09-08

To focus on the core features of note-taking and improve the performance continuously. 
We clean up some features, such as web wrap, split view, etc. In the future, such features can be added as plugins.

### Features

- Add Setting button on sidemenu;
- Set font family, size, weight and line height for editor;    

### Bug Fixes and breaking change 

Now will not replace the blank space with `_` on title as link due to the side effect. but this is a breaking change which breaks the backlinks and graph view (stopgaps:  change `[wikilink title](wikilink_title)` to `[wikilink title](wikilink%20title)`  or change to `[[wikilink title]]` or `[[wikilink title | my alt text]]` manually, sorry for the inconvenience). 


## app-v0.5.6 

2023-05-12

### Features 

- [X] Sort playlist
- [X] System tray 
- [X] Setting: if open previous folder on startup 

### Improvement

- [X] walk dir multi-threadedly 
- [X] Improve performance on open/switch/edit large file


## app-v0.5.5 

2023-03-05

### Features 

- [X] Kanban board 
- [X] Wrap web app and inject your JS script 
- [X] Export as PDF or Image(png)

### Bug Fixes 

- [X] Close #404 : backslash issue

and a few tiny fixes.

## app-v0.5.4 

2023-02-14

### Features 

- [X] Support Atom feed


## app-v0.5.3 

2023-01-31

Fix bugs

## app-v0.5.2 

2022-12-31

Fix bugs

## app-v0.5.1 

2022-11-30 

Fixed a bug: failed to create db file on launch

## app-v0.5.0 

2022-11-14 

### Features 

#### Input end 
- [X] RSS reader  
- [X] Podcast client 

## app-v0.4.9 

2022-10-22 

### Bug Fixes 

- [X] Close #279 : cannot insert or override content on insert local image/file
- [X] Close #283 : converts the lines above or below into block. 

### Improvements 

- [X] Can attach file: zip, docx, xlsx, pptx, ... 

## app-v0.4.8 

2022-10-15 

### Features 

- [X] Support Chemical equation  
- [X] Live preview math block   
- [X] Hashtag view 
- [X] DateTime slash commands: `/date`, `/time`, `/now`       

### Bug Fixes 

- [X] Search hashtag 
- [X] Journals page: empty daily notes  

### Improvements 

- [X] Clear log 


## [app-v0.4.7] - 2022-10-07 

### Features 

- [X] Diagram: mermaid, echarts, abc music notation.     

### Bug Fixes 

- [X] Rename doc after editing
- [X] Compute backlinks(`[[]]`)

### Improvements 

- [X] Default file name for `saveDialog()`. 
- [X] Include Hahtag in graph view.   
- [X] Add `data:` to csp. 
- [X] Relative local image path 
- [X] Show non-markdown file and open with default application 

## [app-v0.4.6] - 2022-09-28 

### Features 

- Mindmap: visualize Markdown(headings and list items) as mindmap.
- Folder Management: create subfolder/rename/delete 
- Split view: raw markdown and WYSIWYG on the same page 

### Bug Fixes 

### Improvements 

- Listen remove event in directory 
- Copy log for debug 

## [app-v0.4.5] - 2022-09-19

- Create new folder on move note  
- Move loading directory job to backend(Rust)  
- Fixed some bugs  


## [app-v0.4.4] - 2022-09-05 

### Added 
- Recent history  
- Insert local image and attach local file(PDF) 
- Embed Airtable, Codepen, YouTube, and more  

## [app-v0.4.3] - 2022-08-26 

### Added 
- Task view 

### Removed
- remove `~sub~` support (conflict with `~~strikethrough~~`)

### Fixed 
- Loss content on rename; 
- Bug on Chronicle view;   
- Bug on message modal(removed);  
- Rendering error if any heading folded;  

## [app-v0.4.2] - 2022-08-22 

### Added  
- Subscript text (`~sub~`) and superscript text (`^sup^`) support  
- Ignore hidden files and folders


## [app-v0.4.1] - 2022-06-22 

### Added  
- Table of Contents: generate TOC automatically    
- WikiLink(`[[note]]`)    

### Fixed  
- Fix bug on create new note via `new or find`
- Fix bug on unique title (case insensitive) 

## [app-v0.4.0] - 2022-06-16

update deps to stable version 

## [app-v0.4.0-beta.3] - 2022-06-15 

- Backlinks 
- Fix style and some bugs 

## [app-v0.4.0-beta.2] - 2022-06-13 

### Changes

- Using CodeMirror in Raw Markdown Mode; 
- Fix Graph view: no folder node now; 
- Fix style and other bugs


## [app-v0.4.0-beta.1] - 2022-06-03 

### Changes

- Migrate Slate to Prosemirror (⚠️Breaking changes⚠️ and more features are still WIP)
- Editor Support: Markdown, Table, Code block highlight, Math Block...,  
- Switch between WYSIWYG mode and Raw Markdown mode, 

## [app-v0.3.0] - 2022-03-24

### Added  
- Daily Activity Graph  
- Message Modal  

### Fixed  
- Deserialize HashTag on open md file  

## [app-v0.2.1] - 2022-03-17  

### Fixed  
- Daily note folder   
- Settings toggle  
- Save relative file/asset path in JSON  
- Handle rename change by external editor  

## [app-v0.2.0] - 2022-03-10

### Added  
- Splashscreen on loading  
- Sync changes by external editor  
- Search button on HoveringToolBar  
- Insert Local Image  

### Fixed  
- Normalize paths for Window, Linux, macOS  
- Sync changes in store to JSON(persist)  

## [app-v0.1.0] - 2022-03-03

initial release

### Features Implemented

- WYSIWYG Editor, Markdown support  
- Slash command, hotkeys and Hovering Toolbar.   
- Graph view 
- Task view  
- Chronicle view 
- BackLink   
- Block Reference  
- HashTag 
- Full-text search 
- Available for Linux, Windows, macOS (no Code Signing currently) 
