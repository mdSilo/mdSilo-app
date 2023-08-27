import { useMemo, useEffect } from 'react';
import { parser, getJSONContent } from "mdsmirror";
import { Notes, useStore } from 'lib/store';
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
  
  const noteTitle = notes[noteId]?.title || '';

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
  notes: Notes,
  noteTitle: string
): Backlink[] => {
  if (!noteTitle || !noteTitle.trim()) {
    return [];
  }

  const result: Backlink[] = [];
  const myNotes = Object.values(notes);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const findMatch = (node: any, context?: any) => {
    if (node.text && node.marks && node.marks.length > 0) {
      for (const mark of node.marks) {
        if ((mark.type === "link" || mark.type === 'wikilink') && mark.attrs) {
          const href = mark.attrs.href;
          if (href && !isUrl(href)) {
            const title = decodeURI(href);
            if (noteTitle === title) {
              out.push({ text: node.text, from: node.from, to: node.to, context })
            }
          }
        }
      }
    }
    // recursively
    if (node.content?.length > 0) {
      for (const n of node.content) {
        findMatch(n, node.content);
      }
    }

    return out;
  }

  const doc = parser.parse(content);
  // console.log(">> doc: ", doc, content)
  const json = getJSONContent(doc); 
  // console.log(">>json: ", noteTitle, json)
  const result: BacklinkMatch[] = findMatch(json);

  return result;
};


// Searches the notes text-matched to the given noteTitle
const computeUnlinkedBacklinks = (
  notes: Notes,
  noteTitle: string | undefined
): Backlink[] => {
  if (!noteTitle || !noteTitle.trim()) {
    return [];
  }

  const result: Backlink[] = [];
  const myNotes = Object.values(notes);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const findMatch = (node: any, context?: any) => {
    if (node.text && node.text.includes(noteTitle)) {
      out.push({
        text: node.text,
        from: node.from,
        to: node.to,
        context,
      });
    }
    if (node.content?.length > 0) {
      for (const n of node.content) {
        findMatch(n, node.content);
      }
    }
    return out;
  }

  const doc = parser.parse(content);
  const json = getJSONContent(doc);
  const result: BacklinkMatch[] = findMatch(json);
  
  return result;
};
