import { Node as ProsemirrorNode } from "prosemirror-model";
import { EditorState, Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import Extension from "../core/Extension";

/**
 * Marks over blocks of text, given by the app (e.g. for a plugin): a color
 * behind a paragraph, a heading, an item... Not in the document: they
 * follow the edits, and go with the editor.
 */
export type BlockMark = {
  /** the block, by its place among the blocks of text (see textBlocksOf) */
  index: number;
  /** a CSS color */
  color: string;
};

/** A block of text of a document: its place, its node, where it starts */
export type TextBlock = { index: number; node: ProsemirrorNode; pos: number };

/** The blocks of text of a document in order: those with text in them, as paragraphs */
export function textBlocksOf(doc: ProsemirrorNode): TextBlock[] {
  const blocks: TextBlock[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    blocks.push({ index: blocks.length, node, pos });
    return false;
  });
  return blocks;
}

export const blockMarksKey = new PluginKey<DecorationSet>("blockMarks");

function decorationsOf(doc: ProsemirrorNode, marks: BlockMark[]) {
  const blocks = textBlocksOf(doc);
  return DecorationSet.create(
    doc,
    marks.flatMap(({ index, color }) => {
      const block = blocks[index];
      if (!block) return [];
      return [
        Decoration.node(block.pos, block.pos + block.node.nodeSize, {
          class: "block-mark",
          // a margin of the color, the text where it was
          style: `background-color: ${color}; box-shadow: 0 0 0 6px ${color}; border-radius: 2px;`,
        }),
      ];
    })
  );
}

/** The transaction setting the marks, all of them */
export const setBlockMarks = (state: EditorState, marks: BlockMark[]) =>
  state.tr.setMeta(blockMarksKey, marks);

export default class BlockMarks extends Extension {
  get name() {
    return "block-marks";
  }

  get plugins() {
    return [
      new Plugin<DecorationSet>({
        key: blockMarksKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, set) => {
            const marks = tr.getMeta(blockMarksKey) as BlockMark[] | undefined;
            if (marks) return decorationsOf(tr.doc, marks);
            return tr.docChanged ? set.map(tr.mapping, tr.doc) : set;
          },
        },
        props: {
          decorations: (state) => blockMarksKey.getState(state),
        },
      }),
    ];
  }
}
