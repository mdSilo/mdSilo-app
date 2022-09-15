import { useCallback } from 'react';
import { useCurrentViewContext } from 'context/useCurrentView';
import { openFilePaths } from 'file/open';

export default function useOnNoteLinkClick() {
  const currentView = useCurrentViewContext();
  const dispatch = currentView.dispatch;

  const onClick = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (toId: string, highlightedPath?: any) => {
      const noteId = await openFileAndGetNoteId(toId);
      const hash = highlightedPath ? `0-${highlightedPath}` : '';
      dispatch({view: 'md', params: {noteId, hash}});
      return;
    },
    [dispatch]
  );

  return { onClick };
}


// openFile, use case:
// always reload file. there are 7 to open note: 
//    inline note link,
//    onNoteLinkClick(side note list, backlink)
//    graph view, 
//    when switch mode, 
//    sum list(chronicle)
//    journal
export const openFileAndGetNoteId = async (noteId: string) => {
  const filePath = noteId;

  if (filePath) {
    // console.log("re-load: ", filePath);
    await openFilePaths([filePath]);
  }

  return noteId;
};
