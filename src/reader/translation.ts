import { invoke } from '@tauri-apps/api/core';
import { joinPath } from '@/workspace/util';
import { DATA_DIR } from '@/workspace/layout';
import { createZip } from '@/host/web/zip';
import { readZip } from './convert';

/**
 * The book translated as it is read (as readup does): each paragraph shown
 * gets its translation under it, or in place of it. The translations are
 * kept per book, to show them again at once and to make of them a whole
 * translated book (an EPUB, see `translatedEpub`).
 */

/** the translation added to a paragraph: invisible to CFIs, search, speech */
export const TRANSLATION_CLASS = 'mdsilo-translation';
/** the text of a paragraph hidden, the translation only shown: kept for the CFIs */
const SOURCE_CLASS = 'mdsilo-source';
const STYLE_ID = 'mdsilo-translation-style';

/** The text of a paragraph as the key of its translation: the spaces as one. */
export const keyOf = (text: string) => text.replace(/\s+/g, ' ').trim();

// not text to translate
const SKIPPED = new Set(['script', 'style', 'link', 'pre', 'code', 'math', 'svg', 'rt', 'rp', 'head']);
// inline: their text is of the paragraph around them
const INLINE = new Set(['span', 'a', 'em', 'strong', 'i', 'b', 'u', 's', 'small', 'sup', 'sub', 'cite', 'q', 'mark', 'abbr', 'ruby', 'font']);

