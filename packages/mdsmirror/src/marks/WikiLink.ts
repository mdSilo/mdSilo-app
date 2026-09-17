import { InputRule } from "prosemirror-inputrules";
import {MarkSpec,MarkType,} from "prosemirror-model";
import wikiLinkRule from "../core/rules/wikilink";
import Mark from "./Mark";

const WIKILINK_INPUT_REGEX = /\[\[([^[|\]\n]+)(\|([^[|\]\n]+))?\]\]$/;

export default class WikiLink extends Mark {
  get name() {
    return "wikilink";
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
          tag: "a[wiki-link]",
          getAttrs: (dom: HTMLElement) => ({
            href: dom.getAttribute("wiki-link"),
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

  // Note: 
  // rulePlugins used to parse Markdown `[[wiki link]]` to link in the linkifying way
  // inputRules used in WYSIWYG mode, but transfer `[[]]` to `[]()` to Markdown  
  // wikilink is the special type of link that the href is not url but plain_text_title

  get rulePlugins() {
    return [wikiLinkRule];
  }

  inputRules({ type }: { type: MarkType }) {
    return [
      new InputRule(WIKILINK_INPUT_REGEX, (state, match, start, end) => {
        const [okay, href, _demi, _alt] = match;
        const { tr } = state;

        if (okay) {
          const hrefLink = href.trim(); //.replace(/\s/g, '_');
          tr.replaceWith(start, end, this.editor.schema.text(href)).addMark(
            start,
            start + href.length,
            type.create({ href: hrefLink })
          );
        }
        // create new use href as title if not existing
        this.options.onCreateLink && this.options.onCreateLink(href.trim())

        return tr;
      }),
    ];
  }

  toMarkdown() {
    return {
      open: "[[",
      close: "]]",
      // // workaround the issue: linkify not work on Tauri webview
      // // avoid write `[[]]` to markdown, but cannot parse from markdown '[[]]'
      // open: "[",
      // close(
      //   state: MarkdownSerializerState,
      //   mark: ProsemirrorMark,
      // ) {
      //   return "](" + state.esc(mark.attrs.href) + ")";
      // },
      mixable: true,
      expelEnclosingWhitespace: true,
    };
  }

  parseMarkdown() {
    return { mark: "wikilink" };
  }
}
