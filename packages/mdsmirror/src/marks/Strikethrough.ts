import { toggleMark } from "prosemirror-commands";
import { MarkSpec, MarkType } from "prosemirror-model";
import markInputRule from "../core/markInputRule";
import Mark from "./Mark";

export default class Strikethrough extends Mark {
  get name() {
    return "strikethrough";
  }

  get schema(): MarkSpec {
    return {
      // typing at its end is not in it, see editorMarks.test.ts
      inclusive: false,
      parseDOM: [
        {
          tag: "s",
        },
        {
          tag: "del",
        },
        {
          tag: "strike",
        },
      ],
      toDOM: () => ["del", 0],
    };
  }

  keys({ type }: { type: MarkType }) {
    return {
      "Mod-d": toggleMark(type),
    };
  }

  inputRules({ type }: { type: MarkType }) {
    return [markInputRule(/(?:~~)([^~]+)(?:~~)$/, type)];
  }

  toMarkdown() {
    return {
      open: "~~",
      close: "~~",
      mixable: true,
      expelEnclosingWhitespace: true,
    };
  }

  get markdownToken() {
    return "s";
  }

  parseMarkdown() {
    return { mark: "strikethrough" };
  }
}
