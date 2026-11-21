# AI: a chat beside everything (B6)

## Context

mdSilo runs input → process → output: reading (books, feeds, podcasts), working on it (issues, annotations, links), writing (notes). AI should help each step and, over time, help distill *the user's own* knowledge. The center of it is **one chatbox**, beside every view, that can talk about whatever is open: a book, a feed, a note, a folder in the explorer, or the whole workspace ("myself").

What already exists and is reused:

- **Providers with the user's own key:** TTS engines in `src-tauri/src/tts/` (`online.rs`: Azure, OpenAI-style `audio/speech`), with a `Config`/`Field` settings pattern. Translation services: `TRANSLATORS` in `src/reader/lookup/lookup.ts` (only Google now). Whole-book translation and caching: `src/reader/translation/`.
- **Full-text search:** tantivy (+ jieba) over notes and books, `src-tauri/src/index/search.rs`; web build `src/host/web/indexer.ts` (KV `search_index`).
- **Book positions and quotes:** CFI links, quotes with backlinks into notes, `readUrl`/`?read=&cfi=`, `reader.blocks` in `src/plugins/readerApi.ts`.
- **Side panes:** `ParallelPane.tsx` / `BesideMenu.tsx` (parallel reading/writing), reader panels from plugins (`src/plugins/ReaderPanels.tsx`).
- **Selection actions:** the reader and editor selection toolbars (`src/plugins/selection.ts`, `EditorSelectionActions.tsx`).
- **Clips:** `src/feed/clip.ts`, `fullText.ts` (save a web page as Markdown).
- **Plugins:** sandboxed API with permissions (`@mdsilo/plugin-api`).

Principles:

1. **One chatbox, many scopes.** Not a separate AI feature per view. Selection actions, summaries, fact checks are all prompts sent into the same chat with the right scope.
2. **Everything lands in the workspace.** Chats are Markdown notes that link to their sources. They show up in backlinks, Graph, Chronicle and search, and they sync over git. AI output becomes part of the user's knowledge, not something stuck in a sidebar.
3. **Every answer cites.** An answer about a book or the notes points at the passages it used, and a click opens them (book at the CFI, note at the heading/block).
4. **Local first, any provider.** Local models (Ollama, LM Studio, llama.cpp), the user's own key, or (later) mdSilo's hosted service, all the same code path. Nothing is sent without the user seeing what is sent.

---

## The chatbox

### Where it lives

- A right-side **Chat pane** available in every view (notes, reader, feed, explorer, issues), toggled by a button in the view menu and a shortcut (`Mod+J`). It uses the same split as parallel reading/writing; width adjustable and remembered.
- On mobile: a full-screen sheet over the view.
- Can be popped into its own window (like `BookWindow`).

### Scopes

The pane header shows the **scope**: what the chat may read. It follows the active view by default and can be pinned or changed from a chip menu. Several scopes can be combined (e.g. a book + my notes on it).

| Scope | Default when | Context it gives |
|---|---|---|
| **Selection** | text selected in reader/editor | the selection + surrounding paragraphs + where it is (book/chapter or note/heading) |
| **Book** | reader open | current chapter in full; the rest of the book by search; TOC; the user's annotations of this book |
| **Feed** | article open | the article (full text via `fullText.ts`); or a channel / "today's items" for digests |
| **Note** | a note open | the note; its links and backlinks one hop out, by title + excerpt |
| **Explorer** | a folder selected | the notes/books under it: titles, front matter, excerpts; full text by search |
| **Myself** | chosen explicitly | the whole workspace: notes, annotations, highlights, chats, issues, by search (see Retrieval); plus the user profile (see "Chat with myself") |
| **None** | — | plain chat, no workspace data |

Each scope is a **context provider** (`src/ai/context/*.ts`):

