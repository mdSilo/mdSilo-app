import { useMemo } from 'react';
import { NoteMap, useStore } from 'lib/store';
import useDebounce from 'editor/hooks/useDebounce';
import { linkTitlesOf } from 'utils/mdlink';
import { getMarkdownTextBlocks, indexOf, type TextBlock } from 'lib/linkIndex';
import useLoadNotes from 'editor/hooks/useLoadNotes';

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
  useLoadNotes();

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
 * Searches the notes linking to (linked) or mentioning (unlinked) the title.
 * The index tells the notes to look in: only those are read, parsed once.
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

  const index = indexOf(notes);
  // the titles a link to the note may have, including the legacy one
  const linkTitles = linkTitlesOf(title, (t) => index.hasTitle(t));
  const candidates = index.linking(linkTitles);
  for (const id of index.mentioning(title)) candidates.add(id);

  // in the order of the notes
  for (const note of notes.values()) {
    if (note.id === noteId || !candidates.has(note.id)) {
      continue;
    }
    const linked: BacklinkMatch[] = [];
    const unlinked: BacklinkMatch[] = [];
    index.blocks(note.id).forEach((block, blockIndex) => {
      for (const run of block.runs) {
        if (run.link !== undefined) {
          // linked: href is the title
          if (linkTitles.includes(run.link)) {
            linked.push(toMatch(block, blockIndex, run.from, run.text.length));
          }
          continue;
        }
        // unlinked: title in text, not in a link
        let at = run.text.indexOf(title);
        while (at >= 0) {
          unlinked.push(toMatch(block, blockIndex, run.from + at, title.length));
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

export { getMarkdownTextBlocks };
