import { findNoteLinks, HASHTAG_REGEX, maskCode, safeDecode } from '@/lib/mdlink';

/**
 * What a note links to and contains, found in its raw markdown. The same as
 * the index of the workspace finds (src-tauri/src/index/parse.rs): for the
 * notes whose content is not loaded, the index tells it.
 */
export type Parsed = {
  /** the titles of the notes linked, in order, as many times as linked */
  links: string[];
  tags: string[];
  /** the issues linked, [@12](issue:12), sorted */
  issues: number[];
  /** the books linked, in order, once each: see bookLinks */
  books?: string[];
  /** it may have tasks: to look for them in the note */
  has_tasks: boolean;
};

/** An issue as shown and linked, `@12`: `#` is of the tags. */
export const issueLabel = (num: number) => `@${num}`;

// [@12](issue:12)
export const ISSUE_LINK_REGEX = /\(issue:(\d+)\)/g;
// [x](book:<id>#<cfi>), [x](book:<title>)
const BOOK_LINK_REGEX = /\]\(\s*<?book:([^\s#)>]+)/gi;
// {{title}} or {{title|alias}}, same as the itemlink rule of the editor
const ITEM_LINK_REGEX = /\{\{([^{|}\n]+)(?:\|[^{|}\n]+)?\}\}/g;
const BOOK_ID_REGEX = /^[0-9a-f]{32}$/i;

/** The id of a book, or its title: what a `book:` link points to. */
export const bookRefOf = (target: string) => {
  const ref = safeDecode(target.trim()).trim();
  return BOOK_ID_REGEX.test(ref) ? ref.toLowerCase() : ref;
};

// #todo# #doing# #done# tags or checkboxes: maybe tasks
export const MAYBE_TASKS = /#(todo|doing|done)#|\[[ xX_-]\]/i;

export const noteTags = (content: string): string[] =>
  [...content.matchAll(HASHTAG_REGEX)]
    .map((m) => m[1]?.trim())
    .filter((tag): tag is string => !!tag && !tag.includes('#'));

export const issueLinks = (content: string): number[] =>
  [...new Set([...content.matchAll(ISSUE_LINK_REGEX)].map((m) => Number(m[1])))].sort((a, b) => a - b);

/**
 * The books linked, by id or by title (`{{title}}`, `[x](book:title)`), in
 * order, once each; not in code.
 */
export function bookLinks(content: string): string[] {
  if (!content.includes('book:') && !content.includes('{{')) return [];
  const masked = maskCode(content);
  const found: Array<[number, string]> = [];
  for (const m of masked.matchAll(BOOK_LINK_REGEX)) found.push([m.index ?? 0, m[1]]);
  for (const m of masked.matchAll(ITEM_LINK_REGEX)) {
    const index = m.index ?? 0;
    if (index > 0 && masked[index - 1] === '\\') continue;
    found.push([index, m[1].replace(/\\([!-/:-@[-`{-~])/g, '$1')]);
  }
  const refs = found.sort((a, b) => a[0] - b[0]).map(([, target]) => bookRefOf(target)).filter(Boolean);
  return [...new Set(refs)];
}

export function parseNote(content: string): Parsed {
  return {
    links: findNoteLinks(content).map((link) => link.title),
    tags: noteTags(content),
    issues: issueLinks(content),
    books: bookLinks(content),
    has_tasks: MAYBE_TASKS.test(content),
  };
}
