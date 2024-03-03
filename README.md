
# mdSilo

A local-first mind silo for storing ideas, thought, knowledge with a powerful all-in-one writing tool. built with React and [Tauri](https://github.com/tauri-apps). see [Demo](https://mdsilo.com/app/demo) or discuss on [Discord](https://discord.gg/EXYSEHRTFt)  

You can get the app on [release page](https://github.com/mdSilo/mdSilo-app/releases) or build from the source code: 

- install Rust: https://www.rust-lang.org/tools/install 
- install Node js: https://nodejs.org
- `git clone https://github.com/mdSilo/mdSilo-app.git`
- `cd mdSilo-app`
- `yarn && yarn tauri build` or `npm install && npm run tauri build` 

Then you can find the app in `./src-tauri/target/release` folder.

## Features

- I/O: Input and output in one place;    
- All-In-One Editor: Markdown, WYSIWYG, MindMap... 
- Markdown and extensions: Diagram, Table, Math/Chemical, Code block(Highlight)...   
- Slash commands, Hovering toolbar, hotkeys and more toolkits...   
- Chronicle view, Graph view, Task view... 
- Kanban to make personal knowledge base a serious project;  
- Full-text search;  
- Dark and Light Mode;  
- Available for Windows, macOS, Linux;   
- On top of local plain-text files, no registration required, no privacy issue. 

## Screenshots

- Powerful Editor: WYSIWYG(Markdown, mindmap, mermaid, Latex...), support TOC and Export(PDF/PNG) 

![editor](https://user-images.githubusercontent.com/1472485/222804255-f2c4a22b-d7b2-4621-b508-20e1b8545e45.png)

- Kanban board: to manage the process of knowledge base growing

![kanban](https://github.com/mdSilo/mdSilo-app/assets/1472485/e5293e4e-ddf7-4510-81c2-8ed358ca8a09)

- Feed reader, support RSS/Atom and podcast

![reader](https://user-images.githubusercontent.com/1472485/222804686-e2ea28d8-a772-4a27-a3c0-2759d73c5fdc.png) 

- Timeline view, and github-like activities tracker

![chron](https://user-images.githubusercontent.com/1472485/222804883-d7014fca-ec0d-4cf5-88bc-d331350c1f17.png)

- Graph view

![graph](https://user-images.githubusercontent.com/1472485/222804768-f0ad36b8-69d2-4658-b5c9-20ab7e05c3f3.png)


## Tech Stack

- Editor Framework: [ProseMirror](https://prosemirror.net/)      
- Frontend Framework: [React](https://reactjs.org/)  
- Cross-platform: [Tauri](https://tauri.app/) 

## Road map 

### Input end

- [X] Support RSS feed  
- [X] Podcast client  
- [X] Support Atom feed  
- [ ] View and annotate PDF/epub  

### Output end

- Markdown
  - [X] Style: **Bold**, *Italic*, ~~Strikethrough~~, `Inline Code`
  - [X] Link: [mdSilo](https://mdsilo.com) and <https://mdsilo.com>, 
  - [X] Image: `![]()` and local image 
  - [X] Headings and TOC, 
  - [X] List item: ordered list, bullet list, check list and nested list
  - [X] Table
  - [X] Blockquotes  
  - [X] Horizontal Rules 

- Markdown extension
  - [X] more style: `==mark==`, `__underline__`, `1^sup^`
  - [X] Highlight code block  
  - [X] Math and Chemical Equation: inline `$\KaTeX$` and block `$$\LaTeX$$` 
  - [X] Notice block: info, warning, tips 
  - [X] Wikilink: `[[]]` 
  - [X] Hashtag: `#tag#` 
  - [X] Diagram: mermaid, echarts, music notation... 
  - [X] Embed web page: YouTube, Figma... 
  - [X] Attach local PDF file 

- Writing, formatting and drawing 
  - [X] WYSIWYG, Markdown, MindMap and Split view 
  - [X] Slash commands  
  - [X] Hovering toolbar
  - [X] hotkeys 
  - [ ] Drawing  

- View
  - [X] Graph
  - [X] Task
  - [X] Chronicle 

- Organize writings
  - [X] Folder management 
  - [X] Kanban board  
  - [X] Hashtag 
  - [X] Backlinks 
  - [X] Recent history 
  - [X] Export as PDF, Image, ... 
  - [ ] Block reference  
  - [ ] Flashcards 
  - [ ] Version control: git integration 

### Extension

- [ ] Javascript injection
- [ ] Plugin
- [ ] Customize theme 

### Cross

- Input --flow--> Output
  - [ ] ... 

- Cross-Platform 
  - [x] Windows, macOS, Linux. 
  - [X] Web: https://mdsilo.com/app/ 
  - [ ] Mobile: iOS/iPadOS and Android(soon...)


## Any questions, feedback or suggestions?

You can follow us on [Twitter](https://twitter.com/mdsiloapp) or go to our [Discord](https://discord.gg/EXYSEHRTFt). We are waiting there for you.
