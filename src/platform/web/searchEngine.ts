/**
 * Full-text search of the web version (MiniSearch), the stand-in of the
 * search of src-tauri/src/index/search.rs: notes and the sections of books,
 * the words of all languages cut by Intl.Segmenter where available.
 */
import MiniSearch from 'minisearch';

export type SearchDoc = { id: string; kind: 'note' | 'book'; title: string; label: string; body: string };

export type SearchHit = {
  id: string;
  kind: string;
  title: string;
  label: string;
  /** the text around the words found, the words in <b>, HTML escaped */
  snippet: string;
  score: number;
};

type Segmenter = { segment: (text: string) => Iterable<{ segment: string; isWordLike?: boolean }> };

const segmenter: Segmenter | undefined = (() => {
  try {
    const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: object) => Segmenter }).Segmenter;
    return Seg ? new Seg(undefined, { granularity: 'word' }) : undefined;
  } catch {
    return undefined;
  }
})();

/** The words of a text: by the segmenter of the browser, else by spaces and punctuation. */
export function tokenize(text: string): string[] {
  if (segmenter) {
    const words: string[] = [];
    for (const { segment, isWordLike } of segmenter.segment(text)) {
      if (isWordLike) words.push(segment);
    }
    return words;
  }
  return text.split(/[\s\p{P}\p{S}]+/u).filter(Boolean);
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The text around the first word found, the words in <b>. */
export function snippetOf(body: string, words: string[], size = 160): string {
  const lower = body.toLowerCase();
  const found = words.map((w) => w.toLowerCase()).filter(Boolean);
  const first = found.map((w) => lower.indexOf(w)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, first - Math.floor(size / 3));
  const text = body.slice(start, start + size).replace(/\s+/g, ' ');
  if (found.length === 0) return escapeHtml(text);
  const pattern = new RegExp(`(${found.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return text.split(pattern).map((part, i) => (i % 2 ? `<b>${escapeHtml(part)}</b>` : escapeHtml(part))).join('');
}

export class SearchEngine {
  private index = new MiniSearch<SearchDoc>({
    fields: ['title', 'body'],
    storeFields: ['kind', 'title', 'label', 'body'],
    tokenize,
    processTerm: (term) => term.toLowerCase(),
    searchOptions: { boost: { title: 2 }, combineWith: 'AND', prefix: true },
  });

  private docIds = new Set<string>();

  put(doc: SearchDoc) {
    if (this.docIds.has(doc.id)) this.index.discard(doc.id);
    this.index.add(doc);
    this.docIds.add(doc.id);
  }

  delete(id: string) {
    if (!this.docIds.has(id)) return;
    this.index.discard(id);
    this.docIds.delete(id);
  }

  /** Delete the documents whose id starts with the prefix, e.g. of a book or a dir. */
  deletePrefix(prefix: string) {
    for (const id of [...this.docIds]) {
      if (id.startsWith(prefix)) this.delete(id);
    }
  }

  ids(): string[] {
    return [...this.docIds];
  }

  clear() {
    this.index.removeAll();
    this.docIds.clear();
  }

  search(query: string, kind: string | undefined, limit: number): SearchHit[] {
    // "a phrase" is searched as its words
    const q = query.replace(/"/g, ' ').trim();
    if (!q) return [];
    const words = tokenize(q);
    return this.index
      .search(q, kind ? { filter: (r) => r.kind === kind } : undefined)
      .slice(0, limit)
      .map((r) => ({
        id: String(r.id),
        kind: r.kind,
        title: r.title,
        label: r.label ?? '',
        snippet: snippetOf(r.body ?? '', words),
        score: r.score,
      }));
  }
}
