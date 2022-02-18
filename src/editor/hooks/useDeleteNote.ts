import { useCallback } from 'react';
import deleteBacklinks from 'editor/backlinks/deleteBacklinks';
import { store, useStore } from 'lib/store';

export default function useDeleteNote(noteId: string) {
  // const router = useRouter();
  const openNoteIds = useStore((state) => state.openNoteIds);

  const onDeleteClick = useCallback(async () => {
    const deletedNoteIndex = openNoteIds.findIndex(
      (openNoteId) => openNoteId === noteId
    );

    if (deletedNoteIndex !== -1) {
      const noteIds = Object.keys(store.getState().notes);
      // Redirect to first not-del note or to /app if no note already
      // TODO, handle redirect
      if (noteIds.length > 1) {
        for (const id of noteIds) {
          if (noteId !== id) {
            //router.push(`/app/md/${id}`, undefined, { shallow: true });
            break;
          }
        }
      } else {
        // router.push('/app');
      }
    }
    
    // delete locally and update backlinks
    store.getState().deleteNote(noteId);
    await deleteBacklinks(noteId);
  }, [noteId, openNoteIds]);

  return onDeleteClick;
}
