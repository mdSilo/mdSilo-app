/**
 * The annotations of a book, in a markdown file next to it: `Foo.epub.md`
 * for `reading/Foo.epub`. It is a note like any other: readable, editable,
 * linked ([[...]] in the notes of the annotations), synced with the
 * workspace. The data to place the annotations in the book is kept in
 * comments, which the editor keeps as they are:
 *
 *   <!-- mdsilo:book {"hash":"...","title":"..."} -->
 *
 *   # Title
 *
 *   ## Chapter
 *
 *   <!-- mdsilo:note {"id":"...","cfi":"epubcfi(...)","color":"yellow",...} -->
 *   > the text highlighted [↗ in book](book:<hash>#<cfi>)
 *
 *   The note on it, any markdown.
 *
 * The chapter headings and the quotes are written by the reader, each quote
 * with a link back to its place in the book; the note is what follows the
 * quote, until the next annotation.
 */

export type BookNoteType = 'annotation' | 'bookmark';
export type HighlightStyle = 'highlight' | 'underline' | 'squiggly';
export type HighlightColor = 'yellow' | 'red' | 'green' | 'blue' | 'violet';
export const HIGHLIGHT_COLORS: HighlightColor[] = ['yellow', 'red', 'green', 'blue', 'violet'];

export type BookNote = {
  id: string;
  type: BookNoteType;
  cfi: string;
  /** the text highlighted; none for a bookmark of a page */
  text?: string;
  style?: HighlightStyle;
  color?: HighlightColor;
  /** markdown */
  note: string;
  /** the label of the chapter, to group the notes by */
  chapter?: string;
  createdAt: string;
  updatedAt: string;
};

export type BookHeader = {
  hash: string;
  title?: string;
  author?: string;
  file?: string;
};

export type AnnotationsDoc = {
  header?: BookHeader;
  notes: BookNote[];
};

