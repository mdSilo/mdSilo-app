import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";
import { flushSave, scheduleSave } from "@/workspace/pendingSaves";
import { EMPTY_SVG, svgOfDrawing } from "./drawing";

/** A scene as Excalidraw gives it on a change */
export type Scene = {
  elements: readonly ExcalidrawElement[];
  appState: AppState;
  files: BinaryFiles;
};

/** The functions of Excalidraw used to save, loaded with it (big) */
export type SaveApi = {
  serializeAsJSON: typeof import("@excalidraw/excalidraw").serializeAsJSON;
  exportToSvg: typeof import("@excalidraw/excalidraw").exportToSvg;
  getSceneVersion: typeof import("@excalidraw/excalidraw").getSceneVersion;
};

/**
 * What a save would change: the elements (their versions), the background,
 * the files (images). Not the view: scrolling or zooming saves nothing.
 */
export const sceneKey = (api: SaveApi, { elements, appState, files }: Scene) =>
  `${api.getSceneVersion(elements)}:${appState.viewBackgroundColor}:${Object.keys(files).length}`;

/** The picture of the scene: SVG, light, with its background and fonts */
export async function svgOfScene(api: SaveApi, scene: Scene): Promise<string> {
  const elements = scene.elements.filter((e) => !e.isDeleted);
  if (elements.length === 0) return EMPTY_SVG;
  const svg = await api.exportToSvg({
    elements,
    appState: {
      ...scene.appState,
      exportBackground: true,
      exportWithDarkMode: false,
    },
    files: scene.files,
    exportPadding: 10,
  });
  return `${svg.outerHTML}\n`;
}

type Listener = (svgPath: string) => void;
const listeners = new Set<Listener>();

/** The picture of a drawing written: the notes showing it load it again. */
export function onDrawingSaved(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The picture of a drawing written: here, and in the other windows if
 * `share` (see window.ts).
 */
export function drawingSaved(svgPath: string, share?: (path: string) => void) {
  for (const listener of listeners) listener(svgPath);
  share?.(svgPath);
}

// the savers of the drawings open, see flushDrawings
const open = new Set<DrawingSaver>();

/** Save the changes of the drawings open now, e.g. before the window closes. */
export async function flushDrawings(): Promise<void> {
  await Promise.all([...open].map((saver) => saver.flush()));
}

/**
 * The saves of a drawing open: the drawing once the changes pause (pending
 * saves, flushed when the window closes), then its picture.
 */
export class DrawingSaver {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private latest: Scene | undefined;
  private savedKey: string | undefined;
  // the picture of the last save, not to write two at once
  private picture: Promise<void> = Promise.resolve();

  constructor(
    private api: SaveApi,
    readonly path: string,
    private delay = 500,
    /** tell the other windows, see window.ts */
    private share?: (svgPath: string) => void,
  ) {}

  /** The scene as loaded: not saved again until it changes */
  loaded(scene: Scene) {
    this.savedKey = sceneKey(this.api, scene);
    open.add(this);
  }

  /** The drawing closed: what waits is saved */
  close(): Promise<void> {
    open.delete(this);
    return this.flush();
  }

  /** A change of the scene, saved once the changes pause */
  change(scene: Scene) {
    if (sceneKey(this.api, scene) === this.savedKey) return;
    this.latest = scene;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delay);
  }

  /** Save the change waiting now, if any; resolves once written */
  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    const scene = this.latest;
    this.latest = undefined;
    if (scene) {
      this.savedKey = sceneKey(this.api, scene);
      const { elements, appState, files } = scene;
      scheduleSave(
        this.path,
        `${this.api.serializeAsJSON(elements, appState, files, "local")}\n`,
      );
      const svgPath = svgOfDrawing(this.path);
      this.picture = this.picture
        .then(() => svgOfScene(this.api, scene))
        .then(async (svg) => {
          scheduleSave(svgPath, svg);
          await flushSave(svgPath);
          drawingSaved(svgPath, this.share);
        })
        .catch((e) => console.error(`Failed to save ${svgPath}`, e));
    }
    await Promise.all([flushSave(this.path), this.picture]);
  }
}
