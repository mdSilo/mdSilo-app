import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { joinPath } from '@/file/util';
import { DATA_DIR } from '@/workspace/layout';
import { newNoteId } from './annotations';
import type { DictionaryResult } from './lookup';

/**
 * The words to learn, met in the books and looked up in the dictionary, as in
 * the vocabulary book of readup; with the sentence each was met in and a link
 * back to it. In the workspace, synced with it:
 *
 *   .mdsilo/vocabulary.json   { version, entries: [...] }, the newest first
 *
 * Each change is made to the file as it is then (another device may have
 * changed it), one change at a time.
 */
export const VOCABULARY_FILE = 'vocabulary.json';
export const VOCABULARY_VERSION = 1;

export type VocabularyEntry = {
  id: string;
  word: string;
  /** HTML, short: the first meanings, from the dictionary (sanitized) */
  definition: string;
  /** the language of the word, e.g. en */
  language?: string;
  /** e.g. wiktionary */
  source?: string;
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
    const text = await invoke<string>('read_file', { filePath: pathOf(ws) });
    if (!text?.trim()) return [];
    const data = JSON.parse(text) as Partial<VocabularyFile>;
    return (data.entries ?? []).filter((e) => e?.id && e.word);
  } catch (e) {
    if (e instanceof SyntaxError) console.error(`${pathOf(ws)} is not valid JSON`, e);
    return [];
  }
}

async function writeVocabulary(ws: string, entries: VocabularyEntry[]) {
  const text = `${JSON.stringify({ version: VOCABULARY_VERSION, entries }, null, 2)}\n`;
  await invoke('write_file', { filePath: pathOf(ws), text });
}

/** The same word: case aside, in the same language if both say it. */
export const sameWord = (a: { word: string; language?: string }, b: { word: string; language?: string }) =>
  a.word.trim().toLowerCase() === b.word.trim().toLowerCase()
  && (!a.language || !b.language || a.language === b.language);

const escape = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/** The definition kept for a word: the first meanings of the first entry. */
export function definitionOf(result: DictionaryResult): { definition: string; language?: string } {
  const first = result.entries[0];
  if (!first) return { definition: '' };
  const definition = first.meanings
    .slice(0, 3)
    // the definitions end with a period, mostly
    .map((m) => `<p><i>${escape(m.partOfSpeech)}</i> ${m.definitions.slice(0, 2)
      .map((d, i) => (i > 0 && !/[.!?;]\s*(<\/[^>]+>\s*)*$/.test(m.definitions[i - 1]) ? `; ${d}` : i > 0 ? ` ${d}` : d))
      .join('')}</p>`)
    .join('');
  return { definition, language: first.language };
}

/** The sentence of a word in the page: around the range selected. */
export function sentenceAround(range?: Range): string | undefined {
  try {
    if (!range) return undefined;
    const node = range.startContainer;
    const el = (node.nodeType === 1 ? node : node.parentElement) as Element | null;
    const block = el?.closest('p, li, blockquote, dd, td, h1, h2, h3, h4, h5, h6') ?? el;
    if (!block) return undefined;
    // the offset of the word in the text of the block
    const before = range.cloneRange();
    before.selectNodeContents(block);
    before.setEnd(range.startContainer, range.startOffset);
    const at = before.toString().length;
    const text = block.textContent ?? '';
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
      const space = back ? text.lastIndexOf(' ', i) : text.indexOf(' ', i);
      return space < 0 ? i : space;
    };
    const left = from > start ? cut(from, false) : start;
    const right = to < end ? cut(to, true) : end;
    const sentence = text.slice(left, right).replace(/\s+/g, ' ').trim();
    if (!sentence) return undefined;
    return `${left > start ? '… ' : ''}${sentence}${right < end ? ' …' : ''}`;
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
  add: (ws: string, entry: Omit<VocabularyEntry, 'id' | 'addedAt'>) => Promise<void>;
  remove: (ws: string, ids: string[]) => Promise<void>;
  recordReview: (ws: string, id: string) => Promise<void>;
};

export const useVocabulary = create<Vocabulary>((set) => {
  /** Change the file as it is now, then show it. */
  const change = (ws: string, fn: (entries: VocabularyEntry[]) => VocabularyEntry[] | undefined) => {
    const run = async () => {
      const entries = await readVocabulary(ws);
      const next = fn(entries);
      if (next) await writeVocabulary(ws, next);
      set({ ws, entries: next ?? entries, loaded: true });
    };
    const next = queue.then(run, run);
    queue = next.catch((e) => console.error('Failed to save the vocabulary', e));
    return next;
  };
  return {
    entries: [],
    loaded: false,
    load: async (ws) => {
      await queue;
      set({ ws, entries: await readVocabulary(ws), loaded: true });
    },
    add: (ws, entry) => change(ws, (entries) => {
      if (entries.some((e) => sameWord(e, entry))) return undefined;
      return [{ ...entry, word: entry.word.trim(), id: newNoteId(), addedAt: new Date().toISOString() }, ...entries];
    }),
    remove: (ws, ids) => change(ws, (entries) => entries.filter((e) => !ids.includes(e.id))),
    recordReview: (ws, id) => change(ws, (entries) => entries.map((e) => (e.id === id
      ? { ...e, reviewCount: (e.reviewCount ?? 0) + 1, lastReviewedAt: new Date().toISOString() }
      : e))),
  };
});

/** Reset the store; for tests. */
export const resetVocabulary = () => {
  queue = Promise.resolve();
  useVocabulary.setState({ ws: undefined, entries: [], loaded: false });
};
