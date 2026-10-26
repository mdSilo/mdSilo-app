import { invoke } from '@tauri-apps/api/core';
import type { BookDoc, TOCItem } from './document';

/**
 * The text of a book in the full-text search of the workspace (see
 * src-tauri/src/index): by sections, found as `book:<id>#<cfi>`. Once per
 * book, in the background, after it is opened. Not the books of pages
 * (PDF, comics): their text is not at hand without rendering them.
 */
export const MAX_SECTION_TEXT = 200_000;

/** The label of each section, of the table of contents. */
export function sectionLabels(book: BookDoc): Map<number, string> {
  const labels = new Map<number, string>();
  const ids = new Map(book.sections.map((s, i) => [s.id, i]));
  const walk = (items?: TOCItem[] | null) => {
    for (const item of items ?? []) {
      const [id] = book.splitTOCHref?.(item.href) ?? [];
      const index = typeof id === 'number' ? id : ids.get(String(id));
      if (index !== undefined && !labels.has(index) && item.label?.trim()) labels.set(index, item.label.trim());
      walk(item.subitems);
    }
  };
  walk(book.toc);
  // a section without its own entry: of the one before
  let last = '';
  book.sections.forEach((_, i) => {
    if (labels.has(i)) last = labels.get(i)!;
    else if (last) labels.set(i, last);
  });
  return labels;
}

const BLOCKS = new Set([
  'p', 'div', 'section', 'article', 'aside', 'header', 'footer', 'blockquote', 'pre', 'li', 'ul', 'ol',
  'dl', 'dt', 'dd', 'table', 'tr', 'td', 'th', 'figure', 'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
]);

/** The text of a document, the blocks apart: no words run together. */
export function textOf(doc: Document): string {
  const body = doc.body ?? doc.documentElement;
  if (!body) return '';
  const blockOf = (node: Node) => {
    let el = node.parentElement;
    while (el && el !== body && !BLOCKS.has(el.localName)) el = el.parentElement;
    return el;
  };
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  let out = '';
  let lastBlock: Element | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const block = blockOf(node);
    if (out && block !== lastBlock) out += ' ';
    out += node.nodeValue ?? '';
    lastBlock = block;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** The CFI of a section, as foliate-js makes them. */
export const sectionCfi = (book: BookDoc, index: number) =>
  book.sections[index]?.cfi ?? `epubcfi(/6/${(index + 1) * 2})`;

let running: Promise<void> | undefined;

/** Index the text of the book, unless it is already. */
export function indexBookText(hash: string, title: string, book: BookDoc): Promise<void> {
  const run = async () => {
    if (book.rendition?.layout === 'pre-paginated') return;
    if (await invoke<boolean>('index_book_indexed', { hash }).catch(() => true)) return;
    const labels = sectionLabels(book);
    const sections: { cfi: string; label: string; text: string }[] = [];
    for (const [i, section] of book.sections.entries()) {
      if (!section.createDocument) continue;
      try {
        const doc = await section.createDocument();
        const text = textOf(doc).slice(0, MAX_SECTION_TEXT);
        if (text) sections.push({ cfi: `${sectionCfi(book, i)}`, label: labels.get(i) ?? '', text });
      } catch {
        // a section failing: the others still
      }
      // let the page breathe
      await new Promise((r) => setTimeout(r, 0));
    }
    if (sections.length > 0) await invoke('index_book', { hash, title, sections });
  };
  // one book at a time
  const next = (running ?? Promise.resolve()).then(run, run).catch((e) => {
    console.warn('Failed to index the text of the book', e);
  });
  running = next;
  return next;
}
