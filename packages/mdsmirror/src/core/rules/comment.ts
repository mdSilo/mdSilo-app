import MarkdownIt, { StateBlock, StateInline } from "markdown-it";

const OPEN = "<!--";
const CLOSE = "-->";

/**
 * Parse the lines of a comment `<!-- ... -->`, single or multi line, to a
 * `comment` token, its content is the text between `<!--` and `-->`.
 * A comment in a paragraph is left to the inline rule.
 */
export function commentBlockRule(md: MarkdownIt) {
  md.block.ruler.before(
    "html_block",
    "comment",
    (state: StateBlock, startLine, endLine, silent) => {
      // indented code
      if (state.sCount[startLine] - state.blkIndent >= 4) {
        return false;
      }
      const pos = state.bMarks[startLine] + state.tShift[startLine];
      if (!state.src.startsWith(OPEN, pos)) {
        return false;
      }
      const end = state.src.indexOf(CLOSE, pos + OPEN.length);
      if (end < 0 || end >= state.eMarks[endLine - 1]) {
        return false;
      }
      let line = startLine;
      while (state.eMarks[line] < end + CLOSE.length) {
        line++;
      }
      // the comment must be the whole of its lines
      if (state.src.slice(end + CLOSE.length, state.eMarks[line]).trim()) {
        return false;
      }
      if (silent) {
        return true;
      }

      // the lines w/o the indent or the prefix of the container, e.g. `> `
      const text = state
        .getLines(startLine, line + 1, state.blkIndent, false)
        .trim();
      const token = state.push("comment", "", 0);
      // end with a newline like a code block, which the parser drops
      token.content = text.slice(OPEN.length, -CLOSE.length) + "\n";
      token.markup = OPEN;
      token.map = [startLine, line + 1];
      state.line = line + 1;
      return true;
    }
  );

  md.renderer.rules.comment = (tokens, idx) =>
    `<!--${tokens[idx].content.slice(0, -1)}-->\n`;
}

/**
 * Parse a comment `<!-- ... -->` in a paragraph to a `comment_inline` token
 */
export function commentInlineRule(md: MarkdownIt) {
  md.inline.ruler.before(
    "autolink",
    "comment_inline",
    (state: StateInline, silent) => {
      const pos = state.pos;
      if (!state.src.startsWith(OPEN, pos)) {
        return false;
      }
      const end = state.src.indexOf(CLOSE, pos + OPEN.length);
      if (end < 0 || end + CLOSE.length > state.posMax) {
        return false;
      }
      if (!silent) {
        const token = state.push("comment_inline", "", 0);
        token.content = state.src.slice(pos + OPEN.length, end);
        token.markup = OPEN;
      }
      state.pos = end + CLOSE.length;
      return true;
    }
  );

  md.renderer.rules.comment_inline = (tokens, idx) =>
    `<!--${tokens[idx].content}-->`;
}
