import type MsEditor from "mdsmirror";
import { parser, textBlocksOf, type BlockMark } from "mdsmirror";
import type { MarkColor } from "@mdsilo/plugin-api";
import { store } from "@/state/store";
import { editorOf } from "@/writer/editors";
import { HIGHLIGHT_COLORS } from "@/reader/annotations/annotations";
import { HIGHLIGHT_CSS } from "@/reader/styles";
import type { PluginMethods } from "./host";
import type { InstalledPlugin } from "./registry";
import { noteInfo } from "./workspaceApi";

/**
 * What a plugin with `notes:read` can do with the note open in the editor
 * (WYSIWYG): where the cursor is, its blocks of text (paragraphs,
 * headings, items...), the cursor to a block, blocks marked (not in the
 * note). Blocks are by their place among the blocks of text of the note.
 */

const asObject = (params: unknown): Record<string, unknown> =>
  typeof params === "object" && params !== null
    ? (params as Record<string, unknown>)
    : {};

/** the most blocks given at once */
export const MAX_BLOCKS = 500;

/** A part of blocks: `count` from `from` on, and where to go on from */
export function blocksFrom<T>(
  all: T[],
  from: number,
  count = 50,
): { blocks: T[]; next?: number } {
  const want = Math.max(1, Math.min(MAX_BLOCKS, Math.floor(count)));
  const start = Math.max(0, Math.floor(from));
  const blocks = all.slice(start, start + want);
  const next = start + want;
  return next < all.length ? { blocks, next } : { blocks };
}

/** The blocks of text of Markdown, as the editor has them */
export const markdownBlocks = (markdown: string) =>
  textBlocksOf(parser.parse(markdown)).map(({ index, node }) => ({
    index,
    text: node.textContent,
  }));

function openEditor() {
  const noteId = store.getState().currentNoteId;
  const editor = noteId ? editorOf(noteId) : undefined;
  if (!noteId || !editor) throw new Error("No note is open in the editor");
  return { noteId, editor };
}

function blockOf(params: unknown, count: number): number {
  const { block } = asObject(params);
  if (typeof block !== "number" || !Number.isInteger(block))
    throw new Error("block should be the number of a block");
  if (block < 0 || block >= count) throw new Error(`No block ${block}`);
  return block;
}

/**
 * the marks of the plugins, by editor and by plugin, all drawn together:
 * gone with the editor (the note closed, or shown again)
 */
const marks = new WeakMap<MsEditor, Map<string, BlockMark[]>>();

function drawMarks(editor: MsEditor) {
  editor.setBlockMarks([...(marks.get(editor)?.values() ?? [])].flat());
}

/** a color behind text: of the highlights, light */
const cssOf = (color: MarkColor) => `${HIGHLIGHT_CSS[color]}4d`;

export const editorMethods = (plugin: InstalledPlugin): PluginMethods => ({
  "editor.info": {
    permission: "notes:read",
    handler: () => {
      const noteId = store.getState().currentNoteId;
      const editor = noteId ? editorOf(noteId) : undefined;
      if (!noteId || !editor) return null;
      const note = noteInfo(noteId);
      return {
        ...(note ? { note } : {}),
        block: editor.blockAtCursor(),
        blocks: editor.textBlocks().length,
      };
    },
  },
  "editor.blocks": {
    permission: "notes:read",
    handler: (params) => {
      const { editor } = openEditor();
      const { from = "current", count } = asObject(params);
      const start =
        from === "current" ? Math.max(0, editor.blockAtCursor()) : from;
      if (typeof start !== "number")
        throw new Error('from should be a block, or "current"');
      if (count !== undefined && typeof count !== "number")
        throw new Error("count should be a number");
      const all = editor.textBlocks().map(({ index, text }) => ({
        index,
        text,
      }));
      return blocksFrom(all, start, count);
    },
  },
  "editor.goTo": {
    permission: "notes:read",
    handler: (params) => {
      const { editor } = openEditor();
      editor.goToBlock(blockOf(params, editor.textBlocks().length));
      return true;
    },
  },
  "editor.mark": {
    permission: "notes:read",
    handler: (params) => {
      const { editor } = openEditor();
      const index = blockOf(params, editor.textBlocks().length);
      const { color = "yellow" } = asObject(params);
      if (!HIGHLIGHT_COLORS.includes(color as MarkColor))
        throw new Error(
          `color should be one of ${HIGHLIGHT_COLORS.join(", ")}`,
        );
      const byPlugin = marks.get(editor) ?? new Map<string, BlockMark[]>();
      const mine = (byPlugin.get(plugin.id) ?? []).filter(
        (m) => m.index !== index,
      );
      byPlugin.set(plugin.id, [
        ...mine,
        { index, color: cssOf(color as MarkColor) },
      ]);
      marks.set(editor, byPlugin);
      drawMarks(editor);
      return true;
    },
  },
  "editor.clearMarks": {
    permission: "notes:read",
    handler: () => {
      const { editor } = openEditor();
      marks.get(editor)?.delete(plugin.id);
      drawMarks(editor);
      return true;
    },
  },
});
