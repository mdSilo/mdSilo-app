import { useCallback } from 'react';
import { useCurrentViewContext } from 'context/useCurrentView';
import { store, useStore } from 'lib/store';
import { regDateStr } from 'utils/helper';
import updateBacklinks from 'components/note/backlinks/updateBacklinks';
import { writeJsonFile, deleteFile } from 'file/write';
import { joinPaths } from 'file/util';

export default function useDeleteNote(noteId: string, noteTitle: string) {
  const openNoteIds = useStore((state) => state.openNoteIds);

  const currentView = useCurrentViewContext();
  const dispatch = currentView.dispatch;

  const onDeleteClick = useCallback(async () => {
    const deletedNoteIndex = openNoteIds.findIndex(
      (openNoteId) => openNoteId === noteId
    );

    if (deletedNoteIndex !== -1) {
      const noteIds = Object.keys(store.getState().notes);
      // Redirect to first not-del note or to chronicle view 
      if (noteIds.length > 1) {
        for (const id of noteIds) {
          if (noteId !== id) {
            dispatch({view: 'md', params: {noteId: id}});
            break;
          }
        }
      } else {
        dispatch({view: 'chronicle'});
      }
    }
    doDeleteNote(noteId, noteTitle);
  }, [dispatch, noteId, noteTitle, openNoteIds]);

  return onDeleteClick;
}

export async function doDeleteNote(noteId: string, noteTitle: string) {
  // delete in store, delete backlinks
  store.getState().deleteNote(noteId);
  await updateBacklinks(noteTitle, undefined);
  // delete in disk, write to JSON
  const parentDir = store.getState().currentDir;
  if (parentDir) {
    const isDaily = regDateStr.test(noteTitle);
    const toDelPath = isDaily 
      ? await joinPaths(parentDir, ['daily', `${noteTitle}.md`])
      : await joinPaths(parentDir, [`${noteTitle}.md`]);
    await deleteFile(toDelPath);    // delete file in Disk
    await writeJsonFile(parentDir); // sync the deletion to JSON
  }
}
