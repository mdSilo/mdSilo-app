import { invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import { t } from "@/i18n";
import { writingRoot } from "@/workspace/layout";
import { reloadOpenNote } from "@/workspace/noteReloads";
import { flushSave } from "@/workspace/pendingSaves";
import type { RenameOptions } from "@/workspace/renamePath";
import { followRename } from "@/workspace/renames";
import {
  joinPath,
  movedPath,
  normalizeSlash,
  renameFile,
} from "@/workspace/util";
import { writeFile } from "@/workspace/write";
import {
  DRAWING_EXT,
  dirOfPath,
  drawingOfSvg,
  isDrawingFile,
  relativePath,
  svgOfDrawing,
} from "./drawing";
import { imageFileOf } from "./noteDrawings";
import { flushDrawings } from "./save";

/**
 * A drawing and its picture go together: renamed or moved, in the app or
 * not, the other file follows, and so do the pictures in the notes and the
 * drawing open.
 */

const isSvg = (path: string) => /\.svg$/i.test(path);

/** The other file of a drawing: `Foo.excalidraw` <-> `Foo.svg` */
export function pairOf(path: string): string | undefined {
  if (isDrawingFile(path)) return svgOfDrawing(path);
  if (isSvg(path)) return `${path.slice(0, -4)}${DRAWING_EXT}`;
  return undefined;
}

/** A rename of a drawing, or of the picture of one (in `drawing/`) */
export const isDrawingRename = (from: string, to: string) =>
  (isDrawingFile(from) && isDrawingFile(to)) ||
  (isSvg(from) && isSvg(to) && Boolean(drawingOfSvg(from)));

const exists = (path: string) =>
  invoke<boolean>("file_exist", { filePath: path }).catch(() => false);

const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/**
 * A drawing renamed: not over the other file of another drawing; what is
 * drawn and typed saved first, under the old names.
 */
export const drawingRenameOptions = (path: string): RenameOptions => ({
  check: async (to) => {
    const other = pairOf(to);
    if (!other || !(await exists(pairOf(path) ?? ""))) return undefined;
    return (await exists(other))
      ? t("{name} already exists", { name: nameOf(other) })
      : undefined;
  },
  before: async () => {
    await flushDrawings();
    await flushSave();
  },
});

/** Move a drawing into the dir, its picture with it. */
export async function moveDrawing(
  path: string,
  tarDir: string,
): Promise<string | undefined> {
  const src = normalizeSlash(path);
  const to = joinPath(normalizeSlash(tarDir), nameOf(src));
  const options = drawingRenameOptions(src);
  const refused =
    ((await exists(to))
      ? t("{name} already exists", { name: nameOf(to) })
      : "") || (await options.check?.(to));
  if (refused) {
    await invoke("msg_dialog", { title: t("Move"), msg: refused });
    return undefined;
  }
  await options.before?.();
  if (!(await renameFile(src, to))) return undefined;
  await followRename(src, to);
  return to;
}

// `![alt](src "title")`: the src, maybe in <>, and what follows it
const IMAGE =
  /(!\[(?:\\.|[^\\\]\n])*\]\(\s*)(<[^<>\n]*>|[^\s()<>]+)([^)\n]*\))/g;

/**
 * The links of a note to the picture `from`, to `to`: relative to the note,
 * as a new one is written. The others stay as they are.
 */
export function relinkPicture(
  content: string,
  noteDir: string,
  notesRoot: string | undefined,
  from: string,
  to: string,
): string {
  return content.replace(
    IMAGE,
    (all, head: string, src: string, tail: string) => {
      const bare = src.startsWith("<") ? src.slice(1, -1) : src;
      if (imageFileOf(bare, noteDir, notesRoot) !== from) return all;
      return `${head}${encodeURI(relativePath(noteDir, to))}${tail}`;
    },
  );
}

/** The pictures of the notes linking to `from`, to `to`. */
async function relinkNotes(from: string, to: string) {
  const { ensureNotesLoaded } =
    await import("@/writer/backlinks/updateBacklinks");
  const { noteContent } = await import("@/lib/contentCache");
  await ensureNotesLoaded();
  const notesRoot = writingRoot();
  // a link has the name of the file, as typed or encoded
  const name = nameOf(from);
  const names = [name, encodeURI(name), encodeURIComponent(name)];
  const { notes, updateNote } = store.getState();
  const rewritten: string[] = [];
  for (const note of notes.values()) {
    if (note.is_dir) continue;
    const old = note.parsed ? await noteContent(note.id) : note.content;
    if (!old || !names.some((n) => old.includes(n))) continue;
    const content = relinkPicture(old, dirOfPath(note.id), notesRoot, from, to);
    if (content === old) continue;
    updateNote({ id: note.id, content });
    await writeFile(note.file_path, content);
    rewritten.push(note.id);
  }
  // the notes open: shown again with the new links
  const { currentNote } = store.getState();
  const open = rewritten.filter((id) => currentNote[id]);
  if (open.length === 0) return;
  store.setState((state) => {
    const notes = { ...state.currentNote };
    for (const id of open) {
      const content = state.notes.get(id)?.content;
      if (content !== undefined) notes[id] = { ...notes[id], content };
    }
    return { currentNote: notes };
  });
  reloadOpenNote();
}

/**
 * Follow a rename of a drawing or of its picture (see renames.ts): the other
 * file renamed too, the pictures in the notes relinked, the drawing open
 * beside followed. Seen twice (the app, then the watcher), it does nothing
 * more.
 */
export async function followDrawingRename(from: string, to: string) {
  const otherFrom = pairOf(from);
  const otherTo = pairOf(to);
  if (
    otherFrom &&
    otherTo &&
    (await exists(otherFrom)) &&
    !(await exists(otherTo))
  ) {
    await renameFile(otherFrom, otherTo);
  }
  const drawingFrom = isDrawingFile(from) ? from : otherFrom;
  const drawingTo = isDrawingFile(to) ? to : otherTo;
  const svgFrom = isSvg(from) ? from : otherFrom;
  const svgTo = isSvg(to) ? to : otherTo;
  // each file followed where it is now: the other one may have stayed (its
  // new name taken)
  const isMoved = async (a?: string, b?: string) =>
    Boolean(a && b) && (await exists(b!)) && !(await exists(a!));
  if (await isMoved(svgFrom, svgTo)) await relinkNotes(svgFrom!, svgTo!);
  if (!(await isMoved(drawingFrom, drawingTo))) return undefined;
  // the drawing beside: at its new path (the view follows by onRenamed)
  const { besideDrawing, setBesideDrawing } = store.getState();
  const moved = besideDrawing
    ? movedPath(normalizeSlash(besideDrawing), drawingFrom!, drawingTo!)
    : undefined;
  if (moved) setBesideDrawing(moved);
  return { from: drawingFrom!, to: drawingTo! };
}
