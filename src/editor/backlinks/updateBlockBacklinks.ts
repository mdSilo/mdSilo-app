import { Note } from 'types/model';
import { store } from 'lib/store';
import { writeJsonFile } from 'file/write';
import { Backlink } from './useBacklinks';

/**
 * Updates the block text for each block reference. 
 * This is necessary for full-text search.
 */
const updateBlockBacklinks = async (
  blockBacklinks: Backlink[],
  newText: string
) => {
  const notes = store.getState().notes;
  const updateData: Pick<Note, 'id' | 'content'>[] = [];

  for (const backlink of blockBacklinks) {
    const note = notes[backlink.id];

    if (!note) { continue; }

    // TODO

    updateData.push({
      id: backlink.id,
      content: note.content,
    });
  }

  // Make sure backlinks are updated locally
  for (const newNote of updateData) {
    store.getState().updateNote(newNote);
  }
  const currentDir = store.getState().currentDir;
  if (currentDir) { await writeJsonFile(currentDir); } // sync store to JSON
};

export default updateBlockBacklinks;
