import { MarkSpec, MarkType } from "prosemirror-model";
import markInputRule from "../core/markInputRule";
import { commentInlineRule } from "../core/rules/comment";
import Mark from "./Mark";

/**
 * A comment `<!-- ... -->` in a paragraph, can be multi line.
 * It is shown in the editor, but not in the rendered HTML.
 */
export default class CommentInline extends Mark {
  get name() {
    return "comment_inline";
  }

  get schema(): MarkSpec {
    return {
      excludes: "_",
      inclusive: false,
      parseDOM: [{ tag: "span.comment-inline", preserveWhitespace: true }],
      toDOM: () => ["span", { class: "comment-inline", spellcheck: "false" }],
    };
  }

  get rulePlugins() {
    return [commentInlineRule];
  }

  inputRules({ type }: { type: MarkType }) {
    return [markInputRule(/(<!--((?:(?!-->).)+)-->)$/, type)];
  }

  toMarkdown() {
    return {
      open: "<!--",
      close: "-->",
      // the text is kept as is
      escape: false,
    };
  }

  parseMarkdown() {
    return { mark: "comment_inline", noCloseToken: true };
  }
}
