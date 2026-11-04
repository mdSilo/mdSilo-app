import { useEffect, useRef } from "react";
import { onRenamed } from "@/workspace/renames";
import { movedPath, normalizeSlash } from "@/workspace/util";
import type { DispatchType } from "./useCurrentView";
import type { ViewState } from "./viewReducer";

/** The view of a note or book follows its file renamed or moved. */
export default function useFollowRenames(
  state: ViewState,
  dispatch: DispatchType,
) {
  const current = useRef(state);
  useEffect(() => {
    current.current = state;
  }, [state]);
  useEffect(
    () =>
      onRenamed(({ from, to }) => {
        const view = current.current;
        const moved = (path?: string) =>
          path ? movedPath(normalizeSlash(path), from, to) : undefined;
        if (view.view === "md" && view.params) {
          const noteId = moved(view.params.noteId);
          if (!noteId) return;
          const stackIds = view.params.stackIds?.map((id) => moved(id) ?? id);
          dispatch({
            view: "md",
            params: {
              ...view.params,
              noteId,
              ...(stackIds ? { stackIds } : {}),
            },
          });
        } else if (view.view === "book") {
          // the book open is at the new path already: not opened again
          const path = moved(view.bookPath);
          if (path) dispatch({ view: "book", path });
        }
      }),
    [dispatch],
  );
}
