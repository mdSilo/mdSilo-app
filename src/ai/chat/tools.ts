import { invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import { noteContent } from "@/lib/contentCache";
import { encodeHref } from "@/lib/mdlink";
import { indexOf } from "@/lib/linkIndex";
import { checkFileIsMd } from "@/workspace/process";
import { activeStore } from "@/reader/readerStore";
import { getView } from "@/reader/view";
import {
  sectionBlocks,
  type BlockReader,
  type TextBlock,
} from "@/reader/blocks";
import { bookHref } from "@/reader/annotations/annotations";
import type { TOCItem } from "@/reader/document";
import type { ToolCall, ToolSpec } from "../protocol";
import { markdownParagraphs, type Chunk } from "./context";
import { isExcludedNote, isExcludedPath } from "./privacy";

/**
 * The tools of the chat (docs/ai.md, "How context is used"): to look up more
 * of a whole book, of the notes of a folder or of all the notes than what is
 * given at first. What they find comes back as numbered passages, numbered on
 * from the passages given, cited the same way.
 */

export type ToolScope =
  | { kind: "book" }
  /** `books`: the books searched too (all the notes only) */
  | { kind: "notes"; dir?: string; label: string; books?: boolean };

/** what a tool gives back at most, in characters */
export const TOOL_CHARS = 12_000;
/** passages a search gives back at most */
const HITS = 12;

const QUERY = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description:
        "Words to find, in the language of the text searched. A few key words work best.",
    },
  },
  required: ["query"],
  additionalProperties: false,
};

const EMPTY = { type: "object", properties: {}, additionalProperties: false };

/** The tools for a scope. */
export function toolsFor(scope: ToolScope): ToolSpec[] {
  if (scope.kind === "book")
    return [
      {
        name: "search",
        description:
          "Search the whole book open in the reader for passages with these words.",
        parameters: QUERY,
      },
      {
        name: "read",
        description:
          "Read a chapter of the book: by its number in `list`, or by (a part of) its title.",
        parameters: {
          type: "object",
          properties: {
            chapter: {
              type: "string",
              description: "The number of the chapter in `list`, or its title.",
            },
          },
          required: ["chapter"],
          additionalProperties: false,
        },
      },
      {
        name: "list",
        description: "List the chapters of the book, numbered.",
        parameters: EMPTY,
      },
    ];
  return [
    {
      name: "search",
      description: `Search ${scope.label} for passages with these words (full-text search).`,
      parameters: QUERY,
    },
    {
      name: "read",
      description: `Read a note of ${scope.label}, by its title.`,
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "The title of the note." },
        },
        required: ["title"],
        additionalProperties: false,
      },
    },
    {
      name: "list",
      description: `List the titles of the notes of ${scope.label}, the latest changed first.`,
      parameters: EMPTY,
    },
  ];
}

