import MarkdownIt from "markdown-it";
import { MarkSpec, Node } from "prosemirror-model";
import { MarkdownSerializerState } from "../core/mdSerializer";
import Mark from "./Mark";

/**
 * Keep the backslash escapes of the Markdown source, e.g. `\@ref` used by
 * bookdown, which would be lost on save as `@` needs no escape otherwise.
 * The escaped chars are shown as is, without the backslash, like `\*`.
 */
export default class Escape extends Mark {
  get name() {
    return "escape";
  }

  get schema(): MarkSpec {
    return {
      inclusive: false,
      parseDOM: [{ tag: "span.md-escape" }],
      toDOM: () => ["span", { class: "md-escape" }, 0],
    };
  }

  get rulePlugins() {
    return [escapeRule];
  }

  toMarkdown() {
    return {
      // add the backslash only if the text is not escaped anyway
      open(
        state: MarkdownSerializerState,
        _mark: unknown,
        parent: Node,
        index: number
      ) {
        const text = parent.child(index).text || "";
        const startOfLine = state.atBlank() || !!state.closed;
        return state.esc(text, startOfLine).startsWith("\\") ? "" : "\\";
      },
      close: "",
    };
  }

  parseMarkdown() {
    return { mark: "escape", noCloseToken: true };
  }
}

function escapeRule(md: MarkdownIt) {
  // run before the text is joined, and before the `breaks` rule which
  // takes a text `\` as a break
  md.core.ruler.after("inline", "escape", (state) => {
    for (const token of state.tokens) {
      if (token.type !== "inline" || !token.children) {
        continue;
      }
      for (const child of token.children) {
        // an escaped punctuation, e.g. `\@`, but not `\ ` or `\e`
        if (
          child.type === "text_special" &&
          child.info === "escape" &&
          child.content !== child.markup
        ) {
          child.type = "escape";
        }
      }
    }
    return false;
  });

  md.renderer.rules.escape = (tokens, idx) =>
    md.utils.escapeHtml(tokens[idx].content);
}
