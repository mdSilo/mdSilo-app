import { useCallback } from 'react';
import { useCurrentViewContext } from 'context/useCurrentView';
import { store } from 'lib/store';
import { Note } from 'types/model';
import { openFilePaths } from 'file/open';

export default function useOnNoteLinkClick() {
  const currentView = useCurrentViewContext();
  const dispatch = currentView.dispatch;

  const onClick = useCallback(
    async (toId: string, note?: Note, highlightedPath?: any) => {
      const toNote = note || store.getState().notes[toId];
      const noteId = await openFileAndGetNoteId(toNote);
      // console.log("hl hash", highlightedPath)
      const hash = highlightedPath ? `0-${highlightedPath}` : '';
      // console.log("here-1", highlightedPath)
      dispatch({view: 'md', params: {noteId, hash}});
      return;
    },
    [dispatch]
  );

  return { onClick };
}


// openFile if not_process. use case:
// 1- openDir, preProcess first, set not_process fasle, then process on click
// 2- listen dir change, set not_process false if any change, reload change on click
// 
export const openFileAndGetNoteId = async (note: Note) => {
  const filePath = note.file_path;
  const noteId = note.id;

  if (filePath) {
    // console.log("re-load: ", filePath);
    await openFilePaths([filePath]);
  }

  return noteId;
};
