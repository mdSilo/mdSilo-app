import { useMemo, useEffect } from 'react';
import { parser } from "mdsmirror";
import { NoteMap, useStore } from 'lib/store';
import useDebounce from 'editor/hooks/useDebounce';
import { isUrl } from 'utils/helper';
import { loadDir } from 'file/open';

const DEBOUNCE_MS = 1000;

export type BacklinkMatch = {
  text: string; // matched text
  from: number;
  to: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any; // Node[] | Node
};

export type Backlink = {
  id: string;
  title: string;
  matches: Array<BacklinkMatch>;
};

export default function useBacklinks(noteId: string) {
  const isLoaded = useStore((state) => state.isLoaded);
  const setIsLoaded = useStore((state) => state.setIsLoaded);
  const initDir = useStore((state) => state.initDir);
  // console.log("b loaded?", isLoaded);
  useEffect(() => {
    if (!isLoaded && initDir) {
      loadDir(initDir).then(() => setIsLoaded(true));
    }
  }, [initDir, isLoaded, setIsLoaded]);
  
  const [notes] = useDebounce(
    useStore((state) => state.notes),
    DEBOUNCE_MS
  );
  
  const noteTitle = notes.get(noteId)?.title || '';

  const linkedBacklinks = useMemo(
    () => computeLinkedBacklinks(notes, noteTitle),
    [notes, noteTitle]
  );

  const unlinkedBacklinks = useMemo(
    () => computeUnlinkedBacklinks(notes, noteTitle),
    [notes, noteTitle]
  );

  return { linkedBacklinks, unlinkedBacklinks };
}

// Searches the notes linked to the given noteId
export const computeLinkedBacklinks = (
  notes: NoteMap,
  noteTitle: string
): Backlink[] => {
  if (!noteTitle || !noteTitle.trim()) {
    return [];
  }

  const result: Backlink[] = [];
  const myNotes = notes.values();
  for (const note of myNotes) {
    if (note.title === noteTitle) {
      continue;
    }
    const matches = computeLinkedMatches(note.content, noteTitle);
    if (matches.length > 0) {
      result.push({
        id: note.id,
        title: note.title,
        matches,
      });
    }
  }
  return result;
};

const computeLinkedMatches = (content: string, noteTitle: string) => {
  const out: BacklinkMatch[] = [];
  for (const textRuns of getMarkdownTextRuns(content)) {
    const context = textRuns.map(({ text }) => ({ text }));
    for (const run of textRuns) {
      if (run.href && !isUrl(run.href) && decodeURI(run.href) === noteTitle) {
        out.push({ text: run.text, from: run.from, to: run.to, context });
      }
    }
  }
  return out;
};


// Searches the notes text-matched to the given noteTitle
const computeUnlinkedBacklinks = (
  notes: NoteMap,
  noteTitle: string | undefined
): Backlink[] => {
  if (!noteTitle || !noteTitle.trim()) {
    return [];
  }

  const result: Backlink[] = [];
  const myNotes = notes.values();
  for (const note of myNotes) {
    if (note.title === noteTitle) {
      continue;
    }
    const matches = computeUnlinkedMatches(note.content, noteTitle);
    if (matches.length > 0) {
      result.push({
        id: note.id,
        title: note.title,
        matches,
      });
    }
  }
  return result;
};

const computeUnlinkedMatches = (content: string, noteTitle: string) => {
  const out: BacklinkMatch[] = [];
  for (const textRuns of getMarkdownTextRuns(content)) {
    const context = textRuns.map(({ text }) => ({ text }));
    for (const run of textRuns) {
      if (run.text.includes(noteTitle)) {
        out.push({
          text: run.text,
          from: run.from,
          to: run.to,
          context,
        });
      }
    }
  }
  return out;
};

type MarkdownTextRun = {
  text: string;
  from: number;
  to: number;
  href?: string;
};

const getMarkdownTextRuns = (content: string): MarkdownTextRun[][] => {
  const textRuns: MarkdownTextRun[][] = [];
  let contentOffset = 0;

  for (const token of parser.tokenizer.parse(content, {})) {
    if (
      token.type !== 'inline' ||
      typeof token.content !== 'string' ||
      !token.children?.length
    ) {
      continue;
    }

    let inlineOffset = content.indexOf(token.content, contentOffset);
    if (inlineOffset < 0) {
      inlineOffset = contentOffset;
    }
    contentOffset = inlineOffset + token.content.length;

    let textOffset = 0;
    let href: string | undefined;
    const runs: MarkdownTextRun[] = [];

    for (const child of token.children) {
      if (child.type === 'link_open') {
        href = child.attrGet('href') || undefined;
      } else if (child.type === 'link_close') {
        href = undefined;
      } else if (
        (child.type === 'text' || child.type === 'code_inline') &&
        typeof child.content === 'string'
      ) {
        let textIndex = token.content.indexOf(child.content, textOffset);
        if (textIndex < 0) {
          textIndex = textOffset;
        }
        const from = inlineOffset + textIndex;
        runs.push({
          text: child.content,
          from,
          to: from + child.content.length,
          href,
        });
        textOffset = textIndex + child.content.length;
      }
    }

    if (runs.length > 0) {
      textRuns.push(runs);
    }
  }

  return textRuns;
};
