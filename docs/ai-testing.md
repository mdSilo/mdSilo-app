# AI: manual test checklist

The automated tests check the logic against simulated providers. This list checks the real thing: real models, real keys, the desktop app and the web version. Work through **Setup** once, then the sections in order; each step says what you should see.

Test on the `ai` branch, in the desktop app (`pnpm tauri dev`) and in the web version (`pnpm start:web`). Where a step differs between them, it says so.

When something fails, note: desktop or web, the provider and model, the exact error text, and on web the browser console (F12). On desktop, "Test" in Settings > AI shows the provider's own error message.

---

## Setup

You don't need all of these. A minimum useful set is **Ollama** (free, local) plus **one service with a key** (Anthropic or OpenAI). Speech to text, web search and embeddings each need their own setup, below.

### Ollama (local; chat, tools, embeddings)

- [ ] Install Ollama, then pull a chat model that can use tools and an embedding model:
  `ollama pull llama3.2` and `ollama pull nomic-embed-text`
- [ ] **Web only:** let the site call Ollama: start it with `OLLAMA_ORIGINS="*" ollama serve` (or the site's address instead of `*`).
- [ ] Settings > AI > "Add a provider…" > **Ollama (on this computer)**. The address is filled in (`http://localhost:11434/v1`), badge "on this computer".
- [ ] "List models": the pulled models appear in the model fields' suggestions. Set **Chat model** `llama3.2` and **Embeddings** `nomic-embed-text`.
- [ ] **Test**: "Answered in …s: OK" (or similar).

### Anthropic (key; chat, tools, web search)

- [ ] Add **Anthropic**: chat model `claude-opus-5-5` and fast model `claude-haiku-5-5` are filled in. Paste the key, **Test**.
- [ ] Save, close and reopen the dialog: the key field says "saved, type to change" and never shows the key.

### OpenAI (key; chat, speech to text, embeddings)

- [ ] Add **OpenAI**, paste the key, "List models", choose a chat model. Set **Speech to text** `whisper-1` and **Embeddings** `text-embedding-3-small`. **Test**.

### Local Whisper (optional, instead of OpenAI for speech to text)

- [ ] Run a server with an OpenAI-compatible `/v1/audio/transcriptions` (for example speaches / faster-whisper-server). Add an **OpenAI-compatible** provider with its address (`http://localhost:8000/v1` or as it says) and its model name in **Speech to text**.

### Web search for providers other than Anthropic (optional)

- [ ] **SearXNG:** run it (for example with Docker) with the JSON format on: in its `settings.yml`, `search: formats: [html, json]`. Settings > AI > Web search > SearXNG, its address (`http://localhost:8888`), Save.
- [ ] **Or Brave Search / Tavily:** choose it, paste the key, Save.

### CORS proxy (web only)

Needed on web for services that refuse browsers, and for some feeds.

- [ ] `pnpm start:web` already has one built in. For a static build, run `node web/cors-proxy.mjs`, or deploy the Worker: `npx wrangler deploy web/cors-proxy-worker.mjs --name mdsilo-cors-proxy --compatibility-date 2024-09-01 --var ALLOW_ORIGIN:<site address>`. For an AI host it doesn't know yet, add `--var RELAY_HOSTS:host1,host2`.
- [ ] Settings > **CORS Proxy**: with the field empty, it says whether this site has a proxy of its own (the built-in one of `pnpm start:web`, or one set at build time) and that it's in use; or that there's none. To use yours, set `http://host:8787/?url={url}` (or the Worker's address with `?url={url}`): it then says "In use: your proxy".

---

## 1. Providers and settings

- [ ] Settings shows **AI α**; the AI dialog's title has the α badge too.
- [ ] With two providers: "Chat with" and "Quick tasks (translation…)" list them; the choice is kept after a restart.
- [ ] A wrong key: **Test** shows the provider's error (e.g. `401 …`), not a crash.
- [ ] **Delete** a provider: it's gone, and stays gone after a restart.
- [ ] After a few chats, "This month (…)" shows requests and tokens.
- [ ] **Desktop:** the keys are in the app's data folder, `ai-config.json`, not in the workspace (check that `git status` in the workspace shows nothing of them).

## 2. Translation by AI

- [ ] In a book, select a sentence > translate: the service list has **Google** and **AI**; choose AI: the translation comes from the quick-tasks model.
- [ ] Whole-book translation with **AI** chosen: paragraphs are translated as you read.

## 3. The chat pane

- [ ] `Ctrl/⌘+J` and the ✨ button in the side menu open and close the pane; drag its left edge to resize; the width is kept. On a phone-sized window it fills the screen.
- [ ] No provider: the pane offers "Set up AI".
- [ ] With a **note** open, the scope says "This note". Ask "What is this note about?": the answer streams in, cites `[1]`, `[2]`… Hover a number: the passage. Click: the note opens.
- [ ] With a **book** open, scope "This chapter": ask about the chapter; click a citation: the reader jumps to that paragraph.
- [ ] With a **feed article** open, scope "This article": same.
- [ ] **Stop** during an answer stops it at once.
- [ ] After the first answer, `chats/<date> <question>.md` exists; it opens in the editor as a normal note, citations as links. Open it while the pane is open: "Go on with this chat" resumes it.
- [ ] A book's or a note's **backlinks** list the chats that cite it.
- [ ] Answer actions: **Copy**; **Put in the note** (with a note open, or a note beside a book); **New issue of it** (an issue appears); **Ask again**.
- [ ] Reader: select text > **Ask AI about it** (✨): the pane opens with the selection; Explain / Summarize / Translate / Other views work.
- [ ] Editor: select text: the toolbar has a ✨ **AI** button (separate from the plugins one): **Ask AI about it**, **Explain**, **Polish**. Polish: the answer shows "Replace the selection" and "Discard"; Replace puts the new text in, its bold and links kept.

## 4. Tools and scopes

- [ ] Book open, scope **The whole book**: ask about something in another chapter. Steps appear under the answer ("↳ search: …", "↳ read: …"); citations open the right places.
- [ ] Note open, scope **This folder**: ask about the folder's notes: it searches and reads them.
- [ ] Scope **All my notes**: ask about something you wrote long ago.
- [ ] A provider with **"The model can use tools"** off (or a local model without tools): "What's sent?" says one search is sent; the answer still cites.
- [ ] **What's sent?** shows the provider, the passages, about how many tokens, the tools, what is never read.
- [ ] Privacy: a note with `ai: false` in its front matter: "This note" says it's excluded, the model is told it may not read it; it never appears in searches. Add a folder under "Folders the AI never reads": its notes never appear either.

## 5. The web, and prompts

- [ ] **Anthropic:** turn on 🌐, ask about something recent: steps "↳ web search: …", citations open the web pages; the pages are listed under the answer.
- [ ] Ollama or OpenAI with a **search service**: 🌐 on: steps "↳ web search: …" / "↳ read page: …".
- [ ] No way to the web (Ollama, no search service): 🌐 is greyed out with a tooltip saying what to set up.
- [ ] **Other views** on a selection: with the web, sources; without, the answer says it's the model's own knowledge.
- [ ] **Save as clip** on a cited page: `clips/<title>.md` appears; its citation in the chat note now links to the clip.
- [ ] Settings > AI > **Prompts**: add one using `{{selection}}`, save. It shows in the pane (above the input) and in the editor's ✨ menu; using it on a selection puts the text in the prompt. `.mdsilo/ai-prompts.json` exists.

## 6. Audio

- [ ] With a speech-to-text model set, play a **podcast** episode: the player shows **Transcribe**. Click: "Fetching the audio…", then "Transcribing…" (for a long MP3 over 24 MB: "part n of m").
- [ ] `reading/transcripts/<episode>.md` appears. In the player, **Transcript**: the paragraph playing is highlighted and follows playback; clicking a time jumps there; the quote button on a paragraph puts a quote with a time link into the note.
- [ ] In any note, a `[12:30](podcast:…)` link plays the episode from there (also when another episode was playing).
- [ ] **Dictation:** a 🎤 in the note header (only with a speech-to-text model). Click, speak, click again: the text appears at the cursor. **Desktop, Linux:** check that the webview allows the microphone at all; note it if not.
- [ ] Feed reader, under the list of feeds: **Digest of the feeds**. Without a provider it says so and "Set up AI" opens the settings. With one: **Make today's digest now** makes `chats/<date> Digest.md`, each `[n]` linking to its article. Turn on the daily digest, restart: about a minute later it is made, once a day.

## 7. Myself

- [ ] Empty chat > **My profile** > **Propose a profile**: after a while, a profile with sections and `[[note]]` links. Edit a line, **Save**. **Propose an update**: the change is shown line by line (`+` / `-`); **Take it** writes it, **Discard** doesn't. `.mdsilo/ai/profile.md` exists.
- [ ] Scope **All my notes**: the answers act as a thinking partner (quote your notes, point out contradictions).
- [ ] Settings > AI > "search my books too" on: answers in **All my notes** also cite book passages (of books opened before, which are indexed).
- [ ] Empty chat > **Weekly review**: `chats/<date> Weekly review.md` opens.
- [ ] Note open: **Related notes** (it searches all notes, lists `[[links]]`), **Suggest tags**.

## 8. Search by meaning and link suggestions

- [ ] Settings > AI > **Search by meaning**: greyed out until a provider has an **Embeddings** model. Turn it on: the status says how many notes are left and about how many tokens.
- [ ] **Build or update the index**: progress, **Stop** works; again: only changed notes are done. `.mdsilo/local/ai-embeddings.bin` exists and is not synced.
- [ ] Scope **All my notes**: ask with words that are not in your note but mean the same (e.g. "putting things off" for a note about procrastination): it is found.
- [ ] **Suggest links** on: under a note, "Notes on the same ideas, not linked yet" lists a few; **Link** puts `[[title]]` in the note, and the note disappears from the list. Notes already linked either way are never listed. Note whether the suggestions feel right: the likeness threshold (0.5) may need tuning for your embedding model.

## 9. Web version only

- [ ] A provider the browser can't reach directly (e.g. OpenAI on some setups): with your CORS proxy set, the chat works; without one (or with only the public fallback), the error says to set your own proxy in Settings > CORS Proxy.
- [ ] The provider form on web says your key passes through the proxy when it's used.

## 10. Plugins

- [ ] A test plugin asking the `ai` permission: installing shows "Ask the AI you set up (it may cost you tokens)"; `app.call("ai.complete", { prompt: "Hi" })` returns `{ text }`; without the permission it fails with `Not permitted: ai`; more than 20 calls in a minute fail with a clear message.
