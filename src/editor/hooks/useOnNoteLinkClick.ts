import { useCallback } from 'react';
import { useCurrentViewContext } from 'context/useCurrentView';
import { store } from 'lib/store';
import { Note } from 'types/model';
import { openFilePaths } from 'file/open';

export default function useOnNoteLinkClick() {
  const currentView = useCurrentViewContext();
  const dispatch = currentView.dispatch;

  const onClick = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (toId: string, note?: Note, highlightedPath?: any) => {
      const toNote = note || store.getState().notes[toId];
      const noteId = await openFileAndGetNoteId(toNote);
      const hash = highlightedPath ? `0-${highlightedPath}` : '';
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
// 3- always reload file. there are 7 to open note: 
//    inline note link,
//    onNoteLinkClick(side note list, backlink)
//    graph view, 
//    when switch mode, 
//    sum list(chronicle)
//    journal
export const openFileAndGetNoteId = async (note: Note) => {
  const filePath = note.file_path;
  const noteId = note.id;

  if (filePath) {
    // console.log("re-load: ", filePath);
    await openFilePaths([filePath]);
  }

  return noteId;
};
