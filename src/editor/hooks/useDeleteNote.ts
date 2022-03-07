import { useCallback } from 'react';
import { useCurrentViewContext } from 'context/useCurrentView';
import deleteBacklinks from 'editor/backlinks/deleteBacklinks';
import { store, useStore } from 'lib/store';
import { deleteFile } from 'file/write';
import { joinPath } from 'file/util';

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
      // Redirect to first not-del note or to /app if no note already
      if (noteIds.length > 1) {
        for (const id of noteIds) {
          if (noteId !== id) {
            dispatch({view: 'md', params: {noteId: id}})
            break;
          }
        }
      } else {
        dispatch({view: 'chronicle'})
      }
    }
    
    // delete in store locally and update backlinks, or (blockreference? TODO)
    store.getState().deleteNote(noteId);
    await deleteBacklinks(noteId);
    // delete in disk
    const parentDir = store.getState().currentDir;
    if (parentDir) {
      const toDelPath = joinPath(parentDir, `${noteTitle}.md`);
      await deleteFile(toDelPath);
    }
  }, [dispatch, noteId, noteTitle, openNoteIds]);

  return onDeleteClick;
}
