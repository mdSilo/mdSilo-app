import { invoke } from '@tauri-apps/api/core';
import { store } from '@/state/store';
import { indexOf } from '@/lib/linkIndex';
import { safeDecode } from '@/lib/mdlink';
import { bookLinks, bookRefOf } from '@/lib/parseNote';
import { fromWorkspacePath } from '@/workspace/util';
import type { Issue } from '@/issue/types';
import { issueTexts } from '@/issue/refs';
import type { BookEntry } from '../library/library';
import { loadBooks } from '../library/books';
import { annotationsPathOf, bookHref, parseAnnotations, type BookNote } from './annotations';

/**
 * The links to books: `book:<id>#<cfi>`, as the reader makes them and `{{`
 * in the editor inserts, or `book:<title>`, as `{{title}}` reads.
 */

/** What a `book:` link points to: a book by id (and a place in it), or by title. */
export function parseBookLink(href: string): { ref: string; cfi?: string } | undefined {
  const match = href.trim().match(/^book:([^#]+)(?:#(.+))?$/i);
  if (!match) return undefined;
  const ref = bookRefOf(match[1]);
  if (!ref) return undefined;
  const cfi = match[2] ? safeDecode(match[2]) : undefined;
  return { ref, ...(cfi ? { cfi } : {}) };
}

/** A ref of a book by its id, not by its title. */
export const isBookId = (ref: string) => /^[0-9a-f]{32}$/.test(ref);

/** The book of a ref, see bookRefOf: by its id, else by its title (case ignored). */
export function findBook(books: Record<string, BookEntry>, ref: string): BookEntry | undefined {
  if (books[ref]) return books[ref];
  const title = ref.toLowerCase();
  return Object.values(books).find((b) => b.title.trim().toLowerCase() === title);
}

/** The ids of the books linked in a markdown text, known in the library. */
export function linkedBookIds(books: Record<string, BookEntry>, text: string): string[] {
  return resolve(books, bookLinks(text));
}

const resolve = (books: Record<string, BookEntry>, refs: Iterable<string>) => {
  const ids = new Set<string>();
  for (const ref of refs) {
    const book = findBook(books, ref);
    if (book) ids.add(book.hash);
  }
  return [...ids];
};

/** The notes linking to a book: by id or by title. */
export function notesLinkingBook(books: Record<string, BookEntry>, hash: string) {
  const { notes } = store.getState();
  const index = indexOf(notes);
  return notes.values()
    .filter((n) => !n.is_dir && resolve(books, index.books(n.id)).includes(hash))
    .map((n) => ({ id: n.id, title: n.title }));
}

/** The issues linking to a book in their body or comments. */
export const issuesLinkingBook = (books: Record<string, BookEntry>, issues: Issue[], hash: string) =>
  issues.filter((i) => issueTexts(i).some((t) => linkedBookIds(books, t).includes(hash)));

// the annotations read, per file, until it changes
const annotationsCache = new Map<string, { stamp: string; notes: BookNote[] }>();

/** The annotations of a book, from its notes file: none if no such note. */
async function annotationsOf(ws: string, book: BookEntry): Promise<BookNote[]> {
  const path = annotationsPathOf(fromWorkspacePath(ws, book.file));
  const note = store.getState().notes.get(path);
  if (!note) return [];
  const stamp = note.content ? note.content : note.updated_at;
  const cached = annotationsCache.get(path);
  if (cached?.stamp === stamp) return cached.notes;
  const content = note.content || (await invoke<string>('read_file', { filePath: path }).catch(() => ''));
  const notes = parseAnnotations(content ?? '').notes;
  annotationsCache.set(path, { stamp, notes });
  return notes;
}

export type ItemResult = { title: string; subtitle?: string; url: string };

const excerpt = (text: string, max = 60) => {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

/**
 * The books by title or author, and their annotations by text or note: to
 * link them, `{{` in the editor.
 */
export async function searchBookItems(text: string, limit = 10): Promise<ItemResult[]> {
  const term = text.trim().toLowerCase();
  const ws = store.getState().initDir;
  if (!term || !ws) return [];
  const books = Object.values(await loadBooks());
  const results: ItemResult[] = books
    .filter((b) => `${b.title} ${b.author}`.toLowerCase().includes(term))
    .slice(0, limit)
    .map((b) => ({ title: b.title, subtitle: b.author || undefined, url: bookHref(b.hash) }));
  for (const book of books) {
    if (results.length >= limit) break;
    for (const note of await annotationsOf(ws, book)) {
      if (results.length >= limit) break;
      if (note.type !== 'annotation' || !note.text) continue;
      if (!`${note.text} ${note.note}`.toLowerCase().includes(term)) continue;
      results.push({
        title: excerpt(note.text),
        subtitle: [book.title, note.chapter].filter(Boolean).join(' · '),
        url: bookHref(book.hash, note.cfi),
      });
    }
  }
  return results;
}
