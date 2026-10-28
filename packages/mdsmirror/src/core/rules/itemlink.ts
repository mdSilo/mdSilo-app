import type { MarkdownIt, StateInline } from "markdown-it";

// {{title}} or {{title|alias}}
const ITEMLINK_REGEX = /^\{\{([^{|}\n]+)(?:\|([^{|}\n]+))?\}\}/;
// backslash escapes, e.g. `{{a\*b}}` written by the serializer
const ESCAPED_CHAR_REGEX = /\\([!-/:-@[-`{-~])/g;

const unescape = (str: string) => str.replace(ESCAPED_CHAR_REGEX, "$1");

/** The href of an item link: a book by its title, `book:<title>`. */
export const itemHref = (title: string) => `book:${title}`;

/**
 * Recognize item links (`{{book title}}`) as links to the book of the title,
 * the way `[[note title]]` links a note. Typing `{{` in the editor searches
 * the items and inserts a link to the one picked instead.
 */
export default function itemLinkRule(md: MarkdownIt) {
  function tokenize(state: StateInline, silent: boolean) {
    const start = state.pos;
    if (
      state.src.charCodeAt(start) !== 0x7b /* { */ ||
      state.src.charCodeAt(start + 1) !== 0x7b /* { */
    ) {
      return false;
    }

    const match = ITEMLINK_REGEX.exec(state.src.slice(start));
    if (!match) {
      return false;
    }

    const target = unescape(match[1]).trim();
    const text = unescape(match[2] || match[1]).trim();
    if (!target || !text) {
      return false;
    }

    const href = md.normalizeLink(itemHref(target));
    if (!md.validateLink(href)) {
      return false;
    }

    if (!silent) {
      const open = state.push("link_open", "a", 1);
      open.attrs = [["href", href]];
      open.markup = "itemlink";
      open.info = "auto";

      const token = state.push("text", "", 0);
      token.content = text;

      const close = state.push("link_close", "a", -1);
      close.markup = "itemlink";
      close.info = "auto";
    }

    state.pos += match[0].length;
    return true;
  }

  md.inline.ruler.before("link", "itemlink", tokenize);
}
