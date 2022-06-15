import { useCallback } from 'react';
import { useCurrentViewContext } from 'context/useCurrentView';
import { store } from 'lib/store';
import { regDateStr } from 'utils/helper';
import updateBacklinks from 'components/note/backlinks/updateBacklinks';
import { writeJsonFile, deleteFile } from 'file/write';
import { joinPaths } from 'file/util';

export default function useDeleteNote(noteId: string, noteTitle: string) {
  const currentView = useCurrentViewContext();
  const dispatch = currentView.dispatch;

  const onDeleteClick = useCallback(async () => {
    dispatch({view: 'chronicle'});
    doDeleteNote(noteId, noteTitle);
  }, [dispatch, noteId, noteTitle]);

  return onDeleteClick;
}

export async function doDeleteNote(noteId: string, noteTitle: string) {
  // delete in store
  store.getState().deleteNote(noteId);
  // delete backlinks
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
