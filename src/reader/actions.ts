import copy from 'copy-to-clipboard';
import * as CFI from 'foliate-js/epubcfi.js';
import { store } from 'lib/store';
import {
  bookHref, newNoteId, type BookNote, type HighlightColor, type HighlightStyle,
} from './annotations';
import { useReaderStore } from './readerStore';
import { usePopups, type TextSelection } from './popups';
import { getView } from './view';
import { withDefaults } from './settings';

/** The highlight the toolbar makes: the style last used, and its color. */
export function defaultHighlight(): { style: HighlightStyle; color: HighlightColor } {
  const settings = withDefaults(store.getState().readerSettings);
  return { style: settings.highlightStyle, color: settings.highlightColors[settings.highlightStyle] };
}

/** The highlight used from now on: of this style, of this color. */
export function rememberHighlight(style: HighlightStyle, color?: HighlightColor) {
  const settings = withDefaults(store.getState().readerSettings);
  store.getState().setReaderSettings({
    ...settings,
    highlightStyle: style,
    highlightColors: { ...settings.highlightColors, ...(color ? { [style]: color } : {}) },
  });
}

/**
 * Annotate the text selected: a highlight, with a note to write maybe. The
 * text highlighted already: its highlight, changed if a color or style is given.
 */
export function annotateSelection(
  selection: TextSelection,
  color?: HighlightColor,
  style?: HighlightStyle,
): BookNote {
  const now = new Date().toISOString();
  const { notes, location, addNote, updateNote } = useReaderStore.getState();
  const existing = notes.find((n) => n.cfi === selection.cfi && n.type === 'annotation');
  if (existing) {
    const patch = { ...(color ? { color } : {}), ...(style ? { style } : {}) };
    if (Object.keys(patch).length) updateNote(existing.id, patch);
    getView()?.deselect();
    return { ...existing, ...patch };
  }
  const defaults = defaultHighlight();
  color ??= style ? withDefaults(store.getState().readerSettings).highlightColors[style] : defaults.color;
  style ??= defaults.style;
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

/** The bookmark of a page: the CFI of the page, or a place in it. */
export function bookmarkAt(notes: BookNote[], cfi: string) {
  const bookmarks = notes.filter((n) => n.type === 'bookmark');
  const exact = bookmarks.find((n) => n.cfi === cfi);
  if (exact || bookmarks.length === 0) return exact;
  try {
    const start = CFI.collapse(cfi);
    const end = CFI.collapse(cfi, true);
    return bookmarks.find((n) => {
      const at = CFI.collapse(n.cfi);
      return CFI.compare(at, start) >= 0 && CFI.compare(at, end) <= 0;
    });
  } catch {
    return undefined;
  }
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
