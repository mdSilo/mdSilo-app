// Helpers to find and rewrite links to notes in raw Markdown text.
//
// A link to a note uses the note title as href:
//   [label](encoded%20title)  or  [[title]]  or  [[title|label]]

import { isUrl } from './helper';

// [label](href) or [label](href "title"), `!` prefix for images
// groups: 1-bang, 2-label, 3-destination, 4-link title part
export const MD_LINK_REGEX =
  /(!?)\[((?:\\.|[^\\[\]\n])*)\]\(\s*(<[^<>\n]*>|(?:\\.|[^\s()\\]|\((?:\\.|[^\s()\\])*\))+)((?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^()\n]*\)))?\s*)\)/g;
// [[target]] or [[target|alias]], same as the wikilink rule of the editor
// groups: 1-target, 2-alias
export const WIKI_LINK_REGEX = /\[\[([^[|\]\n]+)(?:\|([^[|\]\n]+))?\]\]/g;

// fenced code blocks: ``` or ~~~
const FENCE_REGEX = /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1[`~]*[ \t]*$|(?![\s\S]))/gm;
// inline code: a backtick run closed by a run of the same length
// (no lookbehind: not supported by older webviews)
const INLINE_CODE_REGEX = /(`+)(?!`)(?:[^\n]|\n(?![ \t]*\n))*?\1(?!`)/g;
const ESCAPED_CHAR_REGEX = /\\([!-/:-@[-`{-~])/g;

const blank = (str: string) => str.replace(/[^\n]/g, ' ');

/**
 * Blank out code (keeping the length and line breaks),
 * so the links in code are ignored while the offsets are kept.
 */
export function maskCode(content: string) {
  if (!content.includes('`') && !content.includes('~~~')) return content;
  return content.replace(FENCE_REGEX, blank).replace(INLINE_CODE_REGEX, blank);
}

/** Decode URI safely: it throws on malformed sequences, e.g. a literal `%` */
export function safeDecode(str: string) {
  try {
    return decodeURIComponent(str);
  } catch {
    try {
      return decodeURI(str);
    } catch {
      return str;
    }
  }
}

/** Note title from an href parsed by markdown (unescaped already) */
export function hrefToTitle(href: string) {
  return safeDecode(href.trim()).trim();
}

/** Note title from a raw markdown link destination or wiki link target */
export function rawHrefToTitle(rawHref: string) {
  let href = rawHref.trim();
  if (href.startsWith('<') && href.endsWith('>')) {
    href = href.slice(1, -1);
  }
  return hrefToTitle(href.replace(ESCAPED_CHAR_REGEX, '$1'));
}

/** href to link a note: [label](href) */
export function encodeHref(title: string) {
  return encodeURI(title.trim()).replace(/[()]/g, (c) => (c === '(' ? '%28' : '%29'));
}

const isNoteHref = (href: string) => !!href && !isUrl(href);

/**
 * Before v0.5.7, the spaces in title were written as `_` in the link href,
 * e.g. `[a b](a_b)`, the notes written then still have such links.
 * @returns the href title a legacy link to the note would have, or
 * undefined if the title has no space (the legacy link is same as now)
 */
export function legacyLinkTitle(title: string) {
  const legacy = title.replace(/\s/g, '_');
  return legacy !== title ? legacy : undefined;
}

/**
 * The titles a link to the note titled `title` may have: the title, plus
 * its legacy form if no note is titled so, see `legacyLinkTitle`.
 * @param hasNote whether a note has exactly the given title
 */
export function linkTitlesOf(title: string, hasNote: (title: string) => boolean) {
  const legacy = legacyLinkTitle(title);
  return legacy && !hasNote(legacy) ? [title, legacy] : [title];
}

/**
 * Map the titles links may have (current and legacy, see `legacyLinkTitle`)
 * to the note titles. The exact title wins over a legacy one.
 */
export function noteTitleMap(titles: Iterable<string>) {
  const titleOf = new Map<string, string>();
  const legacies: Array<[string, string]> = [];
  for (const title of titles) {
    titleOf.set(title, title);
    const legacy = legacyLinkTitle(title);
    if (legacy) legacies.push([legacy, title]);
  }
  for (const [legacy, title] of legacies) {
    if (!titleOf.has(legacy)) titleOf.set(legacy, title);
  }
  return titleOf;
}

type RawNoteLink = {
  title: string;
  index: number;
  raw: string;
  // replace the link to another title, or unlink it if no title given
  rewrite: (newTitle?: string) => string;
};

/** Find the links to notes in raw markdown content */
export function findNoteLinks(content: string): RawNoteLink[] {
  if (!content.includes('[')) return [];
  const masked = maskCode(content);
  const links: RawNoteLink[] = [];
  const isEscaped = (index: number) => index > 0 && masked[index - 1] === '\\';

  for (const m of masked.matchAll(WIKI_LINK_REGEX)) {
    const index = m.index ?? 0;
    if (isEscaped(index)) continue;
    const [raw, target, alias] = m;
    const title = rawHrefToTitle(target);
    if (!isNoteHref(title)) continue;
    links.push({
      title,
      index,
      raw,
      rewrite: (newTitle?: string) => {
        const label = alias ?? target;
        if (!newTitle) return label.trim();
        // the title cannot be in [[]], use [label](href)
        if (/[[\]|\n]/.test(newTitle)) {
          return `[${alias?.trim() || newTitle}](${encodeHref(newTitle)})`;
        }
        return `[[${newTitle}${alias !== undefined ? `|${alias}` : ''}]]`;
      },
    });
  }

  for (const m of masked.matchAll(MD_LINK_REGEX)) {
    const index = m.index ?? 0;
    const [raw, bang, label, dest, titlePart] = m;
    // skip images and escaped `\[`
    if (bang || isEscaped(index)) continue;
    // skip `[x]` in `[[x]](y)` which is a wiki link
    if (masked[index - 1] === '[' && masked.startsWith('[[', index - 1)) continue;
    const title = rawHrefToTitle(dest);
    if (!isNoteHref(title)) continue;
    links.push({
      title,
      index,
      raw,
      rewrite: (newTitle?: string) =>
        newTitle ? `[${label}](${encodeHref(newTitle)}${titlePart})` : label,
    });
  }

  return links.sort((a, b) => a.index - b.index);
}

/**
 * Rewrite the links to the note titled `oldTitle` in the content:
 * point them to `newTitle` on rename, or unlink them if no `newTitle`.
 * @param oldTitles all the titles the links may have, see `linkTitlesOf`
 * @returns the new content, same as input if nothing changed
 */
export function rewriteNoteLinks(
  content: string,
  oldTitle: string,
  newTitle?: string,
  oldTitles: string[] = [oldTitle]
) {
  const links = findNoteLinks(content).filter((l) => oldTitles.includes(l.title));
  if (links.length === 0) return content;

  const to = newTitle?.trim();
  let out = '';
  let last = 0;
  for (const link of links) {
    if (link.index < last) continue; // overlapped
    out += content.slice(last, link.index) + link.rewrite(to);
    last = link.index + link.raw.length;
  }
  return out + content.slice(last);
}
