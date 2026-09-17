import { InputRule } from "prosemirror-inputrules";
import { ParseSpec } from "prosemirror-markdown";
import { Command } from "prosemirror-state";
import { Node as PmNode,NodeSpec,NodeType,Schema } from "prosemirror-model";
import Extension, { CommandFactory } from "../core/Extension";
import { MarkdownSerializerState } from "../core/mdSerializer";

export default abstract class Node extends Extension {
  get type() {
    return "node";
  }

  get schema(): NodeSpec {
    return {};
  }

  get markdownToken(): string {
    return "";
  }

  inputRules(_options: { type: NodeType; schema: Schema }): InputRule[] {
    return [];
  }

  keys(_options: { type: NodeType; schema: Schema }): Record<string, Command> {
    return {};
  }

  commands(_options: {
    type: NodeType;
    schema: Schema;
  }): Record<string, CommandFactory> | CommandFactory {
    return {};
  }

  toMarkdown(state: MarkdownSerializerState, node: PmNode): void {
    console.error("toMarkdown not implemented", state, node);
  }

  parseMarkdown(): ParseSpec | void {
    return undefined;
  }
}
