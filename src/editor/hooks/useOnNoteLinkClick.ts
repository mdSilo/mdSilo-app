import { MouseEvent, useCallback } from 'react';
//import { useNavigate } from "react-router-dom";
import { Path } from 'slate';
import { useStore } from 'lib/store';
//import { queryParamToArray } from 'utils/helper';

export default function useOnNoteLinkClick(currentNoteId: string) {
  //const navigate = useNavigate();
  // const { query: { stack: stackQuery },} = router;
  // const openNoteIds = useStore((state) => state.openNoteIds);
  const isPageStackingOn = useStore((state) => state.isPageStackingOn);

  const onClick = useCallback(
    (noteId: string, stackNote: boolean, highlightedPath?: Path) => {
      // Currently stackNote is false, open the note in its own page
      const hash = highlightedPath ? `0-${highlightedPath}` : '';
      console.log(`/app/md/${noteId}#${hash}`);
      return;
    },
    []
  );

  const defaultStackingBehavior = useCallback(
    (e: MouseEvent) =>
      (isPageStackingOn && !e.shiftKey) || (!isPageStackingOn && e.shiftKey),
    [isPageStackingOn]
  );

  return { onClick, defaultStackingBehavior };
}
