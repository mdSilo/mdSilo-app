import { useCallback, useEffect, useMemo } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { DispatchType } from "@/state/useCurrentView";
import { isAbsolutePath, normalizeSlash } from "@/workspace/util";
import {
  createDrawing,
  drawingName,
  drawingOfSvg,
  relativePath,
  svgOfDrawing,
} from "./drawing";
import { openDrawing } from "./open";
import { onDrawingSaved } from "./save";
import { listenDrawingSaved } from "./window";

/**
 * The pictures of drawings in the notes: edited from the note, and shown
 * again once their drawing is saved.
 */

function safeDecode(src: string) {
  try {
    return decodeURI(src);
  } catch {
    return src;
  }
}

/** `a/../b` -> `b`, `/` separated */
function normalizePath(path: string) {
  const out: string[] = [];
  const abs = path.startsWith("/");
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return `${abs ? "/" : ""}${out.join("/")}`;
}

/**
 * The file of an image of a note, as the editor resolves it: `./` from the
 * notes root, other relative paths from the dir of the note.
 */
export function imageFileOf(
  src: string,
  noteDir: string | undefined,
  notesRoot: string | undefined,
): string | undefined {
  if (!src || /^[a-z][\w+.-]*:/i.test(src) || src.startsWith("//"))
    return isAbsolutePath(src) ? normalizeSlash(src) : undefined;
  const path = normalizeSlash(safeDecode(src.split(/[?#]/)[0]));
  if (isAbsolutePath(path)) return path;
  const base = path.startsWith("./") ? notesRoot : (noteDir ?? notesRoot);
  if (!base) return undefined;
  return normalizePath(`${normalizeSlash(base)}/${path}`);
}

// the pictures of drawings written in this session: a version for each,
// added to their URL so they are loaded again, not from the cache
const versions = new Map<string, number>();

/** The URL of a local file, with the version of its picture if written. */
export function fileSrcOf(path: string): string {
  const url = convertFileSrc(path);
  const version = versions.get(normalizeSlash(path));
  return version ? `${url}${url.includes("?") ? "&" : "?"}v=${version}` : url;
}

const withoutQuery = (url: string) => url.split("?")[0];

/** The picture of a drawing written: the images showing it load it again. */
export function refreshPicture(svgPath: string, root: ParentNode = document) {
  const path = normalizeSlash(svgPath);
  versions.set(path, (versions.get(path) ?? 0) + 1);
  const base = withoutQuery(convertFileSrc(path));
  const fresh = fileSrcOf(path);
  for (const img of root.querySelectorAll("img")) {
    if (withoutQuery(img.getAttribute("src") ?? "") === base) img.src = fresh;
  }
}

/** Refresh the pictures of the drawings saved, here or in another window. */
export function useDrawingRefresh() {
  useEffect(() => {
    const stopHere = onDrawingSaved((path) => refreshPicture(path));
    const stopThere = listenDrawingSaved((path) => refreshPicture(path));
    return () => {
      stopHere();
      stopThere();
    };
  }, []);
}

/**
 * The props of the editor of a note for the pictures of drawings.
 * @param beside the note is the one beside: back there once the drawing closes
 */
export function useNoteDrawings(
  noteDir: string | undefined,
  notesRoot: string | undefined,
  dispatch: DispatchType,
  beside = false,
) {
  const drawingOf = useCallback(
    (src: string) => {
      const file = imageFileOf(src, noteDir, notesRoot);
      return file ? drawingOfSvg(file) : undefined;
    },
    [noteDir, notesRoot],
  );
  const isEditableImage = useCallback(
    (src: string) => Boolean(drawingOf(src)),
    [drawingOf],
  );
  const onEditImage = useCallback(
    (src: string) => {
      const drawing = drawingOf(src);
      if (drawing) void openDrawing(drawing, dispatch, "beside", beside);
    },
    [drawingOf, dispatch, beside],
  );
  const onCreateDrawing = useCallback(async () => {
    if (!noteDir) return undefined;
    const drawing = await createDrawing();
    void openDrawing(drawing, dispatch, "beside", beside);
    return {
      src: encodeURI(relativePath(noteDir, svgOfDrawing(drawing))),
      alt: drawingName(drawing),
    };
  }, [noteDir, dispatch, beside]);
  return useMemo(
    () => ({ isEditableImage, onEditImage, onCreateDrawing }),
    [isEditableImage, onEditImage, onCreateDrawing],
  );
}
