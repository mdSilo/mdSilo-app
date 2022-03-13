import { useMemo } from 'react';
import {
  createEditor,
  Editor,
  Element,
  Node,
  Descendant,
  Path,
  Text,
} from 'slate';
import { ElementType, FormattedText } from 'editor/slate';
import { Notes, store, useStore } from 'lib/store';
import type { Note } from 'types/model';
import useDebounce from 'editor/hooks/useDebounce';
import { ciStringEqual } from 'utils/helper';

const DEBOUNCE_MS = 1000;

export type BacklinkMatch = {
  lineElement: Element;
  linePath: Path;
  path: Path;
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

  const linkedBacklinks = useMemo(
    () => computeLinkedBacklinks(notes, noteId),
    [notes, noteId]
  );

  const unlinkedBacklinks = useMemo(
    () => computeUnlinkedBacklinks(notes, notes[noteId]?.title),
    [notes, noteId]
  );

  return { linkedBacklinks, unlinkedBacklinks };
}

// note: 
// the backlinks generated and updated locally only
// will not make public any private data involved even on wiki note

// Searches the notes linked to the given noteId
export const computeLinkedBacklinks = (
  notes: Notes,
  noteId: string
): Backlink[] => {
  const result: Backlink[] = [];
  const notesArr = Object.values(notes);
  const myNotes = notesArr.filter(n => !n.is_wiki);
  for (const note of myNotes) {
    const matches = computeLinkedMatches(note.content, noteId);
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
      // We skip getting unlinked backlinks if the note titles are the same
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

const computeLinkedMatches = (nodes: Descendant[], noteId: string) => {
  const editor = createEditor();
  editor.children = nodes;

  // Find note link / pub link elements that match noteId
  const matchingElements = Editor.nodes(editor, {
    at: [],
    match: (n) =>
      Element.isElement(n) &&
      (n.type === ElementType.NoteLink || n.type === ElementType.PubLink) &&
      n.noteId === noteId &&
      !!Node.string(n), // ignore note links with empty link text
  });

  const result: BacklinkMatch[] = [];
  for (const [, path] of matchingElements) {
    // Get the line element
    const block = Editor.above<Element>(editor, {
      at: path,
      match: (n) => Editor.isBlock(editor, n),
    });

    if (block) {
      const [lineElement, linePath] = block;
      result.push({ lineElement, linePath, path });
    }
  }
  return result;
};

const computeUnlinkedMatches = (nodes: Descendant[], noteTitle: string) => {
  const editor = createEditor();
  editor.children = nodes;

  // Find leaves that have noteTitle in them
  const matchingLeaves = Editor.nodes<FormattedText>(editor, {
    at: [],
    match: (n) =>
      Text.isText(n) && n.text.toLowerCase().includes(noteTitle.toLowerCase()),
  });

  const result: BacklinkMatch[] = [];
  for (const [node, path] of matchingLeaves) {
    // Skip matches that are part of a linking(those are linked matches) or table
    const [parent] = Editor.parent(editor, path);
    if (Element.isElement(parent) && 
      (
        parent.type === ElementType.NoteLink || 
        parent.type === ElementType.PubLink ||
        parent.type === ElementType.Table ||
        parent.type === ElementType.TableCell ||
        parent.type === ElementType.TableRow
      )
    ) {
      continue;
    }

    // Get the line element
    const block = Editor.above<Element>(editor, {
      at: path,
      match: (n) => Editor.isBlock(editor, n),
    });

    if (block) {
      const [lineElement, linePath] = block;
      // We calculate the number of matches in the string and push for each one
      // This ensures that the calculated number of unlinked matches is accurate
      const re = new RegExp(noteTitle.toLowerCase(), 'g');
      const numOfMatches = (node.text.toLowerCase().match(re) ?? []).length;
      for (let i = 0; i < numOfMatches; i++) {
        result.push({ lineElement, linePath, path });
      }
    }
  }
  return result;
};

// could be heavy task, can be optimized at the beginning?
// the issue traced back to PubAutocomletePopover..
// avoid upserting search result to store locally(PubAutocomplete) to ease the load 
// still need to purge, in case: unlinked, but the note in store
export const purgeUnLinkedWikiNotes = (notes?: Note[]) => {
  const allNotes = notes ? notes : Object.values(store.getState().notes);
  const wikiNotes = allNotes.filter(n => n.is_wiki);
  const deleteNote = store.getState().deleteNote;
  for (const wikiNote of wikiNotes) {
    const wikiNoteId = wikiNote.id;
    const matchArr = [];
    for (const note of allNotes) {
      const editor = createEditor();
      editor.children = note.content;

      // Find PubLink elements that match wikinoteId
      const linkingElements = Editor.nodes(editor, {
        at: [],
        match: (n) =>
          Element.isElement(n) &&
          n.type === ElementType.PubLink &&
          n.noteId === wikiNoteId,
      });

      const linkArr = Array.from(linkingElements);
      // no need to lookup exhaustedly
      if (linkArr.length > 0) {
        matchArr.push(...linkArr);
        break;
      }
    }

    if (matchArr.length === 0) {
      deleteNote(wikiNoteId);
    }
  }
};
