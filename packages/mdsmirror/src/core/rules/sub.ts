// Subscript: H~2~O
// Adapted from:
// https://github.com/markdown-it/markdown-it-sub/blob/master/index.mjs
//
// It scans for the closing `~` itself instead of pushing delimiters,
// because markdown-it's strikethrough turns every `~` delimiter into <s>.
// `~~text~~` is left to strikethrough, which runs first.

import type { MarkdownIt, StateInline } from "markdown-it";

const TILDE = 0x7e;
// unescaped whitespace is not allowed inside, as in Pandoc
const UNESCAPED_SPACE = /(^|[^\\])(\\\\)*\s/;
const ESCAPED = /\\([ \\!"#$%&'()*+,./:;<=>?@[\]^_`{|}~-])/g;

function subscript(state: StateInline, silent: boolean) {
  const max = state.posMax;
  const start = state.pos;

  if (state.src.charCodeAt(start) !== TILDE) return false;
  if (silent) return false; // don't run any pairs in validation mode
  if (start + 2 >= max) return false;
  if (state.src.charCodeAt(start + 1) === TILDE) return false;

  state.pos = start + 1;
  let found = false;
  while (state.pos < max) {
    if (state.src.charCodeAt(state.pos) === TILDE) {
      found = true;
      break;
    }
    state.md.inline.skipToken(state);
  }

  if (!found || start + 1 === state.pos) {
    state.pos = start;
    return false;
  }

  const content = state.src.slice(start + 1, state.pos);
  if (UNESCAPED_SPACE.test(content)) {
    state.pos = start;
    return false;
  }

  // found!
  state.posMax = state.pos;
  state.pos = start + 1;

  const open = state.push("sub_open", "sub", 1);
  open.markup = "~";

  const text = state.push("text", "", 0);
  text.content = content.replace(ESCAPED, "$1");

  const close = state.push("sub_close", "sub", -1);
  close.markup = "~";

  state.pos = state.posMax + 1;
  state.posMax = max;
  return true;
}

export default function subRule(md: MarkdownIt) {
  md.inline.ruler.after("emphasis", "sub", subscript);
}
