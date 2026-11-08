import { textOfHtml, type VocabularyEntry } from "../vocabulary/vocabulary";
import { LENS_CLASS } from "./lensStyles";

/**
 * The word lens: the words of the vocabulary met in a book, with a short
 * meaning (a gloss) under them.
 *
 * The text of the book is left as it is: an empty marker is put before each
 * word met (its text node split there, not moved, so the ranges kept on it
 * — highlights, the selection, the place read — stay), and the gloss is drawn
 * by CSS (`::after { content: attr(data-gloss) }`, in the CSS of the pages,
 * see lensStyles.ts), not text: not selected,
 * copied, read aloud or searched. The marker is `cfi-inert`: CFIs are as
 * without it. The gloss sits in the space under the line (the line height is
 * made room for, see lensLineHeight), from the start of the word.
 */

export { LENS_CLASS } from "./lensStyles";

/** A word of the vocabulary, to be met in a book. */
export type LensWord = { id: string; word: string; gloss: string };

/** The longest gloss, in characters; CSS cuts it shorter if wide. */
const GLOSS_CHARS = 40;

const cut = (text: string, max = GLOSS_CHARS) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

/**
 * The gloss made of a definition kept: its first meaning, without the part
 * of speech, to the end of its first clause.
 */
export function glossOfDefinition(definition: string, word = ""): string {
  // the first meaning, its part of speech (<i>) left out
  const first =
    /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(definition)?.[1] ?? definition;
  let text = textOfHtml(first.replace(/^\s*<i>[^<]*<\/i>/i, ""));
  // an entry of a dictionary file starts with its headword, often
  const head = word.trim().toLowerCase();
  if (head && text.toLowerCase().startsWith(head))
    text = text.slice(head.length).replace(/^[\s:,.\-–—]+/, "");
  // its forms in brackets, as dictionaries give them: not its meaning
  text = text.replace(/^\s*[[(][^\])]*[\])]\s*/, "");
  // to the end of its first clause; an example in quotes left out
  text = text
    .replace(/\s*[“"].*$/, "")
    .split(/(?<=\w)[.;:]\s|\s\(|;\s?/)[0]
    .replace(/[.;:,]\s*$/, "")
    .trim();
  return cut(text);
}

/** The gloss of a word: as the user wrote it, translated (if asked), or of its definition. */
export function glossOf(entry: VocabularyEntry, translateTo?: string): string {
  if (entry.gloss?.trim()) return cut(entry.gloss.trim());
  const translated = translateTo ? entry.translations?.[translateTo] : "";
  if (translated) return cut(translated);
  return glossOfDefinition(entry.definition, entry.word);
}

// ------------------------------------------------------------------ matching

/** Written in a script with no spaces between words: met anywhere in the text. */
const NO_SPACES =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;

/**
 * The forms a word may be the inflection of, itself first (English: plurals,
 * -ed, -ing, -er, -est, 's): `rabbits` → rabbit; `stopped` → stop; `taking`
 * → take. Some are no words: they are only looked for in the vocabulary.
 */
export function baseForms(word: string): string[] {
  const w = word.toLowerCase().replace(/['’]s$/, "");
  const forms = new Set([word.toLowerCase(), w]);
  const add = (stem: string) => {
    if (stem.length >= 2) forms.add(stem);
  };
  const undouble = (stem: string) =>
    /([bcdfgklmnprstvz])\1$/.test(stem) ? stem.slice(0, -1) : undefined;
  if (w.endsWith("ies")) add(`${w.slice(0, -3)}y`);
  if (w.endsWith("es")) add(w.slice(0, -2));
  if (w.endsWith("s") && !w.endsWith("ss")) add(w.slice(0, -1));
  for (const end of ["ed", "ing", "er", "est"]) {
    if (!w.endsWith(end)) continue;
    const stem = w.slice(0, -end.length);
    add(stem);
    add(`${stem}e`);
    const single = undouble(stem);
    if (single) add(single);
    if (stem.endsWith("i")) add(`${stem.slice(0, -1)}y`);
  }
  return [...forms];
}

/** The words of the vocabulary, as looked for: by a form of a word, or as a whole (a phrase, CJK). */
export type Lexicon = {
  /** a word (and its base forms) to it */
  words: Map<string, LensWord>;
  /** phrases and words of CJK: met as they are written, case aside */
  literal?: RegExp;
  literals: Map<string, LensWord>;
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function lexiconOf(words: LensWord[]): Lexicon {
  const lexicon: Lexicon = { words: new Map(), literals: new Map() };
  const literal: string[] = [];
  for (const entry of words) {
    const word = entry.word.trim().replace(/\s+/g, " ");
    if (!word || !entry.gloss) continue;
    if (word.includes(" ") || NO_SPACES.test(word)) {
      const key = word.toLowerCase();
      if (lexicon.literals.has(key)) continue;
      lexicon.literals.set(key, entry);
      const body = word.split(" ").map(escapeRegExp).join("\\s+");
      // a phrase of words is met between word boundaries, CJK anywhere
      literal.push(
        NO_SPACES.test(word) ? body : `(?<!\\p{L})${body}(?!\\p{L})`,
      );
    } else {
      // the word itself first, then the forms it may be of
      for (const form of baseForms(word))
        if (!lexicon.words.has(form)) lexicon.words.set(form, entry);
    }
  }
  if (literal.length) {
    // the longest first: "take after" before "take"
    literal.sort((a, b) => b.length - a.length);
    lexicon.literal = new RegExp(literal.join("|"), "giu");
  }
  return lexicon;
}

/** The word of the vocabulary a word of the text is a form of, if any. */
export function lensWordOf(lexicon: Lexicon, token: string) {
  for (const form of baseForms(token)) {
    const found = lexicon.words.get(form);
    if (found) return found;
  }
  return undefined;
}

// --------------------------------------------------------------- the pages

/** not text to gloss */
const SKIPPED =
  "script, style, rt, rp, code, pre, kbd, samp, svg, math, head, textarea, [cfi-inert]";

const WORD = /\p{L}+(?:['’]\p{L}+)*/gu;

type Match = { start: number; end: number; entry: LensWord };

/** The words met in a text, not overlapping: phrases first, then single words. */
export function matchesIn(text: string, lexicon: Lexicon): Match[] {
  const found: Match[] = [];
  const taken = (start: number, end: number) =>
    found.some((m) => start < m.end && end > m.start);
  if (lexicon.literal) {
    lexicon.literal.lastIndex = 0;
    for (
      let m = lexicon.literal.exec(text);
      m;
      m = lexicon.literal.exec(text)
    ) {
      const entry = lexicon.literals.get(
        m[0].toLowerCase().replace(/\s+/g, " "),
      );
      if (entry)
        found.push({ start: m.index, end: m.index + m[0].length, entry });
      if (m[0].length === 0) lexicon.literal.lastIndex++;
    }
  }
  if (lexicon.words.size) {
    const re = new RegExp(WORD.source, WORD.flags);
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const entry = lensWordOf(lexicon, m[0]);
      if (entry && !taken(m.index, m.index + m[0].length))
        found.push({ start: m.index, end: m.index + m[0].length, entry });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

/** The glosses of a page taken away; the text as it was (its text nodes split, which is the same). */
export function removeLens(doc: Document) {
  doc.querySelectorAll(`.${LENS_CLASS}`).forEach((el) => el.remove());
}

/**
 * The words of the vocabulary in a page marked with their glosses: those
 * there before taken away first. Returns how many.
 */
export function applyLens(doc: Document, lexicon: Lexicon): number {
  removeLens(doc);
  if (!doc.body || (!lexicon.words.size && !lexicon.literal)) return 0;
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest(SKIPPED)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode())
    if ((n as Text).data.trim()) nodes.push(n as Text);
  let count = 0;
  for (const node of nodes) {
    const found = matchesIn(node.data, lexicon);
    // from the end: the offsets before stay as they are
    for (const { start, end, entry } of found.reverse()) {
      const word = start > 0 ? node.splitText(start) : node;
      const marker = doc.createElement("span");
      marker.className = LENS_CLASS;
      marker.setAttribute("cfi-inert", "");
      marker.setAttribute("aria-hidden", "true");
      marker.dataset.gloss = entry.gloss;
      marker.dataset.lens = entry.id;
      marker.dataset.length = String(end - start);
      word.parentNode?.insertBefore(marker, word);
      count++;
    }
  }
  return count;
}

/** The word a marker is put before, as a range of the text. */
export function rangeOfMarker(marker: Element): Range | undefined {
  const text = marker.nextSibling;
  if (!text || text.nodeType !== Node.TEXT_NODE) return undefined;
  const length = Math.min(
    Number((marker as HTMLElement).dataset.length) || 0,
    (text as Text).data.length,
  );
  if (!length) return undefined;
  const range = marker.ownerDocument.createRange();
  range.setStart(text, 0);
  range.setEnd(text, length);
  return range;
}