const hasOwnText = (el: Element) => Array.from(el.childNodes).some((node) =>
  (node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
  || (node.nodeType === Node.ELEMENT_NODE && INLINE.has((node as Element).localName) && node.textContent?.trim()));

/** The paragraphs of a page, in order: the elements with text of their own, not what was added. */
export function blocksOf(root: Element | null | undefined): Element[] {
  const blocks: Element[] = [];
  const walk = (el: Element, depth: number) => {
    if (depth > 30) return;
    for (const child of Array.from(el.children)) {
      if (SKIPPED.has(child.localName) || child.classList.contains(TRANSLATION_CLASS)) continue;
      // the text hidden, the paragraph it is of: there already
      if (child.classList.contains(SOURCE_CLASS)) continue;
      if (hasOwnText(child)) blocks.push(child);
      else walk(child, depth + 1);
    }
  };
  if (root) walk(root, 0);
  return blocks;
}

/** The text of a paragraph to translate: without its translation, if added. */
export function sourceTextOf(block: Element): string {
  const clone = block.cloneNode(true) as Element;
  clone.querySelectorAll(`.${TRANSLATION_CLASS}`).forEach((el) => el.remove());
  return keyOf(clone.textContent ?? '');
}

const rtl = (lang: string) => /^(ar|he|fa|ur|ps|yi)\b/i.test(lang);

function addStyle(doc: Document) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.${TRANSLATION_CLASS} { display: block; margin-top: 0.25em; opacity: 0.75; user-select: none; -webkit-user-select: none; }
.${TRANSLATION_CLASS}.only { margin-top: 0; opacity: 1; }
.${SOURCE_CLASS} { display: none; }`;
  (doc.head ?? doc.documentElement).append(style);
}

/** The translation shown with a paragraph: under it, or in place of it. */
export function showTranslation(block: Element, text: string, lang: string, only: boolean) {
  const doc = block.ownerDocument;
  if (block.querySelector(`:scope > .${TRANSLATION_CLASS}`)) return;
  addStyle(doc);
  if (only) {
    // hidden, not removed: the highlights and CFIs on the text stay
    const hider = doc.createElement('span');
    hider.className = SOURCE_CLASS;
    hider.setAttribute('cfi-skip', '');
    hider.append(...Array.from(block.childNodes));
    block.append(hider);
  }
  const el = doc.createElement('span');
  el.className = only ? `${TRANSLATION_CLASS} only` : TRANSLATION_CLASS;
  el.setAttribute('cfi-inert', '');
  el.setAttribute('lang', lang);
  el.setAttribute('dir', rtl(lang) ? 'rtl' : 'ltr');
  el.textContent = text;
  block.append(el);
}

/** The translations of a page removed, its text shown again. */
export function removeTranslations(doc: Document) {
  doc.querySelectorAll(`.${TRANSLATION_CLASS}`).forEach((el) => el.remove());
  doc.querySelectorAll(`.${SOURCE_CLASS}`).forEach((el) => el.replaceWith(...Array.from(el.childNodes)));
}

/** The paragraphs of a page about a range: those in it, and some before and after it. */
export function blocksAround(blocks: Element[], range: Range | undefined, before = 2, after = 5): Element[] {
  if (!range) return blocks.slice(0, after);
  const touches = (block: Element) => {
    try {
      return range.intersectsNode(block);
    } catch {
      return false;
    }
  };
  const first = blocks.findIndex(touches);
  if (first < 0) return [];
  let last = first;
  while (last + 1 < blocks.length && touches(blocks[last + 1])) last++;
  return blocks.slice(Math.max(0, first - before), last + 1 + after);
}

// the translations kept, per book

type TranslationsFile = {
  version: number;
  /** per service and language (`google:fr`): the text of a paragraph to its translation */
  translations: Record<string, Record<string, string>>;
};

export const scopeOf = (translator: string, lang: string) => `${translator}:${lang}`;
const pathOf = 
  (ws: string, hash: string, ty = 'translations') => joinPath(ws, DATA_DIR, ty, `${hash}.json`);
const SAVE_DELAY_MS = 2000;

/** The translations of a book: read once, written a moment after a change. */
export class BookTranslations {
  private data: TranslationsFile['translations'] = {};
  private loaded?: Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(private ws: string, private hash: string) {}

  load(): Promise<void> {
    this.loaded ??= invoke<string>('read_file', { filePath: pathOf(this.ws, this.hash) })
      .then((text) => {
        const parsed = text?.trim() ? (JSON.parse(text) as Partial<TranslationsFile>) : {};
        this.data = { ...(parsed.translations ?? {}), ...this.data };
      })
      .catch(() => undefined);
    return this.loaded;
  }

  get(scope: string, key: string): string | undefined {
    return this.data[scope]?.[key];
  }

  /** all of a service and language */
  of(scope: string): Record<string, string> {
    return this.data[scope] ?? {};
  }

  set(scope: string, key: string, text: string) {
    (this.data[scope] ??= {})[key] = text;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), SAVE_DELAY_MS);
  }

  async flush() {
    clearTimeout(this.timer);
    this.timer = undefined;
    await this.loaded;
    const text = `${JSON.stringify({ version: 1, translations: this.data })}\n`;
    await invoke(
      'write_file', { filePath: pathOf(this.ws, this.hash), text }
    )
    .catch((e: unknown) =>console.error('Failed to save the translations', e));
  }
}

// the translated book

const decoder = new TextDecoder();
const encoder = new TextEncoder();

/** The pages of an EPUB to translate, in the order of its spine: their paths in the zip. */
function spineOf(files: Map<string, Uint8Array>): { opf: string; pages: string[] } {
  const container = files.get('META-INF/container.xml');
  const opf = container && new DOMParser().parseFromString(decoder.decode(container), 'application/xml')
    .querySelector('rootfile')?.getAttribute('full-path');
  if (!opf || !files.has(opf)) throw new Error('Not an EPUB: no package file');
  const doc = new DOMParser().parseFromString(decoder.decode(files.get(opf)!), 'application/xml');
  const dir = opf.includes('/') ? opf.slice(0, opf.lastIndexOf('/') + 1) : '';
  const hrefs = new Map(Array.from(doc.getElementsByTagName('item')).map((item) => [item.getAttribute('id'), item]));
  const pages = Array.from(doc.getElementsByTagName('itemref'))
    .map((ref) => hrefs.get(ref.getAttribute('idref')))
    .filter((item): item is Element => Boolean(item && /html/.test(item.getAttribute('media-type') ?? '')))
    .map((item) => decodeURIComponent(dir + (item.getAttribute('href') ?? '')));
  return { opf, pages: pages.filter((p) => files.has(p)) };
}

const parseXhtml = (data: Uint8Array) => new DOMParser().parseFromString(decoder.decode(data), 'application/xhtml+xml');
const parsed = (doc: Document) => !doc.getElementsByTagName('parsererror').length;

/** The paragraphs of an EPUB, and how many of them are translated in a scope. */
export async function translatedCount(epub: Uint8Array, translations: Record<string, string>) {
  const files = new Map((await readZip(epub)).map((f) => [f.name, f.data]));
  let total = 0;
  let done = 0;
  const missing: string[] = [];
  for (const page of spineOf(files).pages) {
    const doc = parseXhtml(files.get(page)!);
    if (!parsed(doc)) continue;
    for (const block of blocksOf(doc.body ?? doc.documentElement)) {
      const key = sourceTextOf(block);
      if (!key) continue;
      total++;
      if (translations[key]) done++;
      else missing.push(key);
    }
  }
  return { total, done, missing };
}

/**
 * The translations kept put in a page of a book to save: under each
 * paragraph, or in place of it (the paragraph then says its language).
 * @returns how many paragraphs were translated, and not
 */
export function translateDoc(doc: Document, translations: Record<string, string>, lang: string, only: boolean) {
  let translated = 0;
  let missing = 0;
  for (const block of blocksOf(doc.body ?? doc.documentElement)) {
    const key = sourceTextOf(block);
    const text = translations[key];
    if (!text) {
      if (key) missing++;
      continue;
    }
    // the same as the text (in that language already): as it is, not twice
    if (keyOf(text) === key) continue;
    if (only) {
      block.replaceChildren(doc.createTextNode(text));
      block.setAttribute('lang', lang);
      if (doc.documentElement.namespaceURI === XHTML) block.setAttribute('xml:lang', lang);
    } else {
      const el = doc.createElementNS(XHTML, 'span');
      el.setAttribute('class', TRANSLATION_CLASS);
      el.setAttribute('lang', lang);
      el.setAttribute('style', 'display: block; margin-top: 0.25em; opacity: 0.75;');
      el.textContent = text;
      block.append(el);
    }
    translated++;
  }
  return { translated, missing };
}

const XHTML = 'http://www.w3.org/1999/xhtml';

/**
 * The EPUB with the translations kept: under each paragraph, or in place of
 * it; the paragraphs not translated as they are. Its title says the language;
 * the language of the book is it once all is translated, in its place (else
 * each paragraph translated says its own, the others keep the book's).
 */
export async function translatedEpub(
  epub: Uint8Array, translations: Record<string, string>, lang: string, only: boolean,
): Promise<Uint8Array> {
  const zipped = await readZip(epub);
  const files = new Map(zipped.map((f) => [f.name, f.data]));
  const { opf, pages } = spineOf(files);
  const serializer = new XMLSerializer();
  let untranslated = 0;
  for (const page of pages) {
    const doc = parseXhtml(files.get(page)!);
    if (!parsed(doc)) continue;
    const { translated, missing } = translateDoc(doc, translations, lang, only);
    untranslated += missing;
    if (translated) files.set(page, encoder.encode(serializer.serializeToString(doc)));
  }
  // the title, and the language if only the translation
  const pkg = new DOMParser().parseFromString(decoder.decode(files.get(opf)!), 'application/xml');
  const title = pkg.getElementsByTagNameNS('*', 'title')[0];
  if (title) title.textContent = `${title.textContent ?? ''} (${lang})`;
  const language = pkg.getElementsByTagNameNS('*', 'language')[0];
  if (only && !untranslated && language) language.textContent = lang;
  // another book: not the same identifier
  const id = pkg.getElementsByTagNameNS('*', 'identifier')[0];
  if (id) id.textContent = `${id.textContent ?? ''}-${lang}`;
  files.set(opf, encoder.encode(serializer.serializeToString(pkg)));
  // the mimetype first, as an EPUB has it
  const names = ['mimetype', ...zipped.map((f) => f.name).filter((n) => n !== 'mimetype')];
  const blob = createZip(names.filter((n) => files.has(n)).map((name) => ({ name, data: files.get(name)! })));
  return new Uint8Array(await blob.arrayBuffer());
}

const books = new Map<string, BookTranslations>();

/** The translations of a book, one for all who use them. */
export function translationsOf(ws: string, hash: string): BookTranslations {
  const key = `${ws}\n${hash}`;
  let found = books.get(key);
  if (!found) books.set(key, (found = new BookTranslations(ws, hash)));
  return found;
}
