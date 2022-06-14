import { store } from 'lib/store';
import { ciStringEqual, isUrl } from 'utils/helper';
import { LINK_REGEX } from 'components/view/graph'
import { writeFile } from 'file/write';
import { computeLinkedBacklinks } from './useBacklinks';

/**
 * Updates the backlink properties of notes on the current note title changed.
 * the current note is the note other notes link to
 * @param noteTitle of current note 
 * @param newTitle of current note, it is undefined on delete note 
 */
const updateBacklinks = async (noteTitle: string, newTitle?: string) => {
  const notes = store.getState().notes;
  const updateNote = store.getState().updateNote;
  const backlinks = computeLinkedBacklinks(notes, noteTitle);

  for (const backlink of backlinks) {
    const note = notes[backlink.id];

    if (!note) {
      continue;
    }

    const link_array: RegExpMatchArray[] = [...note.content.matchAll(LINK_REGEX)];
    let content = note.content;
    for (const match of link_array) {
      const href = match[2];
      if (!isUrl(href)) {
        const title = href.replaceAll('_', ' ');
        if (ciStringEqual(noteTitle, title)) {
          const replaceTo = newTitle
            ? `[${match[1]}](${newTitle.replaceAll(' ', '_')})` // rename
            : match[1]                                          // delete
          content = content.replaceAll(match[0], replaceTo);
        }
      }
    }
    // update content and write file
    updateNote({ id: note.id, not_process: false, content });
    await writeFile(note?.file_path, content);
  }
};

export default updateBacklinks;
