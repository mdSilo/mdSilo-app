import { Note } from 'types/model';
import { store } from 'lib/store';
import { writeJsonFile } from 'file/write';
import { computeLinkedBacklinks } from './useBacklinks';

const deleteBacklinks = async (noteId: string) => {
  const notes = store.getState().notes;
  const backlinks = computeLinkedBacklinks(notes, noteId);
  const updateData: Pick<Note, 'id' | 'content'>[] = [];

  for (const backlink of backlinks) {
    // TODO
  }

  // Make sure backlinks are updated locally
  for (const newNote of updateData) {
    store.getState().updateNote(newNote);
  }
  const currentDir = store.getState().currentDir;
  if (currentDir) { await writeJsonFile(currentDir); } // sync store to JSON
};

export default deleteBacklinks;