```ts
type Source = {
  kind: 'note' | 'book' | 'feed' | 'annotation' | 'issue' | 'chat' | 'web';
  path: string;            // workspace-relative, or URL for web
  anchor?: string;         // CFI, heading slug, block id
  title: string;
};
type Chunk = { source: Source; text: string };
interface ContextProvider {
  id: string;
  label(): string;
  /** What is always sent (small, e.g. current chapter). */
  base(budget: number): Promise<Chunk[]>;
  /** What can be looked up on demand (search within the scope). */
  search?(query: string, limit: number): Promise<Chunk[]>;
  read?(source: Source): Promise<Chunk[]>;
}
```

### How context is used

- **Stuffing:** `base()` goes into the prompt, trimmed to a token budget per model (setting).
- **Tools (when the model supports them):** the scope's `search` / `read` are given as tools (`search_scope`, `read_source`, and for Myself also `list_backlinks`, `list_annotations`). The model decides what to look up. This is how "chat with a book" works for a whole book without a huge context.
- **Fallback (small local models without tools):** the app runs one search with the user's question and stuffs the top chunks.
- **Context preview:** a "What's sent" disclosure under the input shows the chunks and an estimated token count before sending. Excluded sources are never read (see Privacy).

### Citations

- The system prompt asks for `[n]` markers; each chunk sent is numbered. The answer renders `[n]` as a chip; hover shows the excerpt, click opens the source (reader at CFI, note at anchor, URL in the browser).
- When saved, `[n]` becomes a real link: wikilink to a note, the existing quote link for a book position, URL for web.

### Actions on a message

- **Insert into note** (current note, or the note beside in parallel writing), as a quote block with the source links.
- **Save as note** (one message, or the whole chat).
- **Make issue** (reuse `issueOfText.ts`).
- **Copy**, **Retry** (other model), **Edit and resend**.
- In the reader: **Highlight cited passages** (reuse the plugin `highlight: true` path).

### Chats are notes

- Saved to `chats/` at the workspace root (folder configurable; can be set to `.mdsilo/local/chats/` to keep them unsynced). File: `chats/2026-11-20 <title>.md`, title generated after the first answer, editable.
- Front matter: `title`, `ai: chat`, `created`, `model`. Body: `### Me` / `### AI · <model>` sections; a selection asked about is quoted with a link to it; citations are links (`[n](book:<hash>#<cfi>)`, `[n](<note title>)`, `[n](<url>)`), so the backlinks of a book or note list the chats about it without a `sources` list. Reopening the note in the Chat pane turns the links back into citations and resumes it. In the editor it is just a note.
- Because they link to their sources, a book's backlinks list the chats about it; Chronicle shows them on their day.
- **Ephemeral mode** per chat (not saved), and a setting "Save chats by default" (on).

### Entry points that open the chat

These are prompts with a scope, not separate features:

| Where | Action | Prompt / scope |
|---|---|---|
| Reader / editor selection toolbar | **Ask**, **Explain**, **Other views** (with sources), **Translate**, **Define** | Selection |
| Editor selection toolbar | **Polish**, **Shorten**, **Continue** | Selection; answer shown as a diff, applied on Accept (never rewritten silently) |
| Reader TOC / chapter end | **Summarize chapter** | Book |
| Feed article / channel | **Summarize**, **Digest today** | Feed |
| Explorer folder menu | **Ask about this folder**, **What's in here** | Explorer |
| Note menu | **Find related**, **Suggest links** | Note + Myself |
| Command palette | **Chat with myself**, **Weekly review** | Myself |

Prompts live in one file (`src/ai/prompts.ts`) and users can add their own **prompt presets** (name, scope, template with `{{selection}}`, `{{title}}`, `{{lang}}`), stored like themes (workspace by default, synced). Presets show up in the selection toolbar and command palette.

---

## Reference lookup and fact checks

- **Web search tool** (optional, off until configured): either the provider's built-in web search when it has one, or a user-configured search API (key in settings). Given as a `web_search` / `fetch_page` tool to the chat.
- **Other views** (rather than "fact check"): the model is asked for supporting and opposing sources, with links. Without a search tool the button says it can only give the model's own knowledge, uncited, and labels the answer so.
- **Store locally:** any web source cited can be saved as a clip (`clips/<title>.md` via `fullText.ts` + `clip.ts`), and the chat link then points at the local clip. References used in writing are collected at the end of the chat note.

