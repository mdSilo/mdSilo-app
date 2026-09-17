import { Token } from "markdown-it";
import { toggleMark } from "prosemirror-commands";
import { InputRule } from "prosemirror-inputrules";
import { MarkdownSerializerState } from "prosemirror-markdown";
import { MarkSpec, MarkType, Node, Mark as PmMark } from "prosemirror-model";
import { EditorState, Plugin } from "prosemirror-state";
import { Dispatch } from "../types";
import Mark from "./Mark";

const LINK_INPUT_REGEX = /\[([^[]+)]\((\S+)\)$/;

function isPlainURL(
  link: PmMark,
  parent: Node,
  index: number,
  side: -1 | 1
) {
  if (link.attrs.title || !/^\w+:/.test(link.attrs.href)) {
    return false;
  }

  const content = parent.child(index + (side < 0 ? -1 : 0));
  if (
    !content.isText ||
    content.text !== link.attrs.href ||
    content.marks[content.marks.length - 1] !== link
  ) {
    return false;
  }

  if (index === (side < 0 ? 1 : parent.childCount - 1)) {
    return true;
  }

  const next = parent.child(index + (side < 0 ? -2 : 1));
  return !link.isInSet(next.marks);
}

export default class Link extends Mark {
  get name() {
    return "link";
  }

  get schema(): MarkSpec {
    return {
      attrs: {
        href: {
          default: "",
        },
      },
      inclusive: false,
      parseDOM: [
        {
          tag: "a[href]",
          getAttrs: (dom: HTMLElement) => ({
            href: dom.getAttribute("href"),
          }),
        },
      ],
      toDOM: (node) => [
        "a",
        {
          ...node.attrs,
          rel: "noopener noreferrer nofollow",
        },
        0,
      ],
    };
  }

  inputRules({ type }: { type: MarkType }) {
    return [
      new InputRule(LINK_INPUT_REGEX, (state, match, start, end) => {
        const [okay, alt, href] = match;
        const { tr } = state;

        if (okay) {
          tr.replaceWith(start, end, this.editor.schema.text(alt)).addMark(
            start,
            start + alt.length,
            type.create({ href })
          );
        }

        return tr;
      }),
    ];
  }

  commands({ type }: { type: MarkType }) {
    // https://github.com/ProseMirror/prosemirror-commands/blob/6fda4b50a13df239db73395c16eef5a1d2795609/src/commands.js#L524
    return ({ href } = { href: "" }) => toggleMark(type, { href });
  }

  keys({ type }: { type: MarkType }) {
    return {
      "Mod-k": (state: EditorState, dispatch: Dispatch) => {
        if (state.selection.empty) {
          this.options.onKeyboardShortcut();
          return true;
        }

        return toggleMark(type, { href: "" })(state, dispatch);
      },
    };
  }

  get plugins() {
    const plugin: Plugin = new Plugin({
      props: {
        decorations: (state) => plugin.getState(state),
        handleDOMEvents: {
          mouseover: (view, event: MouseEvent) => {
            if (
              event.target instanceof HTMLAnchorElement &&
              !event.target.className.includes("ProseMirror-widget") &&
              (!view.editable || (view.editable && !view.hasFocus()))
            ) {
              if (this.options.onHoverLink) {
                return this.options.onHoverLink(event);
              }
            }
            return false;
          },
          mousedown: (view, event: MouseEvent) => {
            if (!(event.target instanceof HTMLAnchorElement)) {
              return false;
            }

            if (event.target.matches(".component-attachment *")) {
              return false;
            }

            // clicking a link while editing should show the link toolbar,
            // clicking in read-only will navigate
            if (!view.editable || (view.editable && !view.hasFocus())) {
              return true;
            }

            return false;
          },
          click: (view, event) => {
            if (!(event.target instanceof HTMLAnchorElement)) {
              return false;
            }

            if (event.target.matches(".component-attachment *")) {
              return false;
            }

            return false;
          },
        },
      },
    });

    return [plugin];
  }

  toMarkdown() {
    return {
      open(
        _state: MarkdownSerializerState,
        mark: PmMark,
        parent: Node,
        index: number
      ) {
        return isPlainURL(mark, parent, index, 1) ? "<" : "[";
      },
      close(
        state: MarkdownSerializerState,
        mark: PmMark,
        parent: Node,
        index: number
      ) {
        return isPlainURL(mark, parent, index, -1)
          ? ">"
          : "](" +
              state.esc(mark.attrs.href) +
              (mark.attrs.title ? " " + quote(mark.attrs.title) : "") +
              ")";
      },
    };
  }

  parseMarkdown() {
    return {
      mark: "link",
      getAttrs: (tok: Token) => ({
        href: tok.attrGet("href"),
        title: tok.attrGet("title") || null,
      }),
    };
  }
}

function quote(str: string) {
  const wrap =
    str.indexOf('"') === -1 ? '""' : str.indexOf("'") === -1 ? "''" : "()";
  return wrap[0] + str + wrap[1];
}