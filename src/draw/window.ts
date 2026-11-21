import { emit, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { store } from "@/state/store";
import { hasWindows } from "@/state/windowSync";
import { drawingName } from "./drawing";

/** a drawing can be drawn in a window of its own: on desktop */
export const canOpenDrawingWindow = hasWindows;

/** the picture of a drawing written in one window, for the others */
const SAVED_EVENT = "mdsilo://drawing-saved";
type SavedPayload = { from: string; svgPath: string };

/** The label of the window of a drawing, the same for the same drawing. */
export function drawingWindowLabel(path: string) {
  // FNV-1a: a label takes letters, digits, -, /, :, _ only
  let hash = 0x811c9dc5;
  for (let i = 0; i < path.length; i++) {
    hash ^= path.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `draw-${(hash >>> 0).toString(16)}-${path.length}`;
}

/** Draw in a window of its own; brought to the front if it has one already. */
export function openDrawingWindow(path: string) {
  const ws = store.getState().initDir;
  if (!ws) return;
  const label = drawingWindowLabel(path);
  void WebviewWindow.getByLabel(label).then((open) => {
    if (open) {
      void open
        .unminimize()
        .then(() => open.setFocus())
        .catch((e) => console.error("Failed to focus the window:", e));
      return;
    }
    const search = new URLSearchParams({ drawing: path, ws });
    const win = new WebviewWindow(label, {
      // the root: the dev server prepares `/` only, not `/index.html`
      url: `/?${search.toString()}`,
      title: `${drawingName(path)} - mdSilo`,
      width: 1000,
      height: 760,
      minWidth: 400,
      minHeight: 300,
    });
    void win.once("tauri://error", (e) =>
      console.error("Failed to open the drawing window:", e.payload),
    );
  });
}

/** Tell the other windows the picture of a drawing was written. */
export function shareDrawingSaved(svgPath: string) {
  if (!hasWindows) return;
  const payload: SavedPayload = { from: getCurrentWindow().label, svgPath };
  void emit(SAVED_EVENT, payload).catch((e) =>
    console.error("Failed to tell the drawing saved:", e),
  );
}

/**
 * The pictures of drawings written in the other windows.
 * @returns stop
 */
export function listenDrawingSaved(handler: (svgPath: string) => void) {
  if (!hasWindows) return () => undefined;
  const self = getCurrentWindow().label;
  const unlisten = listen<SavedPayload>(SAVED_EVENT, ({ payload }) => {
    if (payload.from !== self) handler(payload.svgPath);
  }).catch((e) => {
    console.error("Failed to listen to the drawings saved:", e);
    return () => undefined;
  });
  return () => void unlisten.then((off) => off());
}
