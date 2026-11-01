import { useEffect } from "react";
import { emitTo } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  getCurrentWebviewWindow,
  WebviewWindow,
} from "@tauri-apps/api/webviewWindow";
import { store } from "@/state/store";
import { hasWindows } from "@/state/windowSync";
import type { DispatchType } from "@/state/useCurrentView";
import type { ViewAction } from "@/state/viewReducer";
import { openFilePath } from "@/workspace/open";

/** the label of the main window, see src-tauri/src/tray.rs */
export const MAIN_WIN = "main";

/** a view to show in the main window, from a book window */
const VIEW_EVENT = "mdsilo://view";
/** a place to go to in the book of a book window */
const GOTO_EVENT = "mdsilo://goto";

/** a book can be read in a window of its own: on desktop */
export const canOpenBookWindow = hasWindows;

// the book windows open, by the book (main window)
const bookWindows = new Map<string, WebviewWindow>();

/** The label of the window of a book, the same for the same book. */
export function bookWindowLabel(path: string) {
  // FNV-1a: a label takes letters, digits, -, /, :, _ only
  let hash = 0x811c9dc5;
  for (let i = 0; i < path.length; i++) {
    hash ^= path.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `book-${(hash >>> 0).toString(16)}-${path.length}`;
}

const focus = (win: {
  unminimize: () => Promise<void>;
  setFocus: () => Promise<void>;
}) =>
  win
    .unminimize()
    .then(() => win.setFocus())
    .catch((e) => console.error("Failed to focus the window:", e));

/**
 * The window of the book brought to the front, at `cfi` if given.
 * @returns false if the book has no window
 */
export function focusBookWindow(path: string, cfi?: string): boolean {
  const win = bookWindows.get(path);
  if (!win) return false;
  void focus(win);
  if (cfi)
    void emitTo(win.label, GOTO_EVENT, cfi).catch((e) =>
      console.error("Failed to go to the place:", e),
    );
  return true;
}

/** Read a book in a window of its own; its window if it has one already. */
export function openBookWindow(path: string, cfi?: string) {
  if (focusBookWindow(path, cfi)) return;
  const ws = store.getState().initDir;
  if (!ws) return;
  const search = new URLSearchParams({
    book: path,
    ws,
    ...(cfi ? { cfi } : {}),
  });
  const win = new WebviewWindow(bookWindowLabel(path), {
    // the root: the dev server prepares `/` only, not `/index.html`
    url: `/?${search.toString()}`,
    title: `${path.split("/").pop()} - mdSilo`,
    width: 900,
    height: 800,
    minWidth: 400,
    minHeight: 300,
  });
  bookWindows.set(path, win);
  const forget = () => {
    if (bookWindows.get(path) === win) bookWindows.delete(path);
  };
  void win.once("tauri://destroyed", forget);
  void win.once("tauri://error", (e) => {
    forget();
    console.error("Failed to open the book window:", e.payload);
  });
}

/** Read a book here, or in a window of its own where there can be one. */
export function readBook(
  dispatch: DispatchType,
  path: string,
  inWindow: boolean,
) {
  if (inWindow && canOpenBookWindow) openBookWindow(path);
  else dispatch({ view: "book", path });
}

/** Main window: a book with a window of its own is read there. */
export function routeMain(action: ViewAction): boolean {
  return action.view === "book" && focusBookWindow(action.path, action.cfi);
}

/** Book window: the views other than its book are shown in the main window. */
export const routeBook =
  (path: string) =>
  (action: ViewAction): boolean => {
    if (action.view === "book" && action.path === path) return false;
    void emitTo(MAIN_WIN, VIEW_EVENT, action).catch((e) =>
      console.error("Failed to show the view:", e),
    );
    return true;
  };

/** Main window: show the views asked by the book windows. */
export function useViewsOfBookWindows(dispatch: DispatchType) {
  useEffect(() => {
    if (!hasWindows) return;
    const unlisten = getCurrentWebviewWindow().listen<ViewAction>(
      VIEW_EVENT,
      async ({ payload }) => {
        // a note opened in the book window: here too
        if (payload.view === "md")
          await openFilePath(payload.params.noteId, true);
        dispatch(payload);
        void focus(getCurrentWindow());
      },
    );
    return () => void unlisten.then((off) => off());
  }, [dispatch]);
}

/** Book window: go to the places asked by the main window. */
export function useGotoInBookWindow(path: string, dispatch: DispatchType) {
  useEffect(() => {
    if (!hasWindows) return;
    const unlisten = getCurrentWebviewWindow().listen<string>(
      GOTO_EVENT,
      ({ payload }) => {
        dispatch({ view: "book", path, cfi: payload });
      },
    );
    return () => void unlisten.then((off) => off());
  }, [path, dispatch]);
}
