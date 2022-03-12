import { useCallback } from 'react';
import { useCurrentViewContext } from 'context/useCurrentView';
import deleteBacklinks from 'editor/backlinks/deleteBacklinks';
import { store, useStore } from 'lib/store';
import { regDateStr } from 'utils/helper';
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
    
    // delete in store, delete backlinks or (blockreference? TODO)
    store.getState().deleteNote(noteId);
    await deleteBacklinks(noteId);
    // delete in disk, write to JSON
    const parentDir = store.getState().currentDir;
    if (parentDir) {
      const isDaily = regDateStr.test(noteTitle);
      const toDelPath = isDaily 
        ? await joinPaths(parentDir, ['daily', `${noteTitle}.md`])
        : await joinPaths(parentDir, [`${noteTitle}.md`]);
      await deleteFile(toDelPath);  // delete file in Disk
      await writeJsonFile(parentDir); // sync the deletion to JSON
    }
  }, [dispatch, noteId, noteTitle, openNoteIds]);

  return onDeleteClick;
}
