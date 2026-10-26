import { Node as PmNode } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import Extension from "../core/Extension";
import findCollapsedNodes from "../core/queries/findCollapsedNodes";

const foldedDecorations = (doc: PmNode) =>
  DecorationSet.create(
    doc,
    findCollapsedNodes(doc).map((block) =>
      Decoration.node(block.pos, block.pos + block.node.nodeSize, {
        class: "folded-content",
      })
    )
  );

export default class Folding extends Extension {
  get name() {
    return "folding";
  }

  get plugins() {
    const plugin: Plugin<DecorationSet> = new Plugin({
      // the folded content only changes with the doc (heading collapsed attr)
      state: {
        init: (_, { doc }) => foldedDecorations(doc),
        apply: (tr, set) => (tr.docChanged ? foldedDecorations(tr.doc) : set),
      },
      props: {
        decorations: (state) => plugin.getState(state),
      },
    });
    return [plugin];
  }
}
