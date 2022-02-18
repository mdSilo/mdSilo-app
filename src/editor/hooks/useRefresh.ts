import { FileSystemAccess } from 'editor/checks';
import { store } from 'lib/store';
import { ciStringEqual } from 'utils/helper';
import { refreshImport } from './useImport';

// use case: when any modification by other app, re-click the note title,
// to refresh the changes. would be heavy task
// 
// used before NoteLinkClick in SidebarNoteLink, NoteLinkElement.
// To reduce refresh, 
// currently not in BackLinkMatchLeaf,BackLinkNoteBranch,BlockRefElement 
export async function refreshFile(title: string) {
  if (title.trim().length === 0) {
    return; 
  }

  if (!FileSystemAccess.support(window)) {
    return;
  }

  const dirHandle = store.getState().dirHandle;
  if (!dirHandle) {
    return;
  }

  try {
    // re-get fileHandle to refresh: dirHandle.entries or getFileHandle or store? 
    const fileHandle = store.getState().handles[title];
    // const [,handleName] = getRealHandleName(title, false);
    // const fileHandle = await dirHandle.getFileHandle(handleName);
    const fileData = await fileHandle.getFile();
    // compare lastModified to reduce unnecessay refresh and conflict
    // look up in store
    const notes = store.getState().notes;
    const notesArr = Object.values(notes);
    const existingNote = notesArr.find((note) =>
      ciStringEqual(note.title, title) && !note.is_wiki 
    );
    const lastModDate = new Date(fileData.lastModified).toISOString();
    if (!existingNote || existingNote.updated_at >= lastModDate) {
      // console.log('Show lastModified: ', existingNote?.updated_at, lastModDate);
      return;
    }
    
    // re-processImport 
    const refreshedNote = await refreshImport(fileData, title);
    return refreshedNote;
  } catch (error) {
    console.log("An error occured when refresh file: ", error);
  }
}