---

## Audio and other services

Same provider settings, used outside the chat:

- **AI translation:** add an LLM translator to `TRANSLATORS` (`lookup.ts`). Whole-book translation, word lens and the translation popup get it for free. Cache already exists (`BookTranslations`).
- **TTS:** already done (`src-tauri/src/tts/`); just share keys with the AI provider where it is the same service.
- **Speech to text:** a Whisper-compatible `/audio/transcriptions` engine (OpenAI-style, local whisper.cpp server, hosted). Podcasts: transcribe an episode → a transcript book/note with timestamps that follows playback (`src/player/`) and can be annotated and quoted like a book; then it is a normal Feed/Book scope for the chat. Also dictation into the editor.
- **Summaries for feeds:** "Digest today" can be scheduled (on app start, once a day) and saved as a note `chats/<date> Digest.md`.

---

## Chat with myself

"Myself" is the Myself scope plus a **profile**:

- `.mdsilo/ai/profile.md` (synced, plain Markdown, user-editable): interests, recurring themes, opinions the user holds, writing style, open questions, each with links to the notes/annotations it came from.
- **Build / refresh profile** (manual button, optional weekly): the model reads recent notes, annotations and chats (by Chronicle date range, through the search tools) and proposes an update as a diff; the user accepts. Never updated silently.
- In Myself chats the profile goes into the system prompt: "Answer as a thinking partner who knows this person's notes; quote them; point out where they contradicted themselves or changed their mind."
- Quiet suggestions built on the same machinery (later): "this highlight relates to note X", unlinked mentions, suggested tags, a **Weekly review** (what I read, wrote, highlighted, left open) from `src/insight/activity.ts`.

---

## Retrieval

- **v1: tantivy only (done in M3).** The existing full-text index finds the notes, or the sections of the book (indexed by section, `book:<hash>#<cfi>`); they are read and their paragraphs scored by the words of the query (CJK by pairs of characters), the best few of each note kept (`src/ai/chat/tools.ts`). No change to `index/search.rs` was needed. Without an index (or no hit in the book), the notes or sections are read one by one, up to a limit. The model writes its own search queries through tools, which makes keyword search go a long way.
- **v2: embeddings (optional).** A vector per chunk, stored in `.mdsilo/local/` (never synced), computed by the configured provider's embedding endpoint or a local one; hybrid search (BM25 + vectors). Pure-Rust storage (sqlite blob + brute-force cosine is enough for tens of thousands of chunks; no new C library). Only built when the user turns it on; shows progress and cost estimate.
- Web build: same through `indexer.ts`; embeddings in IndexedDB.

---

## Providers

### Model

```ts
type AiProvider = {
  id: string;
  kind: 'openai' | 'anthropic' | 'mdsilo';  // openai = any OpenAI-compatible server
  label: string;
  baseUrl: string;          // e.g. http://localhost:11434/v1 for Ollama
  key?: string;
  models: { chat?: string; fast?: string; embed?: string; stt?: string };
  contextTokens?: number;
  tools?: boolean;          // detected or set
};
```

- `openai` covers OpenAI, Ollama, LM Studio, llama.cpp server, OpenRouter, DeepSeek, Groq, most others. `anthropic` uses the Messages API. `mdsilo` (later) is the hosted service, OpenAI-compatible with a login token.
- Presets for the common ones (fills base URL), "Test connection", "List models".
- Two model roles: **chat** (answers) and **fast** (titles, translation, summaries of many items). A task can be routed to either.

### Where calls run (done in M1)

