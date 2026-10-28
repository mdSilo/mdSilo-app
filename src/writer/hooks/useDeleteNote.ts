import { useCallback } from 'react';
import { useCurrentViewContext } from '@/state/useCurrentView';
import { store } from '@/state/store';
import updateBacklinks from '@/writer/backlinks/updateBacklinks';
import { deleteFile } from '@/workspace/write';
import { cancelSave } from '@/workspace/pendingSaves';

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
  // a save still waiting would write the file again
  cancelSave(noteId);
  // delete in store
  store.getState().deleteNote(noteId);
  // delete backlinks
  await updateBacklinks(noteTitle, undefined);
  // delete in disk,
  await deleteFile(noteId); 
}
