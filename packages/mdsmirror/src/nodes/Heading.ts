import { textblockTypeInputRule } from "prosemirror-inputrules";
import { Node as PmNode, NodeSpec, NodeType, Schema } from "prosemirror-model";
import { Command, Selection } from "prosemirror-state";
import backspaceToParagraph from "../core/commands/backspaceToParagraph";
import splitHeading from "../core/commands/splitHeading";
import toggleBlockType from "../core/commands/toggleBlockType";
import { MarkdownSerializerState } from "../core/mdSerializer";
import Anchor, { copyAnchor } from "../plugins/Anchor";
import Node from "./Node";

export default class Heading extends Node {
  className = "heading-name";

  get name() {
    return "heading";
  }

  get defaultOptions() {
    return {
      levels: [1, 2, 3, 4],
      collapsed: undefined,
    };
  }

  get schema(): NodeSpec {
    return {
      attrs: {
        level: {
          default: 1,
        },
        collapsed: {
          default: undefined,
        },
      },
      content: "inline*",
      group: "block",
      defining: true,
      draggable: false,
      parseDOM: this.options.levels.map((level: number) => ({
        tag: `h${level}`,
        attrs: { level },
        contentElement: ".heading-content",
      })),
      toDOM: (node) => {
        const anchor = document.createElement("button");
        anchor.innerText = "#";
        anchor.type = "button";
        anchor.className = "heading-anchor";
        anchor.addEventListener("click", (event) => this.handleCopyLink(event));

        const fold = document.createElement("button");
        fold.innerText = "";
        fold.innerHTML = '>';
        fold.type = "button";
        fold.className = `heading-fold ${
          node.attrs.collapsed ? "collapsed" : ""
        }`;
        fold.addEventListener("mousedown", (event) =>
          this.handleFoldContent(event)
        );

        return [
          `h${node.attrs.level + (this.options.offset || 0)}`,
          [
            "span",
            {
              contentEditable: "false",
              class: `heading-actions ${
                node.attrs.collapsed ? "collapsed" : ""
              }`,
            },
            anchor,
            fold,
          ],
          [
            "span",
            {
              class: "heading-content",
            },
            0,
          ],
        ];
      },
    };
  }

  get plugins() {
    return [Anchor(this.name, this.className)];
  }

  inputRules({ type }: { type: NodeType }) {
    return this.options.levels.map((level: number) =>
      textblockTypeInputRule(new RegExp(`^(#{1,${level}})\\s$`), type, () => ({
        level,
      }))
    );
  }

  toMarkdown(state: MarkdownSerializerState, node: PmNode) {
    state.write(state.repeat("#", node.attrs.level) + " ");
    state.renderInline(node);
    state.closeBlock(node);
  }

  parseMarkdown() {
    return {
      block: "heading",
      getAttrs: (token: Record<string, any>) => ({
        level: +token.tag.slice(1),
      }),
    };
  }

  keys({ type, schema }: { type: NodeType; schema: Schema }) {
    const options = this.options.levels.reduce(
      (items: Record<string, Command>, level: number) => ({
        ...items,
        ...{
          [`Ctrl-${level}`]: toggleBlockType(
            type,
            schema.nodes.paragraph,
            { level }
          ),
        },
      }),
      {}
    );

    return {
      ...options,
      Backspace: backspaceToParagraph(type),
      Enter: splitHeading(type),
    };
  }

  commands({ type, schema }: { type: NodeType; schema: Schema }) {
    return (attrs: Record<string, any>) => {
      return toggleBlockType(type, schema.nodes.paragraph, attrs);
    };
  }

  handleFoldContent = (event: MouseEvent) => {
    event.preventDefault();
    if (!(event.currentTarget instanceof HTMLButtonElement)) {
      return;
    }

    const { view } = this.editor;
    const hadFocus = view.hasFocus();
    const { tr } = view.state;
    const { top, left } = event.currentTarget.getBoundingClientRect();
    const result = view.posAtCoords({ top, left });

    if (result) {
      const node = view.state.doc.nodeAt(result.inside);

      if (node) {
        const endOfHeadingPos = result.inside + node.nodeSize;
        const $pos = view.state.doc.resolve(endOfHeadingPos);
        const collapsed = !node.attrs.collapsed;

        if (collapsed && view.state.selection.to > endOfHeadingPos) {
          // move selection to the end of the collapsed heading
          tr.setSelection(Selection.near($pos, -1));
        }

        const transaction = tr.setNodeMarkup(result.inside, undefined, {
          ...node.attrs,
          collapsed,
        });

        view.dispatch(transaction);

        if (hadFocus) {
          view.focus();
        }
      }
    }
  };

  handleCopyLink = (event: MouseEvent) => {
    copyAnchor(event, this.className, this.editor.props.onCopyHash);
  };  
}
