import { store } from "@/state/store";
import type { DispatchType } from "@/state/useCurrentView";
import { shownViewType } from "@/state/viewReducer";
import { isMobileWidth } from "@/lib/hooks/useIsMobile";
import { closeBeside, openBeside } from "@/writer/beside";
import { flushSave } from "@/workspace/pendingSaves";
import { canOpenDrawingWindow, openDrawingWindow } from "./window";
import { createDrawing } from "./drawing";

/**
 * Where a drawing opens:
 * - `view`: alone, as the view;
 * - `beside`: beside the note or book shown (over it on a phone), else as the view;
 * - `window`: in a window of its own (desktop), else as `beside`;
 * - `auto`: beside a note or book, else as the view.
 */
export type DrawingPlace = "view" | "beside" | "window" | "auto";

/** the views a drawing can be open beside */
const besideViews = new Set(["md", "book"]);

/**
 * The note beside that the drawing beside covers, opened from it (the slash
 * menu, a picture edited): back beside once the drawing closes.
 */
let noteUnder = "";

/**
 * Open a drawing, `path` its `.excalidraw` file.
 * @param fromBeside opened from the note beside: it comes back once the
 * drawing beside closes
 */
export async function openDrawing(
  path: string,
  dispatch: DispatchType,
  place: DrawingPlace = "auto",
  fromBeside = false,
) {
  if (place === "window" && canOpenDrawingWindow) {
    openDrawingWindow(path);
    return;
  }
  const beside = place !== "view" && besideViews.has(shownViewType());
  if (beside) {
    // one pane beside: the note there leaves it, for a while if drawn from
    const { besideNoteId } = store.getState();
    noteUnder = fromBeside ? besideNoteId : "";
    closeBeside();
    store.getState().setBesideDrawing(path);
    return;
  }
  closeBesideDrawing();
  dispatch({ view: "drawing", path });
  if (isMobileWidth()) store.getState().setIsSidebarOpen(false);
}

/**
 * Close the drawing beside, if any (it saves as it closes).
 * @param back the note beside it covered, if any, open beside again
 */
export function closeBesideDrawing(back = false) {
  const note = noteUnder;
  noteUnder = "";
  if (store.getState().besideDrawing) store.getState().setBesideDrawing("");
  if (back && note)
    void flushSave(note).then(() => {
      // nothing else opened beside meanwhile
      const { besideNoteId, besideDrawing } = store.getState();
      if (!besideNoteId && !besideDrawing) void openBeside(note);
    });
}

/** The drawing beside shown alone, as the view. */
export function expandBesideDrawing(dispatch: DispatchType) {
  const path = store.getState().besideDrawing;
  if (!path) return;
  closeBesideDrawing();
  dispatch({ view: "drawing", path });
}

/** Make a new drawing and open it. */
export async function newDrawing(
  dispatch: DispatchType,
  place: DrawingPlace = "auto",
) {
  try {
    await openDrawing(await createDrawing(), dispatch, place);
  } catch (e) {
    console.error("Failed to make a drawing:", e);
  }
}
