import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import Extension from "../core/Extension";
import findCollapsedNodes from "../core/queries/findCollapsedNodes";

export default class Folding extends Extension {
  get name() {
    return "folding";
  }

  get plugins() {
    return [
      new Plugin({
        view: (view) => {
          view.dispatch(view.state.tr.setMeta("folding", { loaded: true }));
          return {};
        },
        props: {
          decorations: (state) => {
            const { doc } = state;
            const decorations: Decoration[] = findCollapsedNodes(doc).map(
              (block) =>
                Decoration.node(block.pos, block.pos + block.node.nodeSize, {
                  class: "folded-content",
                })
            );

            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  }
}
