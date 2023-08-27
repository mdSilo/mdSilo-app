import { store } from 'lib/store';
import { isUrl } from 'utils/helper';
import { LINK_REGEX, WIKILINK_REGEX } from 'components/view/ForceGraph'
import { writeFile } from 'file/write';
import { loadDir } from 'file/open';
import { computeLinkedBacklinks } from './useBacklinks';

/**
 * Updates the backlink properties of notes on the current note title changed.
 * the current note is the note other notes link to
 * @param noteTitle of current note 
 * @param newTitle of current note, it is undefined on delete note 
 */
const updateBacklinks = async (noteTitle: string, newTitle?: string) => {
  const isLoaded = store.getState().isLoaded;
  const setIsLoaded = store.getState().setIsLoaded;
  const initDir = store.getState().initDir;
  // console.log("updateBackLinks loaded?", isLoaded);
  if (!isLoaded && initDir) {
    loadDir(initDir).then(() => setIsLoaded(true));
  }

  const notes = store.getState().notes;
  const updateNote = store.getState().updateNote;
  const backlinks = computeLinkedBacklinks(notes, noteTitle);
  for (const backlink of backlinks) {
    const note = notes[backlink.id];
    if (!note) {
      continue;
    }

    let content = note.content;
    // CASE: []()
    const link_array: RegExpMatchArray[] = [...note.content.matchAll(LINK_REGEX)];
    for (const match of link_array) {
      const href = match[2];
      if (!isUrl(href)) {
        const title = decodeURI(href);
        if (noteTitle === title) {
          newTitle = newTitle?.trim();
          const replaceTo = newTitle
            ? `[${match[1]}](${encodeURI(newTitle)})` // rename
            : match[1]                                // delete
          content = content.replaceAll(match[0], replaceTo);
        }
      }
    }
    // CASE: [[]]
    const wiki_array: RegExpMatchArray[] = [...note.content.matchAll(WIKILINK_REGEX)];
    // console.log("wiki arr", wiki_array, noteTitle, newTitle)
    for (const match of wiki_array) {
      const href = match[1];
      if (!isUrl(href)) {
        const title = href;
        if (noteTitle === title) {
          newTitle = newTitle?.trim();
          const replaceTo = newTitle
            ? `[[${newTitle}]]` // rename
            : match[1]          // delete
          content = content.replaceAll(match[0], replaceTo);
        }
      }
    }

    // update content and write file
    updateNote({ id: note.id, content });
    await writeFile(note?.file_path, content);
  }
};

export default updateBacklinks;
