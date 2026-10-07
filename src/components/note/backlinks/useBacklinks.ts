import { useMemo, useEffect } from 'react';
import { parser } from "mdsmirror";
import { NoteMap, useStore } from 'lib/store';
import useDebounce from 'editor/hooks/useDebounce';
import { isUrl } from 'utils/helper';
import { hrefToTitle, linkTitlesOf } from 'utils/mdlink';
import { loadDir } from 'file/open';

const DEBOUNCE_MS = 1000;

export type BacklinkMatch = {
  text: string; // matched text
  from: number; // offset of the matched text in context
  to: number;
  context: string; // plain text of the block(paragraph, heading, cell...)
  block: number; // index of the block in the note
};

export type Backlink = {
  id: string;
  title: string;
  matches: Array<BacklinkMatch>;
};

export type Backlinks = {
  linkedBacklinks: Backlink[];
  unlinkedBacklinks: Backlink[];
};

export default function useBacklinks(noteId: string): Backlinks {
  const isLoaded = useStore((state) => state.isLoaded);
  const initDir = useStore((state) => state.initDir);
  // load all notes with content, isLoaded is set once loaded
  useEffect(() => {
    if (!isLoaded && initDir) {
      loadDir(initDir);
    }
  }, [initDir, isLoaded]);

  // the title is not debounced: be right at once on switching or renaming note
  const noteTitle = useStore((state) => state.notes.get(noteId)?.title) || '';
  const [notes] = useDebounce(
    useStore((state) => state.notes),
    DEBOUNCE_MS
  );

  return useMemo(
    () => computeBacklinks(notes, noteTitle, noteId),
    [notes, noteTitle, noteId]
  );
}

/**
 * Searches the notes linking to (linked) or mentioning (unlinked) the title
 * @param notes all notes
 * @param noteTitle title of the note to search backlinks for
 * @param noteId id of the note to search backlinks for, excluded in result
 */
export const computeBacklinks = (
  notes: NoteMap,
  noteTitle: string,
  noteId?: string
): Backlinks => {
  const linkedBacklinks: Backlink[] = [];
  const unlinkedBacklinks: Backlink[] = [];
  const title = noteTitle.trim();
  if (!title) {
    return { linkedBacklinks, unlinkedBacklinks };
  }

  // the titles a link to the note may have, including the legacy one
  const linkTitles = linkTitlesOf(title, (t) =>
    notes.values().some((n) => !n.is_dir && n.title === t)
  );
  const nextCache: ParseCache = new Map();
  for (const note of notes.values()) {
    if (note.id === noteId || note.is_dir || !note.content) {
      continue;
    }
    // quick check to not parse the notes having no link or mention for sure
    if (!mayLinkOrMention(note.content, title)) {
      continue;
    }

    const blocks = getBlocks(note.id, note.content, nextCache);
    const linked: BacklinkMatch[] = [];
    const unlinked: BacklinkMatch[] = [];
    blocks.forEach((block, index) => {
      for (const run of block.runs) {
        if (run.link !== undefined) {
          // linked: href is the title
          if (linkTitles.includes(run.link)) {
            linked.push(toMatch(block, index, run.from, run.text.length));
          }
          continue;
        }
        // unlinked: title in text, not in a link
        let at = run.text.indexOf(title);
        while (at >= 0) {
          unlinked.push(toMatch(block, index, run.from + at, title.length));
          at = run.text.indexOf(title, at + title.length);
        }
      }
    });

    if (linked.length > 0) {
      linkedBacklinks.push({ id: note.id, title: note.title, matches: linked });
    }
    if (unlinked.length > 0) {
      unlinkedBacklinks.push({ id: note.id, title: note.title, matches: unlinked });
    }
  }
  // keep the parsed notes still existing only
  for (const [id, parsed] of parseCache) {
    if (!nextCache.has(id) && notes.get(id)?.content === parsed.content) {
      nextCache.set(id, parsed);
    }
  }
  parseCache = nextCache;

  return { linkedBacklinks, unlinkedBacklinks };
};

// Searches the notes linked to the given title
export const computeLinkedBacklinks = (
  notes: NoteMap,
  noteTitle: string,
  noteId?: string
): Backlink[] => computeBacklinks(notes, noteTitle, noteId).linkedBacklinks;

// Searches the notes text-matched to the given title
export const computeUnlinkedBacklinks = (
  notes: NoteMap,
  noteTitle: string,
  noteId?: string
): Backlink[] => computeBacklinks(notes, noteTitle, noteId).unlinkedBacklinks;

const toMatch = (
  block: TextBlock,
  index: number,
  from: number,
  len: number
): BacklinkMatch => ({
  text: block.text.slice(from, from + len),
  from,
  to: from + len,
  context: block.text,
  block: index,
});

// a link maybe `[`, a mention may be escaped `\` or an html entity `&`
const mayLinkOrMention = (content: string, title: string) =>
  content.includes('[') ||
  content.includes('\\') ||
  content.includes('&') ||
  content.includes(title);

type TextRun = {
  text: string;
  from: number; // offset in the block text
  link?: string; // title of the linked note, if the run is in a link to note
};

type TextBlock = {
  text: string; // plain text of the block
  runs: TextRun[];
};

type ParseCache = Map<string, { content: string; blocks: TextBlock[] }>;

// Parsing markdown is the costly part: parse a note again only if changed
let parseCache: ParseCache = new Map();

const getBlocks = (id: string, content: string, nextCache: ParseCache) => {
  const cached = parseCache.get(id);
  const blocks =
    cached && cached.content === content
      ? cached.blocks
      : getMarkdownTextBlocks(content);
  nextCache.set(id, { content, blocks });
  return blocks;
};

export const getMarkdownTextBlocks = (content: string): TextBlock[] => {
  const blocks: TextBlock[] = [];

  for (const token of parser.tokenizer.parse(content, {})) {
    if (token.type !== 'inline' || !token.children?.length) {
      continue;
    }

    let text = '';
    let link: string | undefined;
    const runs: TextRun[] = [];

    for (const child of token.children) {
      if (child.type === 'link_open') {
        const href = child.attrGet('href') || '';
        // '' for the links not to note, e.g. url
        link = href && !isUrl(href) ? hrefToTitle(href) : '';
      } else if (child.type === 'link_close') {
        link = undefined;
      } else if (child.type === 'text' || child.type === 'code_inline') {
        if (!child.content) continue;
        runs.push({ text: child.content, from: text.length, link });
        text += child.content;
      } else if (child.type === 'softbreak' || child.type === 'hardbreak') {
        text += ' ';
      }
    }

    if (runs.length > 0) {
      blocks.push({ text, runs });
    }
  }

  return blocks;
};