- **The protocol is in TypeScript only** (`src/ai/protocol.ts`): request bodies and reading the SSE answers of both kinds. Desktop and web share it.
- **Files (audio):** `ai_upload` takes the file as the raw body of the IPC request, the rest in its headers, and sends it as `multipart/form-data` with the key.
- **Desktop:** `src-tauri/src/ai/` is a small proxy. It keeps the providers with their keys in `<data dir>/ai-config.json` (0600, like `tts-config.json`), adds the key and API headers, and sends a request only under the provider's saved base URL (paths are checked: no `..`, `//`, `#`). The frontend sees `hasKey`, never the key. Commands: `ai_providers`, `ai_save_provider`, `ai_delete_provider`, `ai_fetch` (JSON, e.g. `/models`), `ai_stream` (streams the raw text over a Tauri `Channel`, then an explicit `end` event, because channel messages can arrive after the command's own answer) and `ai_cancel` (stops at the next chunk).
- **Web:** providers and keys are kept in IndexedDB (`src/host/web/ai.ts`) and the browser calls the provider with `fetch` (`src/ai/transport.ts`). Notes in the UI: Ollama needs `OLLAMA_ORIGINS`; Anthropic is sent its direct-browser-access header; some services block browsers (then: hosted service or a proxy, later).
- Frontend API (`src/ai/client.ts`): `chat({ messages, role, provider?, model?, signal }) → AsyncGenerator<Delta>`, `complete()` for the whole text, `listModels()`. Embeddings and speech-to-text come with M3/M5.

### Cost and limits

- Estimated tokens before sending; tokens used after (per message, and a monthly total in settings).
- Confirm before big jobs (whole-book translation, profile build, embedding a workspace) with the estimate.
- Rate-limit retries with backoff; clear errors with the provider's message (like `checked()` in `online.rs`).

### Plugins

- `ai.chat()` / `ai.embed()` in `@mdsilo/plugin-api`, behind a new `ai` permission; calls go through the user's configured provider and count toward the same usage. A plugin can also add a **context provider** (new scope) and **prompt presets**.

---

## Privacy

- Default provider: none until the user picks one; first-run suggests local (Ollama) or their own key.
- **Exclude from AI:** front matter `ai: false` (like `publish: false`), and folders/tags listed in settings. Excluded sources are filtered in every context provider and in search results given to the model.
- The "What's sent" preview, always available; a setting to confirm every send for non-local providers.
- Hosted service: no training on user data, no storage of prompts beyond what billing needs (stated in the UI).

---

## Hosted service (later, separate from the app work)

The app works fully with local models and the user's own key, always free. The hosted service sells convenience:

- **What it gives:** login, no key setup, models picked for each task, transcription, neural TTS, whole-book translation, scheduled feed digests; later bundled with managed sync and publish hosting.
- **Pricing shape:** a subscription with a monthly credit pool (not per-token prices). Bulk tasks go to cheap models; the chat model is better. Margin comes from routing, batching and caching, not a visible markup.
- **Shared cache:** translations/summaries of public content (feed articles, public-domain books) computed once, served to all subscribers. Never for the user's own books or notes.
- **Stack:** Cloudflare Workers (OpenAI-compatible endpoint, auth, quotas), AI Gateway (caching, rate limits, provider fallback, logs), Workers AI for cheap open models / Whisper / embeddings, D1 or KV for accounts and usage, R2 for files; a merchant-of-record payment provider (handles VAT).
- **Risks to settle before launch:** abuse/fraud of free credits, provider terms for resale, serving regions with their own rules for AI services (e.g. mainland China filing), refunds.

---

## Phases

All phases go on one branch, `ai` (a commit per phase, reviewed before commit); `docs/roadmap.md` updated at each one.

