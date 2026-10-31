import type { FolderImportOptions } from './folderImport';
import type { BookEntry, BookState } from './library';

/**
 * The library as a shelf, as in readup: the books filtered, grouped by the
 * groups of the user (nested by `/`), by author, series or status, sorted.
 */
export type ShelfBook = BookEntry & {
  /** the book file on this device */
  path: string;
  /** the book file is here, not only synced from elsewhere */
  here: boolean;
  state?: BookState;
};

export type ShelfGroup = {
  /** the group opened by this key: the full path of a group of the user, else the name */
  key: string;
  /** as shown: the last part of the path of a group of the user */
  name: string;
  books: ShelfBook[];
};

export type ShelfItem = ShelfBook | ShelfGroup;

export type ViewMode = 'grid' | 'list';
export type GroupBy = 'none' | 'group' | 'author' | 'series' | 'status';
export type SortBy = 'title' | 'author' | 'format' | 'series' | 'read' | 'added' | 'published';

/** How the library shows; kept with the user settings. */
export type LibrarySettings = {
  view: ViewMode;
  groupBy: GroupBy;
  sortBy: SortBy;
  ascending: boolean;
  /** the choices of the last import from a folder */
  folderImport?: FolderImportOptions;
};

export const DEFAULT_LIBRARY_SETTINGS: LibrarySettings = {
  view: 'grid',
  groupBy: 'group',
  sortBy: 'read',
  ascending: false,
};

/** The statuses offered, others can be typed. */
export const STATUSES = ['Todo', 'Doing', 'Done'];

export const isGroup = (item: ShelfItem): item is ShelfGroup => 'books' in item;

/** The text of some HTML, e.g. a description. */
export function plainText(html = '') {
  if (!html.includes('<') && !html.includes('&')) return html.trim();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** `Jane Doe, John Roe & Kim` as the names. */
export const parseAuthors = (authors = '') =>
  authors.split(/\s*(?:,|&|;|\band\b)\s*/i).map((a) => a.trim()).filter(Boolean);

/** e.g. `Dune #2 of 6` */
export function formatSeries(book: Pick<BookEntry, 'series' | 'seriesIndex' | 'seriesTotal'>) {
  if (!book.series) return '';
  const index = book.seriesIndex != null ? ` #${book.seriesIndex}` : '';
  const total = book.seriesIndex != null && book.seriesTotal ? ` of ${book.seriesTotal}` : '';
  return `${book.series}${index}${total}`;
}

/**
 * The books matching the query: a regular expression if it is one, else
 * the words, in the title, author, format, group, status, series, subjects
 * and description.
 */
export function filterBooks(books: ShelfBook[], query: string) {
  const term = query.trim();
  if (!term) return books;
  let test: (text: string) => boolean;
  try {
    const re = new RegExp(term, 'i');
    test = (text) => re.test(text);
  } catch {
    const lower = term.toLowerCase();
    test = (text) => text.toLowerCase().includes(lower);
  }
  return books.filter((b) => [
    b.title, b.author, b.format, b.group, b.status, b.series, ...(b.subjects ?? []), plainText(b.description),
  ].some((text) => text && test(text)));
}

/**
 * The items of a level of the shelf: in the group opened, if any.
 * - group: the books right in the group (or in none), its sub groups
 * - author, series, status: the groups and the books in none; in a group, its books
 */
export function shelfItems(books: ShelfBook[], groupBy: GroupBy, opened = ''): ShelfItem[] {
  if (groupBy === 'none') return books;
  if (groupBy === 'group') return groupLevel(books, opened);
  const groups = new Map<string, ShelfBook[]>();
  const loose: ShelfBook[] = [];
  for (const book of books) {
    const keys = groupBy === 'author'
      ? parseAuthors(book.author)
      : [(groupBy === 'series' ? book.series : book.status)?.trim() ?? ''].filter(Boolean);
    if (keys.length === 0) loose.push(book);
    for (const key of keys) groups.set(key, [...(groups.get(key) ?? []), book]);
  }
  if (opened) return groups.get(opened) ?? [];
  return [...[...groups].map(([key, list]) => ({ key, name: key, books: list })), ...loose];
}

function groupLevel(books: ShelfBook[], parent: string): ShelfItem[] {
  const groups = new Map<string, ShelfGroup>();
  const direct: ShelfBook[] = [];
  for (const book of books) {
    const group = book.group ?? '';
    if (group === parent) {
      direct.push(book);
      continue;
    }
    if (parent && !group.startsWith(`${parent}/`)) continue;
    const rest = parent ? group.slice(parent.length + 1) : group;
    const name = rest.split('/')[0];
    const key = parent ? `${parent}/${name}` : name;
    const found = groups.get(key);
    if (found) found.books.push(book);
    else groups.set(key, { key, name, books: [book] });
  }
  return [...groups.values(), ...direct];
}

/** Whether a group of the shelf has books. */
export function hasGroup(books: ShelfBook[], groupBy: GroupBy, key: string) {
  if (groupBy === 'group') return books.some((b) => b.group === key || b.group?.startsWith(`${key}/`));
  return shelfItems(books, groupBy, key).length > 0;
}

const time = (date?: string) => {
  const t = date ? new Date(date).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
};

type SortValue = string | number;

function bookValue(book: ShelfBook, sortBy: SortBy): SortValue {
  switch (sortBy) {
    case 'title': return book.title;
    case 'author': return book.author;
    case 'format': return book.format;
    case 'series': return book.series ?? '';
    case 'added': return time(book.addedAt);
    case 'published': return time(book.published);
    case 'read':
    default: return time(book.state?.updatedAt);
  }
}

function groupValue(group: ShelfGroup, sortBy: SortBy, groupBy: GroupBy): SortValue {
  const values = group.books.map((b) => bookValue(b, sortBy));
  if (typeof values[0] === 'number') return Math.max(...(values as number[]));
  // the books of a series, of a group: by the author of the first one
  if (sortBy === 'author' && groupBy !== 'author' && group.books[0]) return group.books[0].author;
  return group.name;
}

const compare = (a: SortValue, b: SortValue) =>
  typeof a === 'number' && typeof b === 'number'
    ? a - b
    : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });

