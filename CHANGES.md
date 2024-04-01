# Changelog 

## app-v0.5.10 

2024-XX-XX

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
