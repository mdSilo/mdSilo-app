import { useMemo } from 'react';
import { parser, getJSONContent } from "mdsmirror";
import { Notes, useStore } from 'lib/store';
import useDebounce from 'editor/hooks/useDebounce';
import { ciStringEqual, isUrl } from 'utils/helper';

const DEBOUNCE_MS = 1000;

export type BacklinkMatch = {
  text: string;
  from: number;
  to: number;
};

export type Backlink = {
  id: string;
  title: string;
  matches: Array<BacklinkMatch>;
};

export default function useBacklinks(noteId: string) {
  const [notes] = useDebounce(
    useStore((state) => state.notes),
    DEBOUNCE_MS
  );
  
  const noteTitle = notes[noteId].title;

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

// note: 
// the backlinks generated and updated locally only
// will not make public any private data involved even on wiki note

// Searches the notes linked to the given noteId
export const computeLinkedBacklinks = (
  notes: Notes,
  noteTitle: string
): Backlink[] => {
  const result: Backlink[] = [];
  const notesArr = Object.values(notes);
  const myNotes = notesArr.filter(n => !n.is_wiki);
  for (const note of myNotes) {
    if (ciStringEqual(note.title, noteTitle)) {
      continue;
    }
    const matches = computeLinkedMatches(note.content, noteTitle);
    if (matches.length > 0) {
      result.push({
        id: note.id,
        title: note.title,
        matches: [],
      });
    }
  }
  return result;
};

const computeLinkedMatches = (content: string, noteTitle: string) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const findMatch = (node: any) => {
    const out: BacklinkMatch[] = [];
    if (node.text && node.marks && node.marks.length > 0) {
      for (const mark of node.marks) {
        if (mark.type === "link" && mark.attrs) {
          const href = mark.attrs.href;
          if (href && !isUrl(href)) {
            const title = href.replaceAll('_', ' ');
            if (ciStringEqual(noteTitle, title)) {
              out.push({ text: node.text, from: node.from, to: node.to })
            }
          }
        }
      }
    }
    if (node.content?.length > 0) {
      for (const n of node.content) {
        findMatch(n);
      }
    }
    return out;
  }

  const doc = parser.parse(content);
  const json = getJSONContent(doc);
  const result: BacklinkMatch[] = findMatch(json);
  
  return result;
};


// Searches the notes text-matched to the given noteTitle
const computeUnlinkedBacklinks = (
  notes: Notes,
  noteTitle: string | undefined
): Backlink[] => {
  if (!noteTitle) {
    return [];
  }

  const result: Backlink[] = [];
  const notesArr = Object.values(notes);
  // filter out isWiki
  const myNotes = notesArr.filter(n => !n.is_wiki);
  for (const note of myNotes) {
    if (ciStringEqual(note.title, noteTitle)) {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const findMatch = (node: any) => {
    const out: BacklinkMatch[] = [];
    if (node.text && node.text.includes(noteTitle)) {
      out.push({
        text: node.text,
        from: node.from,
        to: node.to,
      });
    }
    if (node.content?.length > 0) {
      for (const n of node.content) {
        findMatch(n);
      }
    }
    return out;
  }

  const doc = parser.parse(content);
  const json = getJSONContent(doc);
  const result: BacklinkMatch[] = findMatch(json);
  
  return result;
};
