# Changelog 

## [app-v0.4.1] - 2022-XX-XX 

### Added  
- Table of Contents  
- WikiLink(`[[note]]`)  
- Hashtag(buggy on Mac and Win)

### Fixed  
- Fix bug on create new note via `new or find`
- Fix bug on unique title (case insensitive) 

## [app-v0.4.0] - 2022-06-16

update deps to stable version 

## [app-v0.4.0-beta.3] - 2022-06-15 

- Backlinks 
- Fix style and some bugs 

## [app-v0.4.0-beta.2] - 2022-06-13 

### Chnages

- Using CodeMirror in Raw Markdown Mode; 
- Fix Graph view: no folder node now; 
- Fix style and other bugs


## [app-v0.4.0-beta.1] - 2022-06-03 

### Chnages

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
