import { findNoteLinks, HASHTAG_REGEX } from 'utils/mdlink';

/**
 * What a note links to and contains, found in its raw markdown. The same as
 * the index of the workspace finds (src-tauri/src/index/parse.rs): for the
 * notes whose content is not loaded, the index tells it.
 */
export type Parsed = {
  /** the titles of the notes linked, in order, as many times as linked */
  links: string[];
  tags: string[];
  /** the issues linked, [#12](issue:12), sorted */
  issues: number[];
  /** it may have tasks: to look for them in the note */
  has_tasks: boolean;
};

// [#12](issue:12)
export const ISSUE_LINK_REGEX = /\(issue:(\d+)\)/g;
// #todo# #doing# #done# tags or checkboxes: maybe tasks
export const MAYBE_TASKS = /#(todo|doing|done)#|\[[ xX_-]\]/i;

export const noteTags = (content: string): string[] =>
  [...content.matchAll(HASHTAG_REGEX)]
    .map((m) => m[1]?.trim())
    .filter((tag): tag is string => !!tag && !tag.includes('#'));

export const issueLinks = (content: string): number[] =>
  [...new Set([...content.matchAll(ISSUE_LINK_REGEX)].map((m) => Number(m[1])))].sort((a, b) => a - b);

export function parseNote(content: string): Parsed {
  return {
    links: findNoteLinks(content).map((link) => link.title),
    tags: noteTags(content),
    issues: issueLinks(content),
    has_tasks: MAYBE_TASKS.test(content),
  };
}
