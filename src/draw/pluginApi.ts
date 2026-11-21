import { invoke } from "@tauri-apps/api/core";
import type { DrawingInfo } from "@mdsilo/plugin-api";
import { store } from "@/state/store";
import { openFilePaths } from "@/workspace/open";
import {
  createDirRecursive,
  fromWorkspacePath,
  isAbsolutePath,
  normalizeSlash,
  toWorkspacePath,
} from "@/workspace/util";
import {
  dirOfPath,
  drawingName,
  drawingRoot,
  isDrawingFile,
  svgOfDrawing,
} from "./drawing";
import { drawingSaved, flushDrawings, reloadDrawings } from "./save";
import { shareDrawingSaved } from "./window";

// What a plugin with `drawings:read`, `drawings:write` can do with the
// drawings (the types are of @mdsilo/plugin-api): the `.excalidraw` files of
// `drawing/` only, by their paths relative to the workspace.

const workspace = () => {
  const dir = store.getState().initDir;
  if (!dir) throw new Error("No workspace is open");
  return dir;
};

const asObject = (params: unknown): Record<string, unknown> =>
  typeof params === "object" && params !== null
    ? (params as Record<string, unknown>)
    : {};

const exists = (path: string) =>
  invoke<boolean>("file_exist", { filePath: path }).catch(() => false);

/** The drawing at a path given by a plugin: a `.excalidraw` in `drawing/` */
export function drawingAt(path: unknown): string {
  if (typeof path !== "string" || !path)
    throw new Error("The path of a drawing is wanted");
  const parts = path.replace(/\\/g, "/").split("/");
  if (isAbsolutePath(path) || path.includes(":") || parts.includes(".."))
    throw new Error(`Not a path in the workspace: ${path}`);
  const file = fromWorkspacePath(
    workspace(),
    parts.filter((p) => p && p !== ".").join("/"),
  );
  const root = drawingRoot();
  if (
    !root ||
    !file.startsWith(`${normalizeSlash(root)}/`) ||
    !isDrawingFile(file)
  )
    throw new Error(`Not a drawing (drawing/….excalidraw): ${path}`);
  return file;
}

type Listed = {
  file_path: string;
  is_dir: boolean;
  is_file: boolean;
  is_hidden: boolean;
  last_modified?: { secs_since_epoch: number };
};

/** The drawings of a dir and its sub dirs */
async function walk(dir: string, out: Listed[]) {
  const items = await invoke<Listed[]>("list_directory", { dir }).catch(
    () => [] as Listed[],
  );
  for (const item of items ?? []) {
    if (item.is_hidden) continue;
    if (item.is_dir) await walk(normalizeSlash(item.file_path), out);
    else if (item.is_file && isDrawingFile(item.file_path)) out.push(item);
  }
}

export async function listDrawingInfos(): Promise<DrawingInfo[]> {
  const dir = workspace();
  const root = drawingRoot();
  if (!root) return [];
  const found: Listed[] = [];
  await walk(root, found);
  return found
    .sort(
      (a, b) =>
        (b.last_modified?.secs_since_epoch ?? 0) -
        (a.last_modified?.secs_since_epoch ?? 0),
    )
    .map((f) => {
      const path = normalizeSlash(f.file_path);
      return {
        path: toWorkspacePath(dir, path),
        picture: toWorkspacePath(dir, svgOfDrawing(path)),
        name: drawingName(path),
        updated: new Date(
          (f.last_modified?.secs_since_epoch ?? 0) * 1000,
        ).toISOString(),
      };
    });
}

export async function readDrawingFiles(
  params: unknown,
): Promise<{ scene: string; svg: string }> {
  const path = drawingAt(asObject(params).path);
  if (!(await exists(path)))
    throw new Error(`No drawing at ${String(asObject(params).path)}`);
  // what is drawn in a canvas now, saved first
  await flushDrawings();
  const scene = await invoke<string>("read_file", { filePath: path });
  const svgPath = svgOfDrawing(path);
  const svg = (await exists(svgPath))
    ? await invoke<string>("read_file", { filePath: svgPath })
    : "";
  return { scene, svg };
}

export async function writeDrawingFiles(params: unknown): Promise<true> {
  const { scene, create } = asObject(params);
  if (typeof scene !== "string")
    throw new Error("drawings.write wants { path, scene }");
  const path = drawingAt(asObject(params).path);
  const svgPath = svgOfDrawing(path);
  const isNew = !(await exists(path));
  if (isNew && create !== true)
    throw new Error(`No drawing at ${String(asObject(params).path)}`);
  if (isNew && (await exists(svgPath)))
    throw new Error(`${toWorkspacePath(workspace(), svgPath)} already exists`);
  // checked and drawn before anything is written
  const { renderScene } = await import("./render");
  const rendered = await renderScene(scene);
  // what is drawn in a canvas now, saved first: then written over
  await flushDrawings();
  if (isNew) await createDirRecursive(dirOfPath(path));
  for (const [filePath, text] of [
    [path, rendered.scene],
    [svgPath, rendered.svg],
  ]) {
    const done = await invoke<boolean>("write_file", { filePath, text });
    if (done === false)
      throw new Error(
        `Could not write ${toWorkspacePath(workspace(), filePath)}`,
      );
  }
  if (isNew) void openFilePaths([path, svgPath]);
  // the canvases open load it again; the notes show the new picture
  reloadDrawings();
  drawingSaved(svgPath, shareDrawingSaved);
  return true;
}
