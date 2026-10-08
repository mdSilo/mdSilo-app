import { NodeSpec, NodeType, Node as PmNode, Schema } from "prosemirror-model";
import toggleBlockType from "../core/commands/toggleBlockType";
import { MarkdownSerializerState } from "../core/mdSerializer";
import { commentBlockRule } from "../core/rules/comment";
import Node from "./Node";

/**
 * A comment `<!-- ... -->` on its own lines, single or multi line.
 * It is shown in the editor, but not in the rendered HTML.
 */
export default class Comment extends Node {
  get name() {
    return "comment";
  }

  get schema(): NodeSpec {
    return {
      content: "text*",
      marks: "",
      group: "block",
      code: true,
      defining: true,
      parseDOM: [{ tag: "div.comment-block", preserveWhitespace: "full" }],
      toDOM: () => ["div", { class: "comment-block", spellcheck: "false" }, 0],
    };
  }

  get rulePlugins() {
    return [commentBlockRule];
  }

  commands({ type, schema }: { type: NodeType; schema: Schema }) {
    return () => toggleBlockType(type, schema.nodes.paragraph);
  }

  toMarkdown(state: MarkdownSerializerState, node: PmNode) {
    // `-->` would end the comment
    const text = node.textContent.replace(/-->/g, "-- >");
    state.text(`<!--${text}-->`, false);
    state.closeBlock(node);
  }

  parseMarkdown() {
    return { block: "comment", noCloseToken: true };
  }
}
