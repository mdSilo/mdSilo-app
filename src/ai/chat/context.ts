import * as CFI from "foliate-js/epubcfi.js";
import { store } from "@/state/store";
import type { ViewState } from "@/state/viewReducer";
import { noteContent } from "@/lib/contentCache";
import { encodeHref } from "@/lib/mdlink";
import { activeStore } from "@/reader/readerStore";
import { getView } from "@/reader/view";
import { blocksOf, sectionBlocks, textOf } from "@/reader/blocks";
import { bookHref } from "@/reader/annotations/annotations";
import { titleOfFile } from "@/reader/library/library";
import { isExcludedNote, isExcludedPath } from "./privacy";
import type { ToolScope } from "./tools";

/**
 * What the chat may read (docs/ai.md, "Scopes"): the note, the chapter of the
 * book or the article of the feed open in the view, as numbered passages the
 * model cites by number, each with a link back to where it is.
 */

/** A passage given to the model: its text and a link to it, as notes link. */
export type Chunk = {
  text: string;
  /** `book:<hash>#<cfi>`, the title of a note, or a URL */
  href: string;
  /** a page of the web: its title */
  title?: string;
};

/** The passages of a scope, and what they are. */
export type Context = {
  /** e.g. the title of the note, or of the book and the chapter */
  label: string;
  chunks: Chunk[];
  /** some passages left out, too long for the budget */
  partial: boolean;
};

/**
 * What the chat may read: what the view shows (auto); the whole book open;
 * the notes of a folder; all the notes; or nothing. The whole book, a folder
 * and all the notes are looked up by tools (see tools.ts).
 */
export type Scope = "auto" | "book" | "folder" | "all" | "none";

/** The kind of what is shown in the view, which the chat may read. */
export type ViewKind = "note" | "book" | "feed" | "none";

/** about 12k tokens: room for the question, the history and the answer */
export const CONTEXT_CHARS = 48_000;

export function viewKindOf(view: ViewState | undefined): ViewKind {
  if (view?.view === "md" && view.params?.noteId) return "note";
  if (view?.view === "book") return "book";
  if (view?.view === "feed" && store.getState().currentArticle) return "feed";
  return "none";
}

/**
 * The passages from `start` on, as many as the budget holds, some before it
 * too if the end is reached first.
 */
export function withinBudget(
  chunks: Chunk[],
  start: number,
  budget: number,
): { chunks: Chunk[]; partial: boolean } {
  const total = chunks.reduce((n, c) => n + c.text.length, 0);
  if (total <= budget) return { chunks, partial: false };
  let from = Math.max(0, Math.min(start, chunks.length - 1));
  let to = from;
  let used = 0;
  while (to < chunks.length && used + chunks[to].text.length <= budget)
    used += chunks[to++].text.length;
  while (from > 0 && used + chunks[from - 1].text.length <= budget)
    used += chunks[--from].text.length;
  // a passage longer than the budget: cut
  if (to === from)
    return {
      chunks: [{ ...chunks[from], text: chunks[from].text.slice(0, budget) }],
      partial: true,
    };
  return { chunks: chunks.slice(from, to), partial: true };
}

