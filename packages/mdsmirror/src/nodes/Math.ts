import { NodeSpec, Node as ProsemirrorNode, NodeType, Schema } from "prosemirror-model";
import { Command } from "prosemirror-state";
import {
  chainCommands,
  deleteSelection,
  selectNodeBackward,
  joinBackward,
} from "prosemirror-commands";
import {
  mathPlugin,
  mathBackspaceCmd,
  insertMathCmd,
  makeInlineMathInputRule,
  REGEX_INLINE_MATH_DOLLARS, // new RegExp("\$(.+)\$"
} from "../math";
import Node from "./Node";
import { MarkdownSerializerState } from "../core/mdSerializer";
import mathRule from "../core/rules/math";

export default class Math extends Node {
  get name() {
    return "math_inline";
  }

  get schema(): NodeSpec {
    return {
      group: "inline math",
      content: "text*",
      inline: true,
      atom: true,
      parseDOM: [{tag: "math-inline"}],
      toDOM: () => ["math-inline", { class: "math-node" }, 0],
    };
  }

  get rulePlugins() {
    return [mathRule];
  }

  commands({ type }: { type: NodeType }) {
    return (): Command => (state, dispatch) => {
      dispatch?.(state.tr.replaceSelectionWith(type.create()).scrollIntoView());
      return true;
    };
  }

  inputRules({ schema }: { schema: Schema }) {
    return [
      makeInlineMathInputRule(
        REGEX_INLINE_MATH_DOLLARS,
        schema.nodes.math_inline
      ),
    ];
  }

  keys({ type }: { type: NodeType }) {
    return {
      "Mod-Space": insertMathCmd(type),
      Backspace: chainCommands(
        deleteSelection,
        mathBackspaceCmd,
        joinBackward,
        selectNodeBackward
      ),
    };
  }

  get plugins() {
    return [mathPlugin];
  }

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
    state.write("$");
    // do not escape backslashes like for \frac
    // state.renderInline(node);
    state.text(node.textContent, false);
    state.write("$");
  }

  parseMarkdown() {
    return {
      node: "math_inline",
      block: "math_inline",
      noCloseToken: true,
    };
  }
}
