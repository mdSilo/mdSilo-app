import { useCallback } from 'react';
import { useCurrentViewContext } from 'context/useCurrentView';
import { store } from 'lib/store';
import updateBacklinks from 'components/note/backlinks/updateBacklinks';
import { deleteFile } from 'file/write';

export default function useDeleteNote(noteId: string, noteTitle: string) {
  const currentView = useCurrentViewContext();
  const dispatch = currentView.dispatch;

  const onDeleteClick = useCallback(async () => {
    dispatch({view: 'default'});
    doDeleteNote(noteId, noteTitle);
  }, [dispatch, noteId, noteTitle]);

  return onDeleteClick;
}

export async function doDeleteNote(noteId: string, noteTitle: string) {
  // delete in store
  store.getState().deleteNote(noteId);
  // delete backlinks
  await updateBacklinks(noteTitle, undefined);
  // delete in disk,
  await deleteFile(noteId); 
}