/** The paragraphs of Markdown: apart by blank lines, code blocks whole. */
export function markdownParagraphs(markdown: string): string[] {
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  const out: string[] = [];
  let current: string[] = [];
  let fence: string | null = null;
  const flush = () => {
    const text = current.join("\n").trim();
    if (text) out.push(text);
    current = [];
  };
  for (const line of body.split(/\r?\n/)) {
    const open = /^\s*(```|~~~)/.exec(line);
    if (fence) {
      current.push(line);
      if (open && open[1] === fence) {
        fence = null;
        flush();
      }
    } else if (open) {
      flush();
      fence = open[1];
      current.push(line);
    } else if (!line.trim()) flush();
    else current.push(line);
  }
  flush();
  return out;
}

/** what is said of a note or book the AI may not read */
export const EXCLUDED = "excluded from AI";

async function noteContext(noteId: string, budget: number): Promise<Context> {
  const note = store.getState().notes.get(noteId);
  const title = note?.title ?? titleOfFile(noteId);
  const href = encodeHref(title);
  const content = await noteContent(noteId);
  if (isExcludedNote(noteId, content))
    return { label: `${title} (${EXCLUDED})`, chunks: [], partial: false };
  const chunks = markdownParagraphs(content).map((text) => ({
    text,
    href,
  }));
  return { label: title, ...withinBudget(chunks, 0, budget) };
}

/** The first block that ends at the page or after it; the first if none. */
function blockAt(blocks: { cfi: string }[], cfi: string): number {
  try {
    const page = CFI.collapse(cfi);
    const i = blocks.findIndex(
      (b) => CFI.compare(CFI.collapse(b.cfi, true), page) >= 0,
    );
    return i < 0 ? 0 : i;
  } catch {
    return 0;
  }
}

/** The chapter shown in the reader, from the page shown if too long. */
async function bookContext(budget: number): Promise<Context | null> {
  const view = getView();
  const { path, hash, entry, location } = activeStore().getState();
  if (!view || !path || !location?.cfi) return null;
  if (isExcludedPath(path))
    return {
      label: `${entry?.title || titleOfFile(path)} (${EXCLUDED})`,
      chunks: [],
      partial: false,
    };
  const at = view.resolveNavigation(location.cfi);
  if (!at) return null;
  const blocks = await sectionBlocks(view, at.index);
  const chunks = blocks.map((b) => ({
    text: b.text,
    href: hash ? bookHref(hash, b.cfi) : "",
  }));
  const start = blockAt(blocks, location.cfi);
  const title = entry?.title || titleOfFile(path);
  const label = location.tocLabel
    ? `${title} · ${location.tocLabel.trim()}`
    : title;
  return { label, ...withinBudget(chunks, start, budget) };
}

function feedContext(budget: number): Context | null {
  const article = store.getState().currentArticle;
  if (!article) return null;
  const html = article.content || article.description || "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  let texts = blocksOf(doc).map(textOf);
  if (texts.length === 0) {
    const text = doc.body?.textContent?.trim();
    texts = text ? [text] : [];
  }
  const chunks = texts.map((text) => ({ text, href: article.url }));
  return { label: article.title, ...withinBudget(chunks, 0, budget) };
}

/** The passages of what the view shows; none if the scope is none or nothing to read. */
export async function contextOf(
  scope: Scope,
  view: ViewState | undefined,
  budget = CONTEXT_CHARS,
): Promise<Context | null> {
  if (scope === "none" || scope === "folder" || scope === "all") return null;
  // the whole book: the chapter shown at first, the rest by the tools
  if (scope === "book") return bookContext(budget);
  switch (viewKindOf(view)) {
    case "note":
      return noteContext(String(view?.params?.noteId), budget);
    case "book":
      return bookContext(budget);
    case "feed":
      return feedContext(budget);
    default:
      return null;
  }
}

/** The folder of a note, by its id (an absolute path). */
export const folderOf = (noteId: string) => noteId.replace(/[\\/][^\\/]*$/, "");

/** The scopes the view allows, the first the default. */
export function scopesFor(view: ViewState | undefined): Scope[] {
  const kind = viewKindOf(view);
  return [
    "auto",
    ...(kind === "book" ? (["book"] as const) : []),
    ...(kind === "note" ? (["folder"] as const) : []),
    ...(store.getState().initDir ? (["all"] as const) : []),
    "none",
  ];
}

/** What the tools look through for a scope; none for a scope without tools. */
export function toolScopeOf(
  scope: Scope,
  folder?: string,
): ToolScope | undefined {
  if (scope === "book") return { kind: "book" };
  if (scope === "folder" && folder)
    return {
      kind: "notes",
      dir: folder,
      label: `the notes of the folder "${folder.split(/[\\/]/).pop()}"`,
    };
  if (scope === "all") return { kind: "notes", label: "all the user's notes" };
  return undefined;
}
