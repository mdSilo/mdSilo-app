import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { joinPath } from "@/workspace/util";
import { DATA_DIR } from "@/workspace/layout";
import { newNoteId } from "../annotations/annotations";
import type { DictionaryResult, Pronunciation } from "../lookup/lookup";

/**
 * The words to learn, met in the books and looked up in the dictionary;
 * with the sentence each was met in and a link
 * back to it. In the workspace, synced with it:
 *
 *   .mdsilo/vocabulary.json   { version, entries: [...] }, the newest first
 *
 * Each change is made to the file as it is then (another device may have
 * changed it), one change at a time.
 */
export const VOCABULARY_FILE = "vocabulary.json";
export const VOCABULARY_VERSION = 1;

export type VocabularyEntry = {
  id: string;
  word: string;
  /** HTML, short: the first meanings, from the dictionary (sanitized) */
  definition: string;
  /** the language of the word, e.g. en */
  language?: string;
  /** the dictionary, by its id: e.g. wiktionary, mdict:<id> of a file */
  source?: string;
  /** its name, when added: shown, also once the dictionary is gone */
  sourceName?: string;
  /** how it is said: spellings (IPA), recordings (web urls, or `mdict:<id>:<path>`) */
  pronunciations?: Pronunciation[];
  /** the short meaning shown under the word in the books (word lens), as the user wrote it */
  gloss?: string;
  /** the word translated, by language (e.g. zh-CN): for the word lens */
  translations?: Record<string, string>;
  /** where it was met: the sentence, the book and the place in it */
  context?: { sentence?: string; book?: string; title?: string; cfi?: string };
  addedAt: string;
  reviewCount?: number;
  lastReviewedAt?: string;
};

type VocabularyFile = { version: number; entries: VocabularyEntry[] };

const pathOf = (ws: string) => joinPath(ws, DATA_DIR, VOCABULARY_FILE);

export async function readVocabulary(ws: string): Promise<VocabularyEntry[]> {
  try {
    const text = await invoke<string>("read_file", { filePath: pathOf(ws) });
    if (!text?.trim()) return [];
    const data = JSON.parse(text) as Partial<VocabularyFile>;
    return (data.entries ?? [])
      .filter((e) => e?.id && e.word)
      .map((e) => {
        const pronunciations = keptPronunciations(e.pronunciations);
        const translations = keptTranslations(e.translations);
        const {
          pronunciations: _,
          gloss,
          translations: __,
          ...rest
        } = e;
        return {
          ...rest,
          ...(pronunciations.length ? { pronunciations } : {}),
          ...(typeof gloss === "string" && gloss.trim()
            ? { gloss: gloss.trim().slice(0, MAX_GLOSS) }
            : {}),
          ...(Object.keys(translations).length ? { translations } : {}),
        };
      });
  } catch (e) {
    if (e instanceof SyntaxError)
      console.error(`${pathOf(ws)} is not valid JSON`, e);
    return [];
  }
}

async function writeVocabulary(ws: string, entries: VocabularyEntry[]) {
  const text = `${JSON.stringify({ version: VOCABULARY_VERSION, entries }, null, 2)}\n`;
  await invoke("write_file", { filePath: pathOf(ws), text });
}

/**
 * The pronunciations kept of a word: a few, each a spelling or a recording
 * the app plays (a web url, or of a dictionary file); the file is synced and
 * may be edited, so checked when read too.
 */
export function keptPronunciations(list?: unknown): Pronunciation[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((p: Partial<Pronunciation> | null) => {
      const text = typeof p?.text === "string" ? p.text.slice(0, 80) : "";
      const audio =
        typeof p?.audio === "string" &&
        /^(https?:\/\/|mdict:[^:]+:.)/i.test(p.audio)
          ? p.audio
          : "";
      const label = typeof p?.label === "string" ? p.label.slice(0, 12) : "";
      return {
        ...(text ? { text } : {}),
        ...(audio ? { audio } : {}),
        ...(label && (text || audio) ? { label } : {}),
      };
    })
    .filter((p) => p.text || p.audio)
    .slice(0, 4);
}

/** The longest gloss kept, and translation of a word. */
export const MAX_GLOSS = 80;

/** The translations kept of a word: text by language, from a file that may be edited. */
export function keptTranslations(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(
        ([lang, text]) =>
          /^[a-z]{2,3}([-_][a-z0-9]{2,8})*$/i.test(lang) &&
          typeof text === "string" &&
          text.trim(),
      )
      .map(([lang, text]) => [lang, (text as string).trim().slice(0, MAX_GLOSS)]),
  );
}

