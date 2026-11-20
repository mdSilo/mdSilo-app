import { useMemo } from "react";
import {
  ProvideInnerView,
  useCurrentViewContext,
} from "@/state/useCurrentView";
import type { ViewAction } from "@/state/viewReducer";
import { useStore } from "@/state/store";
import { useNoteReloads } from "@/workspace/noteReloads";
import Note from "./Note";
import { closeBookKeepNote, openBeside, setNotePane } from "./beside";

/**
 * The note beside the note shown or the book read (parallel writing). Its
 * links to notes, and its renames, stay in it; the other views show as usual.
 */
export default function BesideNote() {
  const noteId = useStore((s) => s.besideNoteId);
  const onLeft = useStore((s) => s.besideOnLeft);
  // mounted again when the note changed on disk, e.g. by a sync
  const reloads = useNoteReloads((s) => s.seq);
  const { state, dispatch } = useCurrentViewContext();
  // beside a book: it can be closed from here too, the reader's bar is hidden
  const inBook = state.view === "book";
  const closeBook = useMemo(
    () => (inBook ? () => void closeBookKeepNote(dispatch) : undefined),
    [inBook, dispatch],
  );
  const inner = useMemo(
    () => ({
      state: { view: "md", params: { noteId } },
      dispatch: (action: ViewAction) => {
        if (action.view === "md") void openBeside(action.params.noteId);
        else dispatch(action);
      },
    }),
    [noteId, dispatch],
  );
  if (!noteId) return null;
  return (
    <div
      className={`flex flex-1 min-w-0 border-base-300 ${onLeft ? "border-r" : "border-l"}`}
      data-testid="beside-note"
      onPointerDownCapture={() => setNotePane("side")}
      onFocusCapture={() => setNotePane("side")}
    >
      <ProvideInnerView value={inner}>
        <Note
          key={`${noteId}#${reloads}`}
          noteId={noteId}
          beside
          closeBook={closeBook}
        />
      </ProvideInnerView>
    </div>
  );
}
