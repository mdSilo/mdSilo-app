import {
  makeBlockMathInputRule,
  REGEX_BLOCK_MATH_DOLLARS, // new RegExp("\$\$\s+$", "i");
  insertMathCmd,
} from "../math";
import { NodeSpec, Node as ProsemirrorNode, NodeType } from "prosemirror-model";
import Node from "./Node";
import { MarkdownSerializerState } from "../core/mdSerializer";
import mathTexRule from "../core/rules/math_katex";

export default class MathDisplay extends Node {
  get name() {
    return "math_display";
  }

  get schema(): NodeSpec {
    return {
      group: "block math",
      content: "text*",
      atom: true,
      code: true,
      parseDOM: [
        {
          tag: "math-display",
        },
      ],
      toDOM: () => ["math-display", { class: "math-node" }, 0],
    };
  }

  get rulePlugins() {
    return [mathTexRule(undefined)];
  }

  commands({ type }: { type: NodeType }) {
    return () => insertMathCmd(type);
  }

  inputRules({ type }: { type: NodeType }) {
    return [makeBlockMathInputRule(REGEX_BLOCK_MATH_DOLLARS, type)];
  }


  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
    state.write("$$\n");
    state.text(node.textContent, false);
    state.ensureNewLine();
    state.write("$$");
    state.closeBlock(node);
  }

  parseMarkdown() {
    return {
      node: "math_display",
      block: "math_display",
      noCloseToken: true,
    };
  }
}