/** By the series index, those without one after; else 0. */
const bySeriesIndex = (a: ShelfBook, b: ShelfBook) =>
  a.seriesIndex != null && b.seriesIndex != null
    ? a.seriesIndex - b.seriesIndex
    : a.seriesIndex != null ? -1 : b.seriesIndex != null ? 1 : 0;

/**
 * The items sorted, groups among the books by the value of their books
 * (the latest read, the name...). The books of a series by their index
 * first, always ascending; the books of each group sorted too.
 */
export function sortShelf(items: ShelfItem[], sortBy: SortBy, ascending: boolean, groupBy: GroupBy, opened = '') {
  const dir = ascending ? 1 : -1;
  const byValue = (a: ShelfBook, b: ShelfBook) => dir * compare(bookValue(a, sortBy), bookValue(b, sortBy));
  const sortBooks = (a: ShelfBook, b: ShelfBook) =>
    (byValue(a, b) || (sortBy === 'series' ? bySeriesIndex(a, b) : 0)) || compare(a.title, b.title);
  const inSeries = (a: ShelfBook, b: ShelfBook) => bySeriesIndex(a, b) || sortBooks(a, b);
  const inGroup = groupBy === 'series' ? inSeries : sortBooks;
  const value = (item: ShelfItem) => (isGroup(item) ? groupValue(item, sortBy, groupBy) : bookValue(item, sortBy));
  const sorted = items.map((item) => (isGroup(item) ? { ...item, books: [...item.books].sort(inGroup) } : item));
  // in a series: by its order
  if (opened && groupBy === 'series') return (sorted as ShelfBook[]).sort(inSeries);
  return sorted.sort((a, b) => {
    if (!isGroup(a) && !isGroup(b)) return sortBooks(a, b);
    return dir * compare(value(a), value(b)) || compare(isGroup(a) ? a.name : a.title, isGroup(b) ? b.name : b.title);
  });
}

/** The books of the items, those in groups counted. */
export const countBooks = (items: ShelfItem[]) =>
  items.reduce((n, item) => n + (isGroup(item) ? item.books.length : 1), 0);

/** The groups above a group of the user and itself, e.g. `A`, `A/B` of `A/B`. */
export const breadcrumbs = (path: string) => {
  const parts = path ? path.split('/') : [];
  return parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join('/') }));
};

/** The name of a new group of two books dropped one on the other. */
export function newGroupName(a: Pick<BookEntry, 'title'>, b: Pick<BookEntry, 'title'>, parent = '') {
  const part = (title: string) => title.replace(/\//g, ' ').trim().slice(0, 5).trim() || 'Book';
  const name = `${part(a.title)}-${part(b.title)}`;
  return parent ? `${parent}/${name}` : name;
}

/** What a book dropped onto something of the shelf does: books put in a group. */
export type DropResult = { hashes: string[]; group: string };

/**
 * A book (`book:<hash>`) dropped onto: another book, both in a new group
 * (in the group opened); a group of the user, in it; a breadcrumb
 * (`crumb:<path>`), in that group, `crumb:` for none.
 */
export function dropResult(
  books: ShelfBook[], active: string, over: string, groupBy: GroupBy, opened = '',
): DropResult | undefined {
  if (active === over) return undefined;
  const split = (id: string) => [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)];
  const [typeA, keyA] = split(active);
  const [typeB, keyB] = split(over);
  const a = books.find((b) => b.hash === keyA);
  if (typeA !== 'book' || !a) return undefined;
  if (typeB === 'book') {
    const b = books.find((book) => book.hash === keyB);
    return b ? { hashes: [a.hash, b.hash], group: newGroupName(a, b, groupBy === 'group' ? opened : '') } : undefined;
  }
  if ((typeB === 'group' && groupBy === 'group') || typeB === 'crumb') {
    return a.group === keyB || (!a.group && !keyB) ? undefined : { hashes: [a.hash], group: keyB };
  }
  return undefined;
}

/** All the groups of the user, sorted, for choosing one. */
export function allGroups(books: Pick<BookEntry, 'group'>[]) {
  const groups = new Set<string>();
  for (const { group } of books) {
    const parts = group?.split('/') ?? [];
    parts.forEach((_, i) => groups.add(parts.slice(0, i + 1).join('/')));
  }
  return [...groups].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

/** The values of the settings stored, valid ones only. */
export function withLibraryDefaults(settings?: Partial<LibrarySettings>): LibrarySettings {
  const pick = <T>(value: T | undefined, valid: readonly T[], fallback: T) =>
    value !== undefined && valid.includes(value) ? value : fallback;
  const d = DEFAULT_LIBRARY_SETTINGS;
  return {
    view: pick(settings?.view, ['grid', 'list'], d.view),
    groupBy: pick(settings?.groupBy, ['none', 'group', 'author', 'series', 'status'], d.groupBy),
    sortBy: pick(settings?.sortBy, ['title', 'author', 'format', 'series', 'read', 'added', 'published'], d.sortBy),
    ascending: typeof settings?.ascending === 'boolean' ? settings.ascending : d.ascending,
    ...(settings?.folderImport ? { folderImport: settings.folderImport } : {}),
  };
}
