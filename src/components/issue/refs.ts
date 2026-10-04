import { isUrl } from 'utils/helper';
import type { Notes } from 'lib/store';
import type { Issue } from './types';

// [[title]] or [[title|alias]]
const WIKI_REGEX = /\[\[([^[|\]\n]+)(?:\|[^[\]\n]*)?\]\]/g;
// [text](href)
const MD_LINK_REGEX = /\[([^\]\n]*)\]\(([^)\s]+)\)/g;
// issue:12, as in [#12](issue:12)
const ISSUE_LINK_REGEX = /\(issue:(\d+)\)/g;

export const ISSUE_HREF_PREFIX = 'issue:';

export const issueHref = (num: number) => `${ISSUE_HREF_PREFIX}${num}`;

/** Parse `issue:12` into 12; undefined if href is not an issue link. */
export function parseIssueHref(href: string): number | undefined {
  const trimmed = href.trim();
  if (!trimmed.startsWith(ISSUE_HREF_PREFIX)) return undefined;
  const num = Number(trimmed.slice(ISSUE_HREF_PREFIX.length));
  return Number.isInteger(num) && num > 0 ? num : undefined;
}

const safeDecode = (s: string) => {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
};

/** Note titles linked from a markdown text, via [[title]] or [text](title). */
export function linkedNoteTitles(text: string): Set<string> {
  const titles = new Set<string>();
  for (const m of text.matchAll(WIKI_REGEX)) {
    titles.add(m[1].trim());
  }
  for (const m of text.matchAll(MD_LINK_REGEX)) {
    const href = m[2];
    if (isUrl(href) || parseIssueHref(href) !== undefined) continue;
    titles.add(safeDecode(href).trim());
  }
  return titles;
}

/** Issue numbers linked from a markdown text, via [#12](issue:12). */
export function linkedIssueNumbers(text: string): Set<number> {
  const nums = new Set<number>();
  for (const m of text.matchAll(ISSUE_LINK_REGEX)) {
    nums.add(Number(m[1]));
  }
  return nums;
}

/** All markdown texts of an issue: body and comments. */
export const issueTexts = (issue: Issue) => [
  issue.body,
  ...issue.timeline.map((t) => (t.kind === 'comment' ? t.body : '')),
];

export type IssueRef = { issue: Issue; explicit: boolean; mentioned: boolean };

/**
 * Issues referencing a note: either the note path is in `issue.notes`
 * or the issue body/comments link the note title.
 */
export function computeIssueRefs(issues: Issue[], noteId: string, title: string): IssueRef[] {
  const out: IssueRef[] = [];
  const noteTitle = title.trim();
  for (const issue of issues) {
    const explicit = !!noteId && issue.notes.includes(noteId);
    const mentioned = !!noteTitle && issueTexts(issue).some((t) => linkedNoteTitles(t).has(noteTitle));
    if (explicit || mentioned) {
      out.push({ issue, explicit, mentioned });
    }
  }
  return out;
}

/** Notes whose content links the issue via `issue:N`. */
export function computeNoteMentions(notes: Notes, num: number) {
  return Object.values(notes)
    .filter((n) => !n.is_dir && n.content && linkedIssueNumbers(n.content).has(num))
    .map((n) => ({ id: n.id, title: n.title }));
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Rewrite links to a renamed note title within a markdown text. */
export function renameTitleInText(text: string, oldTitle: string, newTitle: string) {
  if (!oldTitle || oldTitle === newTitle) return text;
  const old = escapeRegExp(oldTitle);
  return text
    .replace(new RegExp(`\\[\\[\\s*${old}\\s*(\\|[^[\\]\\n]*)?\\]\\]`, 'g'), (_m, alias) => `[[${newTitle}${alias ?? ''}]]`)
    .replace(new RegExp(`\\]\\(${escapeRegExp(encodeURI(oldTitle))}\\)`, 'g'), () => `](${encodeURI(newTitle)})`);
}
