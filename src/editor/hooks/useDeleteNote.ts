import { useCallback } from 'react';
import { useCurrentViewContext } from 'context/useCurrentView';
import deleteBacklinks from 'editor/backlinks/deleteBacklinks';
import { store, useStore } from 'lib/store';

export default function useDeleteNote(noteId: string) {
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
    
    // delete locally and update backlinks
    store.getState().deleteNote(noteId);
    await deleteBacklinks(noteId);
  }, [dispatch, noteId, openNoteIds]);

  return onDeleteClick;
}
