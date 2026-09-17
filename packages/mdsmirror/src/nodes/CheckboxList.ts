import { wrappingInputRule } from "prosemirror-inputrules";
import {
  NodeSpec,
  NodeType,
  Schema,
  Node as ProsemirrorNode,
} from "prosemirror-model";
import toggleList from "../core/commands/toggleList";
import { MarkdownSerializerState } from "../core/mdSerializer";
import Node from "./Node";

export default class CheckboxList extends Node {
  get name() {
    return "checkbox_list";
  }

  get schema(): NodeSpec {
    return {
      group: "block",
      content: "checkbox_item+",
      parseDOM: [
        {
          tag: `[class="${this.name}"]`,
        },
      ],
      toDOM: () => ["ul", { class: this.name }, 0],
    };
  }

  keys({ type, schema }: { type: NodeType; schema: Schema }) {
    return {
      "Ctrl-7": toggleList(type, schema.nodes.checkbox_item),
    };
  }

  commands({ type, schema }: { type: NodeType; schema: Schema }) {
    return () => toggleList(type, schema.nodes.checkbox_item);
  }

  inputRules({ type }: { type: NodeType }) {
    return [wrappingInputRule(/^-?\s*(\[\])\s$/i, type)];
  }

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
    state.renderList(node, "  ", () => "- ");
  }

  parseMarkdown() {
    return { block: "checkbox_list" };
  }
}
