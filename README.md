
# mdSilo

A local-first mind silo for storing ideas, thought, knowledge with a powerful all-in-one writing tool. built with React and [Tauri](https://github.com/tauri-apps). 

[Demo](https://mdsilo.com/app/demo)    
[Discord](https://discord.gg/EXYSEHRTFt)  

BTW, [Web app is here](https://mdsilo.com/app) 

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
- Full-text search;  
- Dark and Light Mode;  
- Available for Windows, macOS, Linux;   
- On top of local plain-text files, no registration required, no privacy issue. 

## Tech Stack

- Editor Framework: [ProseMirror](https://prosemirror.net/)      
- Frontend Framework: [React](https://reactjs.org/)  
- Cross-platform: [Tauri](https://tauri.studio/) 

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
  - [ ] Kanban board

- View
  - [X] Graph
  - [X] Task
  - [X] Chronicle 

- Organize writings
  - [X] Folder management 
  - [X] Hashtag 
  - [X] Backlinks 
  - [X] Recent history 
  - [ ] Block reference  
  - [ ] Flashcards 
  - [ ] Export as PDF,HTML, ... 
  - [ ] Version control: git integration 

### Cross

- Input --flow--> Output
  - [ ] ... 

- Cross-Platform 
  - [x] Windows, macOS, Linux. 
  - [X] Web: https://mdsilo.com/app/ 
  - [ ] Mobile: iOS/iPadOS and Android(soon...)


## Any questions, feedback or suggestions?

You can follow us on [Twitter](https://twitter.com/mdsiloapp) or go to our [Discord](https://discord.gg/EXYSEHRTFt). We are waiting there for you.