/** The words of a query to look for; of a text without spaces (CJK), its pairs of characters too. */
export function termsOf(query: string): string[] {
  const terms = new Set<string>();
  for (const word of query
    .toLowerCase()
    .split(/[\s,.;:!?"'()[\]{}，。；：！？“”‘’、]+/)) {
    if (!word) continue;
    if (/[぀-ヿ㐀-鿿가-힯]/.test(word)) {
      terms.add(word);
      for (let i = 0; i + 1 < word.length; i++) terms.add(word.slice(i, i + 2));
    } else if (word.length > 1) terms.add(word);
  }
  return [...terms];
}

/** How well a text matches: the terms in it, the longer worth more. */
export function scoreOf(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  return terms.reduce(
    (score, t) =>
      lower.includes(t) ? score + Math.min(3, t.length / 2) : score,
    0,
  );
}

/** The best passages, as many as the budget holds, in order of score. */
export function bestOf(
  found: { chunk: Chunk; score: number }[],
  max = HITS,
  budget = TOOL_CHARS,
): Chunk[] {
  const out: Chunk[] = [];
  let used = 0;
  for (const { chunk } of found
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score)) {
    if (out.length >= max || used + chunk.text.length > budget) break;
    out.push(chunk);
    used += chunk.text.length;
  }
  return out;
}

type IndexHit = {
  id: string;
  path: string;
  kind: string;
  title?: string;
  label?: string;
  snippet?: string;
};

async function indexSearch(
  query: string,
  kind: "note" | "book",
): Promise<IndexHit[] | undefined> {
  try {
    return await invoke<IndexHit[]>("index_search", {
      query: query.replace(/[!^$'=|"]/g, " ").trim(),
      kind,
      limit: 100,
    });
  } catch {
    return undefined;
  }
}

// # the book open

function openBook() {
  const view = getView();
  const { path, hash } = activeStore().getState();
  if (!view || !path || !hash)
    throw new Error("No book is open in the reader.");
  if (isExcludedPath(path)) throw new Error("This book is excluded from AI.");
  return { view, hash };
}

/** The chapters of the TOC, flat, with the section each is in. */
function chaptersOf(view: BlockReader & { book: { toc?: TOCItem[] } }) {
  const out: { label: string; index: number }[] = [];
  const walk = (items: TOCItem[] = [], depth = 0) => {
    for (const item of items) {
      const index = view.resolveNavigation(item.href)?.index;
      if (index !== undefined)
        out.push({ label: `${"  ".repeat(depth)}${item.label.trim()}`, index });
      walk(item.subitems, depth + 1);
    }
  };
  walk(view.book.toc);
  return out;
}

// the blocks of the sections read, of the book last searched
const blockCache = new Map<string, TextBlock[]>();
async function blocksOfSection(view: BlockReader, hash: string, index: number) {
  const key = `${hash}#${index}`;
  let blocks = blockCache.get(key);
  if (!blocks) {
    blocks = await sectionBlocks(view, index);
    if (blockCache.size > 300) blockCache.clear();
    blockCache.set(key, blocks);
  }
  return blocks;
}

async function searchBook(query: string): Promise<Chunk[]> {
  const { view, hash } = openBook();
  const terms = termsOf(query);
  if (terms.length === 0) return [];
  // the sections with the words, by the index; else all, as many as can be read
  const hits = (await indexSearch(query, "book")) ?? [];
  let sections = hits
    .filter((h) => h.id.startsWith(`book:${hash}#`))
    .map(
      (h) => view.resolveNavigation(h.id.slice(h.id.indexOf("#") + 1))?.index,
    )
    .filter((i): i is number => i !== undefined);
  if (sections.length === 0)
    sections = view.book.sections.map((_, i) => i).slice(0, 400);
  const found: { chunk: Chunk; score: number }[] = [];
  for (const index of [...new Set(sections)].slice(0, 60)) {
    for (const block of await blocksOfSection(view, hash, index))
      found.push({
        chunk: { text: block.text, href: bookHref(hash, block.cfi) },
        score: scoreOf(block.text, terms),
      });
  }
  return bestOf(found);
}

async function readChapter(
  chapter: string,
): Promise<{ label: string; chunks: Chunk[] }> {
  const { view, hash } = openBook();
  const chapters = chaptersOf(view);
  const n = Number(chapter);
  const wanted = chapter.trim().toLowerCase();
  const found =
    Number.isInteger(n) && n >= 1 && n <= chapters.length
      ? chapters[n - 1]
      : (chapters.find((c) => c.label.trim().toLowerCase() === wanted) ??
        chapters.find((c) => c.label.toLowerCase().includes(wanted)));
  if (!found) throw new Error(`No chapter "${chapter}": see \`list\`.`);
  const chunks: Chunk[] = [];
  let used = 0;
  for (const block of await blocksOfSection(view, hash, found.index)) {
    if (used + block.text.length > TOOL_CHARS) break;
    chunks.push({ text: block.text, href: bookHref(hash, block.cfi) });
    used += block.text.length;
  }
  return { label: found.label.trim(), chunks };
}

function listChapters(): string {
  const { view } = openBook();
  const chapters = chaptersOf(view);
  if (chapters.length === 0) return "The book has no table of contents.";
  return chapters
    .slice(0, 400)
    .map((c, i) => `${i + 1}. ${c.label}`)
    .join("\n");
}

// # all the books, by the index

/** book passages a search gives back at most, besides the notes */
const BOOK_HITS = 6;

/** The text of a snippet of the index: its HTML (`<b>`, entities) as plain text. */
export const plainSnippet = (html: string) =>
  (new DOMParser().parseFromString(html, "text/html").body.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim();

/** Passages of the books with the words: the snippets of the index, by section. */
async function searchBooks(query: string): Promise<Chunk[]> {
  const ws = store.getState().initDir;
  const hits = (await indexSearch(query, "book")) ?? [];
  const paths = new Map<string, string | undefined>();
  const out: Chunk[] = [];
  for (const hit of hits) {
    if (out.length >= BOOK_HITS) break;
    const m = /^book:([0-9a-f]{32})#(.+)$/i.exec(hit.id);
    if (!m || !hit.snippet) continue;
    const [, hash, cfi] = m;
    // a book in a folder excluded: never read
    if (ws && !paths.has(hash)) {
      const { findBookPath } = await import("@/reader/library/library");
      paths.set(hash, await findBookPath(ws, hash).catch(() => undefined));
    }
    const path = paths.get(hash);
    if (path && isExcludedPath(path)) continue;
    const where = [hit.title, hit.label].filter(Boolean).join(" · ");
    out.push({
      text: `${where ? `${where}: ` : ""}${plainSnippet(hit.snippet)}`,
      href: bookHref(hash, cfi),
    });
  }
  return out;
}

/** The notes found, and (with `books`) the books, some room left for them. */
async function searchNotesAndBooks(
  query: string,
  scope: Extract<ToolScope, { kind: "notes" }>,
): Promise<Chunk[]> {
  const notes = await searchNotes(query, scope.dir);
  return scope.books
    ? [...notes.slice(0, HITS - BOOK_HITS), ...(await searchBooks(query))]
    : notes;
}

// # the notes

/** The notes (Markdown files) of the scope, not excluded by their folder. */
function notesIn(dir?: string) {
  const prefix = dir ? `${dir.replace(/[\\/]+$/, "")}` : "";
  return [...store.getState().notes.values()].filter(
    (n) =>
      !n.is_dir &&
      checkFileIsMd(n.id) &&
      (!prefix ||
        n.id.startsWith(`${prefix}/`) ||
        n.id.startsWith(`${prefix}\\`)) &&
      !isExcludedPath(n.id),
  );
}

async function searchNotes(query: string, dir?: string): Promise<Chunk[]> {
  const byWords = await searchNotesByWords(query, dir);
  // by meaning too, if on and made: the two ranked lists merged
  if (!store.getState().aiSettings.embeddings) return byWords;
  const { semanticSearch, fuseRanks } = await import("../embeddings");
  const byMeaning = await semanticSearch(query, { dir }).catch(() => []);
  if (byMeaning.length === 0) return byWords;
  return bestOf(
    fuseRanks([byWords, byMeaning.map((m) => m.chunk)]).map(
      (chunk, i, all) => ({
        chunk,
        score: all.length - i,
      }),
    ),
  );
}

async function searchNotesByWords(
  query: string,
  dir?: string,
): Promise<Chunk[]> {
  const terms = termsOf(query);
  if (terms.length === 0) return [];
  const inScope = notesIn(dir);
  const ids = new Set(inScope.map((n) => n.id));
  const hits = await indexSearch(query, "note");
  // the notes found by the index; else the notes, read one by one
  const candidates = hits
    ? [...new Set(hits.map((h) => h.path))]
        .filter((p) => ids.has(p))
        .slice(0, 20)
    : inScope.slice(0, 300).map((n) => n.id);
  const found: { chunk: Chunk; score: number }[] = [];
  for (const id of candidates) {
    const content = await noteContent(id);
    if (isExcludedNote(id, content)) continue;
    const title = store.getState().notes.get(id)?.title ?? id;
    const paragraphs = markdownParagraphs(content);
    // the best few of each note, not all of one
    const scored = paragraphs
      .map((text) => ({
        chunk: { text, href: encodeHref(title) },
        score: scoreOf(text, terms),
      }))
      .filter((f) => f.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    found.push(...scored);
  }
  return bestOf(found);
}

async function readNote(
  title: string,
  dir?: string,
): Promise<{ label: string; chunks: Chunk[] }> {
  const wanted = title.trim().toLowerCase();
  const notes = notesIn(dir);
  const note =
    notes.find((n) => n.title === title.trim()) ??
    notes.find((n) => n.title.toLowerCase() === wanted) ??
    notes.find((n) => n.title.toLowerCase().includes(wanted));
  if (!note) throw new Error(`No note "${title}": see \`list\`.`);
  const content = await noteContent(note.id);
  if (isExcludedNote(note.id, content))
    throw new Error("This note is excluded from AI.");
  const href = encodeHref(note.title);
  const chunks: Chunk[] = [];
  let used = 0;
  for (const text of markdownParagraphs(content)) {
    if (used + text.length > TOOL_CHARS) break;
    chunks.push({ text, href });
    used += text.length;
  }
  return { label: note.title, chunks };
}

function listNotes(dir?: string): string {
  const notes = notesIn(dir).sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at),
  );
  if (notes.length === 0) return "No notes.";
  const shown = notes.slice(0, 300).map((n) => `- ${n.title}`);
  if (notes.length > shown.length)
    shown.push(`… and ${notes.length - shown.length} more`);
  return shown.join("\n");
}

/** The tags used in the notes, the most used first. */
export function usedTags(max = 50): string[] {
  const { notes } = store.getState();
  const index = indexOf(notes);
  const count = new Map<string, number>();
  for (const note of notesIn())
    for (const tag of index.tags(note.id))
      count.set(tag, (count.get(tag) ?? 0) + 1);
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([tag]) => tag);
}

// # running a call

export type ToolResult = {
  /** what the model is given back */
  text: string;
  /** the passages in it, numbered on from the number given */
  chunks: Chunk[];
  /** what was done, said to the user */
  step: string;
};

const numberedFrom = (chunks: Chunk[], first: number) =>
  chunks.map((c, i) => `[${first + i}] ${c.text}`).join("\n\n");

const stringOf = (input: Record<string, unknown> | undefined, key: string) => {
  const value = input?.[key];
  return typeof value === "string"
    ? value
    : typeof value === "number"
      ? String(value)
      : "";
};

/** Run a call of a tool; its passages numbered from `first`. Errors are told to the model. */
export async function runTool(
  call: ToolCall,
  scope: ToolScope,
  first: number,
): Promise<ToolResult> {
  const dir = scope.kind === "notes" ? scope.dir : undefined;
  try {
    if (!call.input) throw new Error("The input is not valid JSON.");
    if (call.name === "search") {
      const query = stringOf(call.input, "query");
      if (!query.trim()) throw new Error("`query` is wanted.");
      const chunks =
        scope.kind === "book"
          ? await searchBook(query)
          : await searchNotesAndBooks(query, scope);
      return {
        text: chunks.length
          ? numberedFrom(chunks, first)
          : `Nothing found for "${query}". Try other words.`,
        chunks,
        step: `search: ${query}`,
      };
    }
    if (call.name === "read") {
      const target = stringOf(
        call.input,
        scope.kind === "book" ? "chapter" : "title",
      );
      if (!target.trim()) throw new Error("What to read is wanted.");
      const { label, chunks } =
        scope.kind === "book"
          ? await readChapter(target)
          : await readNote(target, dir);
      return {
        text: `${label}:\n\n${numberedFrom(chunks, first)}`,
        chunks,
        step: `read: ${label}`,
      };
    }
    if (call.name === "list") {
      return {
        text: scope.kind === "book" ? listChapters() : listNotes(dir),
        chunks: [],
        step: "list",
      };
    }
    throw new Error(`No tool ${call.name}.`);
  } catch (e) {
    return {
      text: `Error: ${e instanceof Error ? e.message : String(e)}`,
      chunks: [],
      step: `${call.name}: failed`,
    };
  }
}

/** Without tools: the passages of a search with the question itself. */
export async function searchFor(
  question: string,
  scope: ToolScope,
): Promise<Chunk[]> {
  try {
    return scope.kind === "book"
      ? await searchBook(question)
      : await searchNotesAndBooks(question, scope);
  } catch {
    return [];
  }
}
