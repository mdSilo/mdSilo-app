import { toggleMark } from "prosemirror-commands";
import { InputRule } from "prosemirror-inputrules";
import { MarkSpec, MarkType } from "prosemirror-model";
import { Command } from "prosemirror-state";
import markInputRule from "../core/markInputRule";
import subRule from "../core/rules/sub";
import Mark from "./Mark";

export default class Sub extends Mark {
  get name() {
    return "sub";
  }

  get schema(): MarkSpec {
    return {
      // typing at its end is not in it, see editorMarks.test.ts
      inclusive: false,
      parseDOM: [{ tag: "sub" }],
      toDOM: () => ["sub"],
    };
  }

  get rulePlugins() {
    return [subRule];
  }

  inputRules({ type }: { type: MarkType }): InputRule[] {
    return [markInputRule(/(?:^|[^~])(~([^~\s]+)~)$/, type)];
  }

  keys({ type }: { type: MarkType }): Record<string, Command> {
    return {
      "Alt-b": toggleMark(type),
    };
  }

  toMarkdown() {
    return {
      open: "~",
      close: "~",
      mixable: true,
      expelEnclosingWhitespace: true,
    };
  }

  parseMarkdown() {
    return { mark: "sub" };
  }
}
