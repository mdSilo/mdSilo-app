import { Node as ProsemirrorNode, NodeSpec } from "prosemirror-model";
import { MarkdownSerializerState, textAround } from "../core/mdSerializer";
import Node from "./Node";

export default class Text extends Node {
  get name() {
    return "text";
  }

  get schema(): NodeSpec {
    return {
      group: "inline",
    };
  }

  toMarkdown(
    state: MarkdownSerializerState,
    node: ProsemirrorNode,
    parent?: ProsemirrorNode,
    index?: number
  ) {
    state.text(node.text || "", undefined, textAround(parent, index));
  }
}
