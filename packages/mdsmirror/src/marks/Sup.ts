import { toggleMark } from "prosemirror-commands";
import { InputRule } from "prosemirror-inputrules";
import { MarkSpec, MarkType } from "prosemirror-model";
import { Command } from "prosemirror-state";
import markInputRule from "../core/markInputRule";
import markRule from "../core/rules/mark";
import Mark from "./Mark";

export default class Sup extends Mark {
  get name() {
    return "sup";
  }

  get schema(): MarkSpec {
    return {
      parseDOM: [{ tag: "sup" }],
      toDOM: () => ["sup"],
    };
  }

  get rulePlugins() {
    return [markRule({ delim: "^", mark: "sup" })];
  }

  inputRules({ type }: { type: MarkType }): InputRule[] {
    return [markInputRule(/(?:^|[^^])(\^([^^\s]+)\^)$/, type)];
  }

  keys({ type }: { type: MarkType }): Record<string, Command> {
    return {
      "Alt-p": toggleMark(type),
    };
  }

  toMarkdown() {
    return {
      open: "^",
      close: "^",
      mixable: true,
      expelEnclosingWhitespace: true,
    };
  }

  parseMarkdown() {
    return { mark: "sup" };
  }
}
