import MarkdownIt, { StateInline } from "markdown-it";

// [[target]] or [[target|alias]]
const WIKILINK_REGEX = /^\[\[([^[|\]\n]+)(?:\|([^[|\]\n]+))?\]\]/;
// backslash escapes, e.g. `[[a\*b]]` written by the serializer
const ESCAPED_CHAR_REGEX = /\\([!-/:-@[-`{-~])/g;

const unescape = (str: string) => str.replace(ESCAPED_CHAR_REGEX, "$1");

/**
 * Recognize wiki links (`[[wiki text]]`) as links.
 *
 * It is an inline rule running before `link` and `emphasis`, so the raw
 * title is matched as a whole: titles such as `_draft_` or `__init__` are
 * not split by emphasis before the link can be recognized.
 */
export default function wikiLinkRule(md: MarkdownIt) {
  function tokenize(state: StateInline, silent: boolean) {
    const start = state.pos;
    if (
      state.src.charCodeAt(start) !== 0x5b /* [ */ ||
      state.src.charCodeAt(start + 1) !== 0x5b /* [ */
    ) {
      return false;
    }

    const match = WIKILINK_REGEX.exec(state.src.slice(start));
    if (!match) {
      return false;
    }

    const target = unescape(match[1]).trim();
    const text = unescape(match[2] || match[1]).trim();
    if (!target || !text) {
      return false;
    }

    const href = md.normalizeLink(target);
    if (!md.validateLink(href)) {
      return false;
    }

    if (!silent) {
      const open = state.push("link_open", "a", 1);
      open.attrs = [["href", href]];
      open.markup = "wikilink";
      open.info = "auto";

      const token = state.push("text", "", 0);
      token.content = text;

      const close = state.push("link_close", "a", -1);
      close.markup = "wikilink";
      close.info = "auto";
    }

    state.pos += match[0].length;
    return true;
  }

  md.inline.ruler.before("link", "wikilink", tokenize);
}
