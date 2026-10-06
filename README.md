
# mdSilo

A local-first mind silo for storing ideas, thought, knowledge with a powerful all-in-one writing tool. built with React and [Tauri](https://github.com/tauri-apps). see [Demo](https://mdsilo.com/app/demo) or discuss on [Discord](https://discord.gg/EXYSEHRTFt)  

You can get the app on [release page](https://github.com/mdSilo/mdSilo-app/releases) or build from the source code: 

- install Rust: https://www.rust-lang.org/tools/install 
- install Node js: https://nodejs.org
- `git clone https://github.com/mdSilo/mdSilo-app.git`
- `cd mdSilo-app`
- `yarn && yarn tauri build` or `npm install && npm run tauri build` 

Then you can find the app in `./src-tauri/target/release` folder.

### Web version

The web version shares the frontend code in `./src` with the desktop app, files are stored in the browser (IndexedDB) instead of the disk. No Rust is needed: 

- `yarn start:web`: dev server on http://localhost:3001
- `yarn build:web`: build to `./dist-web`, a static site that can be served by any web server (set `MDSILO_WEB_BASE=/sub/path/` to serve from a sub path)

How it works: `vite.web.config.ts` replaces the Tauri APIs (`@tauri-apps/api/*`, `@tauri-apps/plugin-dialog`) with the stand-ins in `./src/platform/web`, which handle the same commands as the Rust end (`src-tauri/src/lib.rs`) on a virtual file system in IndexedDB. A service worker (`./web/public/fs-sw.js`) serves the stored files by URL, so images and attachments can be displayed. Folders and files on your device can be imported via the Open Folder / Open File dialog, exported files are downloaded by the browser.

Backup: clearing the site data of the browser deletes the notes, so back up regularly via the **mdSilo** menu (top of sidebar) > **Export Backup**, which downloads all files as a zip. To restore, unzip it and import the folder via Open Folder > Import Folder.

RSS feeds: browsers block most feeds by CORS, so a feed is fetched directly first, then via a CORS proxy. The proxy in use, in order:

1. Settings > RSS CORS Proxy, e.g. `https://proxy.example.com/?url={url}` (`{url}` is replaced by the encoded feed url, otherwise the url is appended); `none` to disable
2. build time default: `MDSILO_WEB_CORS_PROXY=https://proxy.example.com/?url={url} yarn build:web`
3. the built-in proxy `/__cors_proxy__` of `yarn start:web` / `yarn preview:web`, if detected
4. a public proxy ([allorigins](https://allorigins.win)) on static hosting, which can see the feed urls

To run your own proxy (same API, GET to public http(s) addresses only):

- Node: `node web/cors-proxy.mjs` (no dependencies; env `PORT`, default 8787, `HOST`, `ALLOW_ORIGIN`)
- Cloudflare Workers, for static hosting w/o a server (free tier is enough): `npx wrangler deploy web/cors-proxy-worker.mjs --name mdsilo-cors-proxy --compatibility-date 2024-09-01 --var ALLOW_ORIGIN:https://<your site origin>`

Deploy to GitHub Pages: `.github/workflows/deploy-web.yml` builds and deploys on push to `main` (or run it manually). Enable it in repo Settings > Pages > Source: **GitHub Actions**. With repo secrets `CLOUDFLARE_API_TOKEN` (Workers edit permission) and `CLOUDFLARE_ACCOUNT_ID`, it also deploys the Cloudflare Worker proxy and builds it in as the default; or set repo variable `MDSILO_WEB_CORS_PROXY` to use an existing proxy. Other variables: `MDSILO_WEB_BASE` (default `/<repo name>/`, use `/` for a custom domain), `MDSILO_WEB_ORIGIN` (origin allowed by the proxy, default `https://<owner>.github.io`), `MDSILO_CORS_WORKER_NAME`.

## Features

- I/O: Input and output in one place;    
- All-In-One Editor: Markdown, WYSIWYG, MindMap... 
- Markdown and extensions: Diagram, Table, Math/Chemical, Code block(Highlight)...   
- Slash commands, Hovering toolbar, hotkeys and more toolkits...   
- Chronicle view, Graph view, Issues and Tasks... 
- Projects (Kanban boards and tables) to make personal knowledge base a serious project;  
- Built-in issue tracker (GitHub-like): issues with labels, milestones, comments and timeline, project boards and tables, two-way links with notes (`[[Note]]` in issues, `[#12](issue:12)` in notes), stored in `issues.json` in the workspace;  
- Full-text search;  
- Dark and Light Mode;  
- Available for Windows, macOS, Linux;   
- On top of local plain-text files, no registration required, no privacy issue. 

## Screenshots

- Powerful Editor: WYSIWYG(Markdown, mindmap, mermaid, Latex...), support TOC and Export(PDF/PNG) 

![editor](https://user-images.githubusercontent.com/1472485/222804255-f2c4a22b-d7b2-4621-b508-20e1b8545e45.png)

- Projects board (Kanban): to manage the process of knowledge base growing. Boards from the old `kanban.json` are moved into Projects automatically (a backup is kept as `kanban.json.bak`)

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
  - [X] Tasks (`#todo#` `#doing#` `#done#` and `- [ ]` checkboxes in notes, turned into issues that stay in sync)
  - [X] Chronicle 

- Organize writings
  - [X] Folder management 
  - [X] Issues and Projects (Kanban boards)  
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
  - [ ] Mobile: iOS/iPadOS and Android


## Any questions, feedback or suggestions?

You can follow us on [Bluesky](https://bsky.app/profile/mdsilo.com) or go to our [Discord](https://discord.gg/EXYSEHRTFt). We are waiting there for you.