/** The pronunciations of a word looked up: of its first entry, or of an entry as HTML. */
export const pronunciationsOf = (result: DictionaryResult) =>
  keptPronunciations(
    result.entries[0]?.pronunciations ?? result.pronunciations,
  );

/** The same word: case aside, in the same language if both say it. */
export const sameWord = (
  a: { word: string; language?: string },
  b: { word: string; language?: string },
) =>
  a.word.trim().toLowerCase() === b.word.trim().toLowerCase() &&
  (!a.language || !b.language || a.language === b.language);

const escape = (text: string) =>
  text.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );

/** The text of HTML, its spaces as one; cut at `max` characters, with an ellipsis. */
export function textOfHtml(html: string, max = Infinity): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("style, script").forEach((el) => el.remove());
  const text = (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/** The definition kept for a word: the first meanings of the first entry. */
export function definitionOf(result: DictionaryResult): {
  definition: string;
  language?: string;
} {
  const first = result.entries[0];
  // an entry of a dictionary file, as HTML: the start of its text
  if (!first)
    return {
      definition: result.html
        ? `<p>${escape(textOfHtml(result.html, 300))}</p>`
        : "",
    };
  const definition = first.meanings
    .slice(0, 3)
    // the definitions end with a period, mostly
    .map(
      (m) =>
        `<p><i>${escape(m.partOfSpeech)}</i> ${m.definitions
          .slice(0, 2)
          .map((d, i) =>
            i > 0 && !/[.!?;]\s*(<\/[^>]+>\s*)*$/.test(m.definitions[i - 1])
              ? `; ${d}`
              : i > 0
                ? ` ${d}`
                : d,
          )
          .join("")}</p>`,
    )
    .join("");
  return { definition, language: first.language };
}

/**
 * The sentence a range is in, as offsets in the text of its block: from `start` to `end`,
 * or of a long one the words around, from `left` to `right`.
 */
function sentenceOf(range: Range) {
  const node = range.startContainer;
  const el = (
    node.nodeType === 1 ? node : node.parentElement
  ) as Element | null;
  const block =
    el?.closest("p, li, blockquote, dd, td, h1, h2, h3, h4, h5, h6") ?? el;
  if (!block) return undefined;
  // the offset of the word in the text of the block
  const before = range.cloneRange();
  before.selectNodeContents(block);
  before.setEnd(range.startContainer, range.startOffset);
  const at = before.toString().length;
  const text = block.textContent ?? "";
  const ends = /[.!?。！？…]+["'”’」』)]*\s*/g;
  let start = 0;
  let end = text.length;
  for (let m = ends.exec(text); m; m = ends.exec(text)) {
    const stop = m.index + m[0].length;
    if (stop <= at) start = stop;
    else {
      end = m.index + m[0].trimEnd().length;
      break;
    }
  }
  // a long sentence: the words around
  const MAX = 160;
  const from = Math.max(start, at - MAX);
  const to = Math.min(end, at + MAX);
  const cut = (i: number, back: boolean) => {
    const space = back ? text.lastIndexOf(" ", i) : text.indexOf(" ", i);
    return space < 0 ? i : space;
  };
  const left = from > start ? cut(from, false) : start;
  const right = to < end ? cut(to, true) : end;
  return { block, text, start, end, left, right };
}

/** The sentence of a word in the page: around the range selected. */
export function sentenceAround(range?: Range): string | undefined {
  try {
    if (!range) return undefined;
    const found = sentenceOf(range);
    if (!found) return undefined;
    const { text, start, end, left, right } = found;
    const sentence = text.slice(left, right).replace(/\s+/g, " ").trim();
    if (!sentence) return undefined;
    return `${left > start ? "… " : ""}${sentence}${right < end ? " …" : ""}`;
  } catch {
    return undefined;
  }
}

/** The range of the sentence a range is in, the text `sentenceAround` gives. */
export function sentenceRangeAround(range: Range): Range | undefined {
  try {
    const found = sentenceOf(range);
    if (!found) return undefined;
    const { block, text } = found;
    let { left, right } = found;
    while (left < right && /\s/.test(text[left])) left++;
    while (right > left && /\s/.test(text[right - 1])) right--;
    if (left >= right) return undefined;
    // the offsets in the text of the block, in its text nodes
    const doc = block.ownerDocument;
    const walker = doc.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const sentence = doc.createRange();
    let offset = 0;
    let started = false;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const length = (node as Text).data.length;
      if (!started && left < offset + length) {
        sentence.setStart(node, left - offset);
        started = true;
      }
      if (started && right <= offset + length) {
        sentence.setEnd(node, right - offset);
        return sentence;
      }
      offset += length;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

// the changes one at a time: each reads the file, then writes it
let queue: Promise<unknown> = Promise.resolve();

type Vocabulary = {
  /** the workspace of the entries loaded */
  ws?: string;
  entries: VocabularyEntry[];
  loaded: boolean;
  load: (ws: string) => Promise<void>;
  add: (
    ws: string,
    entry: Omit<VocabularyEntry, "id" | "addedAt">,
  ) => Promise<void>;
  remove: (ws: string, ids: string[]) => Promise<void>;
  recordReview: (ws: string, id: string) => Promise<void>;
  /** the gloss of a word, as the user writes it; empty: the one made of its definition */
  setGloss: (ws: string, id: string, gloss: string) => Promise<void>;
  /** keep a word translated to a language */
  setTranslation: (
    ws: string,
    id: string,
    lang: string,
    text: string,
  ) => Promise<void>;
  /** give a word kept its pronunciations, if it has none: kept before they were */
  addPronunciations: (
    ws: string,
    id: string,
    pronunciations: Pronunciation[],
  ) => Promise<void>;
};

export const useVocabulary = create<Vocabulary>((set) => {
  /** Change the file as it is now, then show it. */
  const change = (
    ws: string,
    fn: (entries: VocabularyEntry[]) => VocabularyEntry[] | undefined,
  ) => {
    const run = async () => {
      const entries = await readVocabulary(ws);
      const next = fn(entries);
      if (next) await writeVocabulary(ws, next);
      set({ ws, entries: next ?? entries, loaded: true });
    };
    const next = queue.then(run, run);
    queue = next.catch((e) =>
      console.error("Failed to save the vocabulary", e),
    );
    return next;
  };
  return {
    entries: [],
    loaded: false,
    load: async (ws) => {
      await queue;
      set({ ws, entries: await readVocabulary(ws), loaded: true });
    },
    add: (ws, entry) =>
      change(ws, (entries) => {
        if (entries.some((e) => sameWord(e, entry))) return undefined;
        const pronunciations = keptPronunciations(entry.pronunciations);
        const { pronunciations: _, ...rest } = entry;
        return [
          {
            ...rest,
            ...(pronunciations.length ? { pronunciations } : {}),
            word: entry.word.trim(),
            id: newNoteId(),
            addedAt: new Date().toISOString(),
          },
          ...entries,
        ];
      }),
    remove: (ws, ids) =>
      change(ws, (entries) => entries.filter((e) => !ids.includes(e.id))),
    setGloss: (ws, id, gloss) =>
      change(ws, (entries) => {
        const text = gloss.trim().slice(0, MAX_GLOSS);
        const at = entries.findIndex((e) => e.id === id);
        if (at < 0 || (entries[at].gloss ?? "") === text) return undefined;
        return entries.map((e, i) => {
          if (i !== at) return e;
          const { gloss: _, ...rest } = e;
          return text ? { ...rest, gloss: text } : rest;
        });
      }),
    setTranslation: (ws, id, lang, text) =>
      change(ws, (entries) => {
        const kept = keptTranslations({ [lang]: text });
        const at = entries.findIndex((e) => e.id === id);
        if (at < 0 || !kept[lang] || entries[at].translations?.[lang] === kept[lang])
          return undefined;
        return entries.map((e, i) =>
          i === at
            ? { ...e, translations: { ...e.translations, ...kept } }
            : e,
        );
      }),
    addPronunciations: (ws, id, list) =>
      change(ws, (entries) => {
        const pronunciations = keptPronunciations(list);
        const at = entries.findIndex((e) => e.id === id);
        if (
          !pronunciations.length ||
          at < 0 ||
          entries[at].pronunciations?.length
        )
          return undefined;
        return entries.map((e, i) => (i === at ? { ...e, pronunciations } : e));
      }),
    recordReview: (ws, id) =>
      change(ws, (entries) =>
        entries.map((e) =>
          e.id === id
            ? {
                ...e,
                reviewCount: (e.reviewCount ?? 0) + 1,
                lastReviewedAt: new Date().toISOString(),
              }
            : e,
        ),
      ),
  };
});

/** Reset the store; for tests. */
export const resetVocabulary = () => {
  queue = Promise.resolve();
  useVocabulary.setState({ ws: undefined, entries: [], loaded: false });
};
