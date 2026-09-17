import { MarkSpec, MarkType } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import markInputRule from "../core/markInputRule";
import markRule from "../core/rules/mark";
import Anchor, { copyHashtag } from "../plugins/Anchor";
import Mark from "./Mark";

export default class Hashtag extends Mark {
  className = "hashtag-name";

  get name() {
    return "hashtag";
  }

  get schema(): MarkSpec {
    return {
      parseDOM: [{ tag: "span.hashtag-link" }],
      toDOM: () => ["span", { class: "hashtag-link" }],
    };
  }

  get rulePlugins() {
    return [markRule({ delim: "#", mark: "hashtag" })];
  }

  inputRules({ type }: { type: MarkType }) {
    return [markInputRule(/(?:#)([^#\s]+)(?:[#|\s])$/, type)];
  }

  toMarkdown() {
    return {
      open: "#",
      close: "#",
      mixable: true,
      expelEnclosingWhitespace: true,
    };
  }

  parseMarkdown() {
    return { mark: "hashtag" };
  }

  get plugins() {
    return [
      new Plugin({
        props: {
          handleClick: (view, pos, event: MouseEvent) => { 
            if (
              event.target instanceof HTMLSpanElement &&
              event.target.className.includes("hashtag-link")
            ) {
              // console.log("click hashtag", event.target.innerHTML)
              const clickHashTag = this.options.onClickHashtag;
              clickHashTag && clickHashTag(event.target.innerText, event);

              // copy hashtag's id
              const hashAnchor = event.target.parentNode?.previousSibling as HTMLElement;
              // console.log("target", hashAnchor);
              if (hashAnchor && hashAnchor.className.includes(this.className)) {
                copyHashtag(hashAnchor, this.editor.props.onCopyHash);
              }

              return true;
            }
            return false;
          },
        },
      }),
      Anchor(this.name, this.className, false)
    ];
  }
}
