import { store } from 'lib/store';
import { rewriteNoteLinks } from 'utils/mdlink';
import { writeFile } from 'file/write';
import { loadDir } from 'file/open';

const LOAD_TIMEOUT_MS = 5000;

/**
 * Make sure the notes are loaded with content, otherwise the links in
 * the notes not opened yet would be missed.
 * Wait for the load at most `timeout` ms then go on with what we have.
 */
export const ensureNotesLoaded = async (timeout = LOAD_TIMEOUT_MS) => {
  const { isLoaded, initDir } = store.getState();
  if (isLoaded || !initDir) return;

  await new Promise<void>((resolve) => {
    let unsubscribe = () => {};
    const timer = setTimeout(() => done(), timeout);
    const done = () => {
      clearTimeout(timer);
      unsubscribe();
      resolve();
    };
    unsubscribe = store.subscribe((state) => {
      if (state.isLoaded) done();
    });
    loadDir(initDir);
  });
};

/**
 * Updates the backlinks of the note on its title changed or deleted.
 * the current note is the note other notes link to
 * @param noteTitle of current note
 * @param newTitle of current note, it is undefined on delete note
 */
const updateBacklinks = async (noteTitle: string, newTitle?: string) => {
  if (!noteTitle.trim()) return;
  await ensureNotesLoaded();

  const notes = store.getState().notes;
  const toTitle = newTitle?.trim();
  // on delete, the links still work if another note has the same title
  if (!toTitle && notes.values().some((n) => !n.is_dir && n.title === noteTitle)) {
    return;
  }

  const updateNote = store.getState().updateNote;
  for (const note of notes.values()) {
    if (note.is_dir || !note.content) continue;
    const content = rewriteNoteLinks(note.content, noteTitle, toTitle);
    if (content === note.content) continue;
    // update content and write file
    updateNote({ id: note.id, content });
    await writeFile(note.file_path, content);
  }
};

export default updateBacklinks;
