import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import Extension from "../core/Extension";

export default class Placeholder extends Extension {
  get name() {
    return "empty-placeholder";
  }

  get defaultOptions() {
    return {
      emptyNodeClass: "placeholder",
      placeholder: "",
    };
  }

  get plugins() {
    return [
      new Plugin({
        props: {
          // called on every view update: check the doc in constant time
          decorations: (state) => {
            const { doc } = state;
            const first = doc.firstChild;
            // completely empty: a single empty paragraph
            if (
              doc.childCount !== 1 ||
              first?.type.name !== "paragraph" ||
              first.content.size !== 0
            ) {
              return DecorationSet.empty;
            }

            return DecorationSet.create(doc, [
              Decoration.node(0, first.nodeSize, {
                class: this.options.emptyNodeClass,
                "data-empty-text": this.options.placeholder,
              }),
            ]);
          },
        },
      }),
    ];
  }
}
