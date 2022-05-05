import { Note } from 'types/model';
import { store } from 'lib/store';
import { writeJsonFile } from 'file/write';
import { computeLinkedBacklinks } from './useBacklinks';


/**
 * Updates the backlink properties of notes on the current note title changed,and 
 * id changed for a special case.
 * the current note is the note other notes link to
 * @param newTitle of note other notes link to
 * @param noteId of note other notes link to
 * @param newId of note other notes link to
 */
const updateBacklinks = async (newTitle: string, noteId: string, newId = '') => {
  const notes = store.getState().notes;
  const backlinks = computeLinkedBacklinks(notes, noteId);
  const updateData: Pick<Note, 'id' | 'content'>[] = [];

  for (const backlink of backlinks) {
    const note = notes[backlink.id];

    if (!note) { continue; }

    const newBacklinkContent = note.content;
    for (const match of backlink.matches) {
      // TODO
    }
    updateData.push({
      id: backlink.id,
      content: newBacklinkContent,
    });
  }

  // Make sure backlinks are updated locally
  for (const newNote of updateData) {
    store.getState().updateNote(newNote);
  }
  const currentDir = store.getState().currentDir;
  if (currentDir) { await writeJsonFile(currentDir); } // sync store to JSON
};

export default updateBacklinks;