/** The section of a CFI, `epubcfi(/6/4!...)` is the second item (index 1). */
export function sectionOf(cfi: string): number {
  const match = cfi.match(/^epubcfi\(\/6\/(\d+)/);
  return match ? Number(match[1]) / 2 - 1 : -1;
}

const BOOK_MARK = 'mdsilo:book';
const NOTE_MARK = 'mdsilo:note';
const MARKER_REGEX = /^<!--\s*(mdsilo:book|mdsilo:note)\s+(\{.*\})\s*-->\s*$/;

/** The name of the annotations file of a book file. */
export const annotationsPathOf = (bookPath: string) => `${bookPath}.md`;

/** The path of the book of an annotations file, if it is one by its name. */
export const bookPathOfAnnotations = (mdPath: string) =>
  /\.(epub|pdf|mobi|azw3?|cbz|fb2|fbz)\.md$/i.test(mdPath) ? mdPath.slice(0, -3) : undefined;

/** A comment can not contain `-->`: escape it in the JSON. */
const toJson = (data: unknown) => JSON.stringify(data).replace(/-->/g, '--\\u003e');

/** the link back to the place of a quote, at its end */
const BACK = '↗ in book';
// also a bare ↗, as first written
const BACK_LINK = /\s*\[↗(?: in book)?\]\(book:\S*\)\s*$/;

const quote = (text: string, href?: string) => {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (href && lines.length) lines[lines.length - 1] += ` [${BACK}](${href})`;
  return lines.map((line) => `> ${line}`).join('\n');
};

const unquote = (lines: string[]) =>
  lines.map((line) => line.replace(/^>\s?/, '').replace(BACK_LINK, '')).join('\n').trim();

/** The markdown of the annotations of a book. */
export function serializeAnnotations(doc: AnnotationsDoc): string {
  const out: string[] = [];
  const { header } = doc;
  if (header) {
    out.push(`<!-- ${BOOK_MARK} ${toJson(header)} -->`, '');
    if (header.title) {
      out.push(`# ${header.title}`, '');
      if (header.author) out.push(`*${header.author}*`, '');
    }
  }
  let chapter: string | undefined;
  for (const note of doc.notes) {
    if (note.chapter && note.chapter !== chapter) {
      out.push(`## ${note.chapter}`, '');
    }
    chapter = note.chapter ?? chapter;
    const { text, note: body, ...data } = note;
    out.push(`<!-- ${NOTE_MARK} ${toJson(data)} -->`);
    if (text?.trim()) out.push(quote(text, header?.hash ? bookHref(header.hash, note.cfi) : undefined));
    out.push('');
    if (body.trim()) out.push(body.trim(), '');
  }
  return `${out.join('\n').trimEnd()}\n`;
}

/**
 * The annotations in the markdown, with the notes as edited there. Anything
 * not written by the reader (text before the first annotation) is ignored.
 */
export function parseAnnotations(markdown: string): AnnotationsDoc {
  const doc: AnnotationsDoc = { notes: [] };
  let current: { data: Omit<BookNote, 'text' | 'note'>; lines: string[] } | undefined;

  const finish = (next?: { chapter?: string }) => {
    if (!current) return;
    const lines = [...current.lines];
    // the heading of the next chapter, written by the reader
    if (next?.chapter) {
      const heading = `## ${next.chapter}`;
      for (let i = lines.length - 1; i >= 0; i--) {
        if (!lines[i].trim()) continue;
        if (lines[i].trim() === heading) lines.splice(i);
        break;
      }
    }
    let start = 0;
    while (start < lines.length && !lines[start].trim()) start++;
    const quoted: string[] = [];
    while (start < lines.length && lines[start].startsWith('>')) {
      quoted.push(lines[start]);
      start++;
    }
    const text = unquote(quoted);
    const note = lines.slice(start).join('\n').trim();
    doc.notes.push({ ...current.data, ...(text ? { text } : {}), note } as BookNote);
    current = undefined;
  };

  for (const line of markdown.split(/\r?\n/)) {
    const match = line.trim().match(MARKER_REGEX);
    if (match) {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(match[2]);
      } catch {
        if (current) current.lines.push(line);
        continue;
      }
      if (match[1] === BOOK_MARK) {
        finish();
        doc.header = data as BookHeader;
        continue;
      }
      if (typeof data.id === 'string' && typeof data.cfi === 'string') {
        finish(data as { chapter?: string });
        current = { data: data as Omit<BookNote, 'text' | 'note'>, lines: [] };
        continue;
      }
    }
    current?.lines.push(line);
  }
  finish();
  return doc;
}

const cfiKey = (cfi: string) => cfi;

/**
 * Sort the notes in the order of the book, by their CFIs, with the compare
 * of foliate-js; the notes of a chapter are written together.
 */
export function sortNotes(notes: BookNote[], compare: (a: string, b: string) => number): BookNote[] {
  return [...notes].sort((a, b) => {
    try {
      return compare(cfiKey(a.cfi), cfiKey(b.cfi));
    } catch {
      return a.createdAt.localeCompare(b.createdAt);
    }
  });
}

/** The note of an annotation to show: without its links to issues, shown apart. */
export const noteText = (note: string) => note.replace(/\s*\[[@#]\d+\]\(issue:\d+\)/g, '').trim();

/** A link to a place of a book, `book:<hash>#<cfi>`, to put in notes. */
export const bookHref = (hash: string, cfi?: string) =>
  `book:${hash}${cfi ? `#${encodeURIComponent(cfi)}` : ''}`;

/** The book and the place of a `book:` link. */
export function parseBookHref(href: string): { hash: string; cfi?: string } | undefined {
  const match = href.match(/^book:([0-9a-f]{32})(?:#(.+))?$/i);
  if (!match) return undefined;
  let cfi: string | undefined;
  try {
    cfi = match[2] ? decodeURIComponent(match[2]) : undefined;
  } catch {
    cfi = match[2];
  }
  return { hash: match[1].toLowerCase(), cfi };
}

export const newNoteId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
