import { Token } from "markdown-it";
import { wrappingInputRule } from "prosemirror-inputrules";
import {
  Schema,
  NodeType,
  NodeSpec,
  Node as ProsemirrorModel,
} from "prosemirror-model";
import toggleList from "../core/commands/toggleList";
import { MarkdownSerializerState } from "../core/mdSerializer";
import Node from "./Node";

export default class BulletList extends Node {
  get name() {
    return "bullet_list";
  }

  get schema(): NodeSpec {
    return {
      attrs: {
        // the list marker: `-`, `*` or `+`, keep it on save
        bullet: {
          default: "-",
        },
      },
      content: "list_item+",
      group: "block",
      parseDOM: [{ tag: "ul" }],
      toDOM: () => ["ul", 0],
    };
  }

  commands({ type, schema }: { type: NodeType; schema: Schema }) {
    return () => toggleList(type, schema.nodes.list_item);
  }

  keys({ type, schema }: { type: NodeType; schema: Schema }) {
    return {
      "Ctrl-8": toggleList(type, schema.nodes.list_item),
    };
  }

  inputRules({ type }: { type: NodeType }) {
    return [
      wrappingInputRule(/^\s*([-+*])\s$/, type, (match) => ({
        bullet: match[1],
      })),
    ];
  }

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorModel) {
    state.renderList(node, "  ", () => (node.attrs.bullet || "-") + " ");
  }

  parseMarkdown() {
    return {
      block: "bullet_list",
      getAttrs: (tok: Token) => ({
        bullet: ["-", "*", "+"].includes(tok.markup) ? tok.markup : "-",
      }),
    };
  }
}
