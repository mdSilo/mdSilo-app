import { MouseEvent, useCallback } from 'react';
import { Path } from 'slate';
import { useCurrentViewContext } from 'context/useCurrentView';
import { useStore } from 'lib/store';

export default function useOnNoteLinkClick(currentNoteId: string) {
  const currentView = useCurrentViewContext();
  const viewState = currentView.state;
  const dispatch = currentView.dispatch;

  const openNoteIds = useStore((state) => state.openNoteIds);
  const isPageStackingOn = useStore((state) => state.isPageStackingOn);

  const onClick = useCallback(
    (noteId: string, stackNote: boolean, highlightedPath?: Path) => {
      //console.log("hl hash", highlightedPath)
      // If stackNote is false, open the note in its own page
      stackNote = false;
      if (!stackNote) {
        const hash = highlightedPath ? `0-${highlightedPath}` : '';
        //console.log("here-1", highlightedPath)
        dispatch({view: 'md', params: {noteId, hash}});
        return;
      }

      // FIXME: stack note view

      // If the note is already open, scroll it into view
      const index = openNoteIds.findIndex(
        (openNoteId) => openNoteId === noteId
      );
      console.log("here-2: index", openNoteIds, noteId, index)
      if (index > -1) {
        const noteElement = document.getElementById(openNoteIds[index]);
        if (noteElement) {
          const notesContainer = noteElement.parentElement;
          const noteWidth = noteElement.offsetWidth;
          notesContainer?.scrollTo({
            left: noteWidth * index, // We assume all the notes are the same width
            behavior: 'smooth',
          });
        }

        if (highlightedPath) {
          // Update highlighted path; scrolling is handled in editor
          const stackedNoteIds = viewState.params?.stackIds || [];
          const hash = `${index}-${highlightedPath}`;
          dispatch({view: 'md', params: {noteId, stackIds: stackedNoteIds, hash}});
        }

        console.log("here-2", highlightedPath)

        return;
      }

      // If the note is not open, add it to the open notes after currentNoteId
      const currentNoteIndex = openNoteIds.findIndex(
        (openNoteId) => openNoteId === currentNoteId
      );
      if (currentNoteIndex < 0) {
        console.log(`Error: current ${currentNoteId} is not in open notes`);
        return;
      }

      const newNoteIndex = currentNoteIndex + 1;

      // Replace the notes after the current note with the new note
      const stackedNoteIds = viewState.params?.stackIds || [];
      stackedNoteIds.splice(
        newNoteIndex - 1, // Stacked notes don't include the main note
        stackedNoteIds.length - (newNoteIndex - 1),
        noteId
      );

      // Open the note as a stacked note
      const hash = highlightedPath
        ? `${newNoteIndex}-${highlightedPath}`
        : undefined;
      dispatch({view: 'md', params: {noteId, stackIds: stackedNoteIds, hash}});
      console.log("here-3", highlightedPath)
    },
    [openNoteIds, viewState.params?.stackIds, dispatch, currentNoteId]
  );

  const defaultStackingBehavior = useCallback(
    (e: MouseEvent) =>
      (isPageStackingOn && !e.shiftKey) || (!isPageStackingOn && e.shiftKey),
    [isPageStackingOn]
  );

  return { onClick, defaultStackingBehavior };
}
