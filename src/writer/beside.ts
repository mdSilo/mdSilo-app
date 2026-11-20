import { store } from "@/state/store";
import type { ViewAction } from "@/state/viewReducer";
import { openFilePath } from "@/workspace/open";
import { flushSave } from "@/workspace/pendingSaves";
import { onRenamed } from "@/workspace/renames";
import { movedPath, normalizeSlash } from "@/workspace/util";
import { bookPathOfAnnotations } from "@/reader/annotations/annotations";

/**
 * Parallel writing: a note open beside the note shown, or beside the book
 * read. The note beside is `besideNoteId` in the store, its record kept in
 * `currentNote` with the note shown (see setCurrentNote). `currentNoteId`
 * stays the note shown (the view); `notePane` says which of the two was
 * used last, for the plugins to act on it (focusedNoteId).
 */

/** The type of a quote of a book dragged to a note: its markdown. */
export const QUOTE_MIME = "application/x-mdsilo-quote";

/**
 * A note that can not be edited beside: the notes of a book (`Foo.epub.md`)
 * are written again whole by the reader on each annotation.
 */
export const isBookNotes = (noteId: string) =>
  Boolean(bookPathOfAnnotations(noteId));

/**
 * Open a note beside the note or book shown. Not the note shown (two
 * editors of one file would write over each other), not a dir, not the
 * notes of a book.
 * @returns true if open
 */
export async function openBeside(noteId: string): Promise<boolean> {
  const { currentNoteId, besideNoteId } = store.getState();
  if (!noteId || noteId === currentNoteId || isBookNotes(noteId)) return false;
  if (noteId === besideNoteId) {
    store.getState().setNotePane("side");
    return true;
  }
  if (besideNoteId) await flushSave(besideNoteId);
  const note = await openFilePath(noteId, false);
  if (!note || note.is_dir) return false;
  store.setState((state) => {
    const currentNote = { ...state.currentNote, [note.id]: note };
    if (besideNoteId && besideNoteId !== state.currentNoteId)
      delete currentNote[besideNoteId];
    return { currentNote, besideNoteId: note.id, notePane: "side" as const };
  });
  return true;
}

/**
 * The book read closed, the note beside it shown alone in its place.
 * @param dispatch of the view shown (the book), not of the note beside
 */
export async function closeBookKeepNote(
  dispatch: (action: ViewAction) => void,
) {
  const { besideNoteId } = store.getState();
  if (!besideNoteId) return;
  await flushSave(besideNoteId);
  await openFilePath(besideNoteId, true);
  // shown in the view: the pane beside closes then (see MdView)
  dispatch({ view: "md", params: { noteId: besideNoteId } });
}

/** Close the note beside, if any. */
export function closeBeside() {
  const { besideNoteId } = store.getState();
  if (!besideNoteId) return;
  void flushSave(besideNoteId);
  store.setState((state) => {
    const currentNote = { ...state.currentNote };
    if (besideNoteId !== state.currentNoteId) delete currentNote[besideNoteId];
    return { currentNote, besideNoteId: "", notePane: "main" as const };
  });
}

/** Read the note beside again from its file, e.g. once its mode changed. */
export async function reloadBeside() {
  const { besideNoteId } = store.getState();
  if (!besideNoteId) return;
  const note = await openFilePath(besideNoteId, false);
  if (note && store.getState().besideNoteId === note.id)
    store.setState((state) => ({
      currentNote: { ...state.currentNote, [note.id]: note },
    }));
}

/** The note pane used last: the plugins act on its note. */
export const setNotePane = (pane: "main" | "side") => {
  if (store.getState().notePane !== pane) store.getState().setNotePane(pane);
};

/** The note used last: the note beside, or the note shown ("" in a book). */
export function focusedNoteId(): string {
  const { notePane, besideNoteId, currentNoteId } = store.getState();
  return notePane === "side" && besideNoteId ? besideNoteId : currentNoteId;
}

/** The notes open in an editor: the note shown, the note beside. */
export function openNoteIds(): string[] {
  const { currentNoteId, besideNoteId } = store.getState();
  return [currentNoteId, besideNoteId].filter(Boolean);
}

/** The pane beside to the other side. */
export const swapBeside = () =>
  store.getState().setBesideOnLeft((left) => !left);

/** The note beside follows its file renamed or moved, in the app or not. */
export const followBesideRenames = () =>
  onRenamed(({ from, to }) => {
    const { besideNoteId } = store.getState();
    if (!besideNoteId) return;
    const moved = movedPath(normalizeSlash(besideNoteId), from, to);
    if (!moved) return;
    store.setState({ besideNoteId: "" });
    void openBeside(moved);
  });