| Phase | Content |
|---|---|
| **M1 Providers** ✅ (branch `ai`) | `src-tauri/src/ai/` (OpenAI-compatible + Anthropic, streaming, cancel), web `fetch` client, `src/ai/client.ts`; provider settings UI (Settings > AI) with presets, test, list models; provider per role (chat, quick tasks); usage counter per month. AI translator in `TRANSLATORS`. |
| **M2 Chat pane** ✅ (branch `ai`) | Chat pane beside every view (`Mod+J`, side-menu button, resizable; full screen on a phone); reads what the view shows by stuffing (the note, the book's current chapter from the page shown, the open feed article) or nothing; a selection attached on top; streaming, Markdown rendering, `[n]` citations as links to their passages (book CFI, note, article URL); message actions (copy, put in the note shown or beside, new issue, ask again); chats saved as notes in `chats/`, reopened from the note ("Go on with this chat"); "Ask AI about it" in the reader's selection toolbar; an AI button (✨) of its own in the editor's selection toolbar (mdsmirror `aiActions`) with Ask / Explain / Polish; Polish replaces the selection with the polished Markdown (mdsmirror `replaceMarkdown`) once taken. |
| **M3 Tools and whole scopes** ✅ (branch `ai`) | Scope picker: this view, the whole book, this folder (of the note shown), all my notes, nothing. Tools `search` / `read` / `list` (tool calls of both APIs; Anthropic's blocks, thinking included, sent back unchanged), up to 6 rounds then the answer; their passages numbered on and cited like the others; the steps shown under the answer. Search at paragraph level without changing the index: the tantivy index finds the notes (or the sections of the book, `book:<hash>#<cfi>`), which are read and their paragraphs scored by the words. A model without tools (turned off, or a 400 about tools): one search with the question, sent at first. "What's sent?" preview; `ai: false` and folders excluded in Settings > AI, never read. |
| **M4 Web and references** ✅ (branch `ai`) | A 🌐 toggle in the chat. Anthropic: its own `web_search` / `web_fetch` (the older `web_search_20250305` for models without the newer), `citations_delta` turned into `[n]` sources, `pause_turn` resumed. Other providers: a search service in Settings > AI (SearXNG, Brave, Tavily; kept with the providers, kind `search`, its key in Rust) and the tools `web_search` / `fetch_page` run by the app (pages read by Readability). "Other views" asks with the web when it can, else says it is the model's own knowledge. The pages cited listed under the answer, each "Save as clip" (`clips/`), the citations then linking to the clip. Prompt presets in `.mdsilo/ai-prompts.json` (synced; `{{selection}}`, `{{title}}`, `{{lang}}`), in the chat and the editor's AI menu, edited in Settings > AI. |
| **M5 Audio** ✅ (branch `ai`) | Speech to text by an OpenAI-compatible `/audio/transcriptions` (a "Speech to text" model per provider, e.g. `whisper-1` or a local Whisper server): audio sent raw to Rust (`ai_upload`, multipart written by hand, no new crate) or by `FormData` on web; verbose JSON for the times, plain JSON for models without; MP3 over 24 MB cut between its frames. Podcasts: "Transcribe" under the player, the transcript a note in `reading/transcripts/` whose paragraphs start with `podcast:<audio>#t=<s>` links (they play the episode from there, from any note); the transcript beside the player follows playback, a click on a time plays from it, a paragraph quoted in the note with a link to its time. Dictation: a 🎤 in the note header (where the webview can record), the text put at the cursor. A digest of the feeds: the new unread articles summarized by the quick-tasks model into `chats/<day> Digest.md`, each cited with a link; once a day a minute after start if set, or "Make today's digest now" in Settings > AI. |
| **M6 Myself** | Profile (`.mdsilo/ai/profile.md`) build/refresh as a diff; Myself chats use it; Weekly review; suggestions (related notes, unlinked mentions, tags). Optional embeddings + hybrid search. Plugin `ai` API. |
| **M7 Hosted** | `mdsilo` provider kind, login, credits; the Cloudflare service (separate repo). |

---

## Decisions

- Chats are saved in `chats/` at the workspace root (2026-11-20).
- Chats are saved by default; ephemeral is a per-chat choice (2026-11-20).

## Open questions

1. Should Myself include books' full text, or only the user's own words (notes, annotations, chats)? Own words only is cheaper and closer to "myself"; books can be added as a scope.
2. Profile: one file, or one per topic?
3. Hosted service: in scope for this year, or after mobile (B7)?
