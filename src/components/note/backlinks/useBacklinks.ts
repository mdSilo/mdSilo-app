import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { NoteMap, useStore } from '@/lib/store';
import useDebounce from '@/lib/hooks/useDebounce';
import { linkTitlesOf } from '@/lib/mdlink';
import { getMarkdownTextBlocks, indexOf, LinkIndex, type TextBlock } from '@/lib/linkIndex';
import { withContents } from '@/lib/contentCache';
import useLoadNotes from '@/lib/hooks/useLoadNotes';
import type { Note } from '@/types/model';

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

const EMPTY: Backlinks = { linkedBacklinks: [], unlinkedBacklinks: [] };

export default function useBacklinks(noteId: string): Backlinks {
  useLoadNotes();

  // the title is not debounced: be right at once on switching or renaming note
  const noteTitle = useStore((state) => state.notes.get(noteId)?.title) || '';
  const [notes] = useDebounce(
    useStore((state) => state.notes),
    DEBOUNCE_MS
  );
  const [backlinks, setBacklinks] = useState<Backlinks>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    loadBacklinks(notes, noteTitle, noteId)
      .then((found) => { if (!cancelled) setBacklinks(found); })
      .catch((e) => console.error('Failed to find the backlinks', e));
    return () => { cancelled = true; };
  }, [notes, noteTitle, noteId]);

  return backlinks;
}

/**
 * The notes mentioning the text, of the full-text search of the index; none
 * where it is not available.
 */
export async function searchMentions(text: string): Promise<string[]> {
  const phrase = text.replace(/["\\]/g, ' ').trim();
  if (!phrase) return [];
  try {
    const hits = await invoke<{ path: string }[] | undefined>(
      'index_search', { query: `"${phrase}"`, kind: 'note', limit: 500 }
    );
    return (hits ?? []).map((hit) => hit.path).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * The backlinks of a note, the notes not loaded (see Note.parsed) read for
 * the candidates only: the notes linking to the note, as the index tells,
 * and the ones mentioning its title, as its search finds.
 */
export async function loadBacklinks(
  notes: NoteMap,
  noteTitle: string,
  noteId?: string
): Promise<Backlinks> {
  const title = noteTitle.trim();
  if (!title) return EMPTY;
  const index = indexOf(notes);
  const linkTitles = linkTitlesOf(title, (t) => index.hasTitle(t));
  const candidates = index.linking(linkTitles);
  for (const id of index.mentioning(title)) candidates.add(id);
  if (index.notLoaded().length > 0) {
    for (const id of await searchMentions(title)) {
      if (notes.has(id)) candidates.add(id);
    }
  }
  candidates.delete(noteId ?? '');
  // in the order of the notes
  const found: Note[] = notes.values().filter((n) => candidates.has(n.id));
  const loaded = await withContents(found);
  return backlinksIn(loaded, title, linkTitles, noteId);
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
  const title = noteTitle.trim();
  if (!title) {
    return { linkedBacklinks: [], unlinkedBacklinks: [] };
  }

  const index = indexOf(notes);
  // the titles a link to the note may have, including the legacy one
  const linkTitles = linkTitlesOf(title, (t) => index.hasTitle(t));
  const candidates = index.linking(linkTitles);
  for (const id of index.mentioning(title)) candidates.add(id);

  const found = notes.values().filter((n) => candidates.has(n.id));
  return backlinksIn(found, title, linkTitles, noteId, index);
};

/**
 * The matches in the notes (with content) of the links to and mentions of
 * the title; parsed by the index given, synced with them, or by one of their own.
 */
function backlinksIn(
  notes: readonly Note[],
  title: string,
  linkTitles: string[],
  noteId: string | undefined,
  synced?: LinkIndex,
): Backlinks {
  const linkedBacklinks: Backlink[] = [];
  const unlinkedBacklinks: Backlink[] = [];
  let index = synced;
  if (!index) {
    index = new LinkIndex();
    index.sync(NoteMap.from(notes));
  }

  for (const note of notes) {
    if (note.id === noteId) {
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
}

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
