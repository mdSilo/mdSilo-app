import copy from 'copy-to-clipboard';
import {
  bookHref, newNoteId, type BookNote, type HighlightColor, type HighlightStyle,
} from './annotations';
import { useReaderStore } from './readerStore';
import { usePopups, type TextSelection } from './popups';
import { getView } from './view';

/** Annotate the text selected: a highlight, with a note to write maybe. */
export function annotateSelection(
  selection: TextSelection,
  color: HighlightColor = 'yellow',
  style: HighlightStyle = 'highlight',
): BookNote {
  const now = new Date().toISOString();
  const { notes, location, addNote, updateNote } = useReaderStore.getState();
  // the same text again: change it
  const existing = notes.find((n) => n.cfi === selection.cfi);
  if (existing) {
    updateNote(existing.id, { color, style });
    return { ...existing, color, style };
  }
  const note: BookNote = {
    id: newNoteId(),
    type: 'annotation',
    cfi: selection.cfi,
    text: selection.text,
    color,
    style,
    note: '',
    ...(location?.tocLabel ? { chapter: location.tocLabel.trim() } : {}),
    createdAt: now,
    updatedAt: now,
  };
  addNote(note);
  getView()?.deselect();
  return note;
}

/** Bookmark the place read, or remove the bookmark there. */
export function toggleBookmark() {
  const { location, notes, addNote, removeNote } = useReaderStore.getState();
  if (!location) return;
  const existing = bookmarkAt(notes, location.cfi);
  if (existing) {
    removeNote(existing.id);
    return;
  }
  const now = new Date().toISOString();
  addNote({
    id: newNoteId(),
    type: 'bookmark',
    cfi: location.cfi,
    note: '',
    ...(location.tocLabel ? { chapter: location.tocLabel.trim() } : {}),
    createdAt: now,
    updatedAt: now,
  });
}

/** The bookmark of a place: the same CFI, or of the same page start. */
export function bookmarkAt(notes: BookNote[], cfi: string) {
  return notes.find((n) => n.type === 'bookmark' && n.cfi === cfi);
}

/** The markdown to put the text in a note: a quote with a link back to it. */
export function quoteMarkdown(text: string, cfi: string): string {
  const { hash, entry } = useReaderStore.getState();
  const quote = text.split(/\r?\n/).filter((l) => l.trim()).map((l) => `> ${l.trim()}`).join('\n');
  if (!hash) return quote;
  const title = (entry?.title ?? 'book').replace(/[[\]]/g, '');
  return `${quote}\n>\n> — [${title}](${bookHref(hash, cfi)})`;
}

export function copyQuote(text: string, cfi: string) {
  copy(quoteMarkdown(text, cfi), { format: 'text/plain' });
  usePopups.getState().clear();
}

export function copyLink(cfi: string) {
  const { hash } = useReaderStore.getState();
  if (hash) copy(bookHref(hash, cfi), { format: 'text/plain' });
  usePopups.getState().clear();
}
