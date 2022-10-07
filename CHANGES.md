# Changelog 

## [app-v0.5.0] - 2022-XX-XX 

## [app-v0.4.7] - 2022-09-07 

### Features 

- [X] Diagram: mermaid, echarts, abc music notation.     

### Bug Fixes 

- [X] rename doc after editing
- [X] compute backlinks(`[[]]`)

### Improvements 

- [X] Default file name for `saveDialog()`. 
- [X] Include Hahtag in graph view.   
- [X] Add `data:` to csp. 
- [X] Relative local image path 

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
