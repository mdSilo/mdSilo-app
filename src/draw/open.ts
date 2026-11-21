import { store } from "@/state/store";
import type { DispatchType } from "@/state/useCurrentView";
import { shownViewType } from "@/state/viewReducer";
import { isMobileWidth } from "@/lib/hooks/useIsMobile";
import { closeBeside } from "@/writer/beside";
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

/** Open a drawing, `path` its `.excalidraw` file. */
export async function openDrawing(
  path: string,
  dispatch: DispatchType,
  place: DrawingPlace = "auto",
) {
  if (place === "window" && canOpenDrawingWindow) {
    openDrawingWindow(path);
    return;
  }
  const beside = place !== "view" && besideViews.has(shownViewType());
  if (beside) {
    // one pane beside: the note there leaves it
    closeBeside();
    store.getState().setBesideDrawing(path);
    return;
  }
  closeBesideDrawing();
  dispatch({ view: "drawing", path });
  if (isMobileWidth()) store.getState().setIsSidebarOpen(false);
}

/** Close the drawing beside, if any (it saves as it closes). */
export function closeBesideDrawing() {
  if (store.getState().besideDrawing) store.getState().setBesideDrawing("");
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
