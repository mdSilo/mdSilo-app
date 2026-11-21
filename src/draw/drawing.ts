import { invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import { DRAWING_DIR } from "@/workspace/layout";
import { openFilePaths } from "@/workspace/open";
import { createDirRecursive, joinPath, normalizeSlash } from "@/workspace/util";

/**
 * The drawings of a workspace, in `drawing/` at its root:
 *
 *   drawing/Foo.excalidraw   the drawing, as Excalidraw saves it (JSON)
 *   drawing/Foo.svg          its picture, written with it on each save
 *
 * A note shows the picture (`![Foo](../drawing/Foo.svg)`); the drawing is
 * opened to change it, and the picture follows.
 */

export const DRAWING_EXT = ".excalidraw";

/** `drawing/` of the workspace open, if any */
export function drawingRoot(): string | undefined {
  const { initDir } = store.getState();
  return initDir ? joinPath(initDir, DRAWING_DIR) : undefined;
}

export const isDrawingFile = (path: string) =>
  path.toLowerCase().endsWith(DRAWING_EXT);

/** The picture of a drawing: `Foo.excalidraw` -> `Foo.svg` */
export const svgOfDrawing = (path: string) =>
  `${path.slice(0, path.length - DRAWING_EXT.length)}.svg`;

/** The drawing of a picture, if the picture is of one: in `drawing/`, an SVG. */
export function drawingOfSvg(path: string, root = drawingRoot()) {
  if (!root) return undefined;
  const file = normalizeSlash(path);
  const dir = `${normalizeSlash(root)}/`;
  if (!file.startsWith(dir) || !/\.svg$/i.test(file)) return undefined;
  return `${file.slice(0, -4)}${DRAWING_EXT}`;
}

/** The name of a drawing, shown: its file name without the extension */
export const drawingName = (path: string) =>
  (normalizeSlash(path).split("/").pop() ?? path).slice(0, -DRAWING_EXT.length);

/** The scene of a new drawing, as Excalidraw saves one */
export const EMPTY_SCENE = {
  type: "excalidraw",
  version: 2,
  source: "https://mdsilo.com",
  elements: [],
  appState: { gridSize: 20, viewBackgroundColor: "#ffffff" },
  files: {},
};

/** The picture of an empty drawing, until it is drawn on */
export const EMPTY_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="80" viewBox="0 0 320 80"><rect x="1" y="1" width="318" height="78" rx="8" fill="none" stroke="#999" stroke-dasharray="6 4"/></svg>\n';

const pad = (n: number) => String(n).padStart(2, "0");

/** A name for a new drawing: `Drawing 2026-11-21 14.05` */
export function newDrawingName(now = new Date()) {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `Drawing ${date} ${pad(now.getHours())}.${pad(now.getMinutes())}`;
}

/** The name of a file: without `/ \ : * ? " < > |` */
const safeName = (name: string) =>
  name.replace(/[/\\:*?"<>|]/g, "-").trim() || newDrawingName();

/**
 * Make a new drawing in `drawing/`, with its picture, by a name no other
 * drawing has.
 * @returns the path of the drawing
 */
export async function createDrawing(name = newDrawingName()): Promise<string> {
  const root = drawingRoot();
  if (!root) throw new Error("No workspace is open");
  await createDirRecursive(root);
  const stem = safeName(name);
  for (let i = 0; ; i++) {
    const path = joinPath(
      root,
      `${i ? `${stem} ${i + 1}` : stem}${DRAWING_EXT}`,
    );
    const svg = svgOfDrawing(path);
    const taken = await Promise.all(
      [path, svg].map((p) => invoke<boolean>("file_exist", { filePath: p })),
    );
    if (taken.some(Boolean)) continue;
    await invoke("write_file", {
      filePath: path,
      text: `${JSON.stringify(EMPTY_SCENE, null, 2)}\n`,
    });
    await invoke("write_file", { filePath: svg, text: EMPTY_SVG });
    // in the tree now, not once the watcher tells
    void openFilePaths([path, svg]);
    return path;
  }
}

/** The text of a drawing file */
export const readDrawing = (path: string) =>
  invoke<string>("read_file", { filePath: path });

/**
 * The relative path from the dir of a note to a file, `/` separated, for a
 * link in the note: `../drawing/Foo.svg`
 */
export function relativePath(fromDir: string, to: string) {
  const from = normalizeSlash(fromDir).split("/").filter(Boolean);
  const target = normalizeSlash(to).split("/").filter(Boolean);
  let same = 0;
  while (
    same < from.length &&
    same < target.length - 1 &&
    from[same] === target[same]
  )
    same++;
  const up = from.slice(same).map(() => "..");
  return [...up, ...target.slice(same)].join("/") || ".";
}

/**
 * The Markdown of the picture of a drawing, in a note of `noteDir`:
 * `![Foo](../drawing/Foo.svg)`
 */
export function drawingMarkdown(drawing: string, noteDir: string) {
  const alt = drawingName(drawing)
    .replace(/[[\]\\]/g, "")
    .replace(/\s+/g, " ");
  return `![${alt}](${encodeURI(relativePath(noteDir, svgOfDrawing(drawing)))})`;
}

/** The dir of a file: `/ws/writing/a.md` -> `/ws/writing` */
export const dirOfPath = (path: string) => {
  const file = normalizeSlash(path);
  return file.slice(0, Math.max(0, file.lastIndexOf("/"))) || "/";
};

/** A drawing of `drawing/`, to pick one */
export type DrawingEntry = { path: string; name: string; modified: number };

type ListedFile = {
  file_path: string;
  is_file: boolean;
  is_hidden: boolean;
  last_modified?: { secs_since_epoch: number };
};

/** The drawings of `drawing/` (not its subfolders), last changed first. */
export async function listDrawings(): Promise<DrawingEntry[]> {
  const root = drawingRoot();
  if (!root) return [];
  // no drawing/ yet: none
  const files = await invoke<ListedFile[]>("list_directory", {
    dir: root,
  }).catch(() => []);
  return (files ?? [])
    .filter((f) => f.is_file && !f.is_hidden && isDrawingFile(f.file_path))
    .map((f) => ({
      path: normalizeSlash(f.file_path),
      name: drawingName(f.file_path),
      modified: f.last_modified?.secs_since_epoch ?? 0,
    }))
    .sort((a, b) => b.modified - a.modified || a.name.localeCompare(b.name));
}
