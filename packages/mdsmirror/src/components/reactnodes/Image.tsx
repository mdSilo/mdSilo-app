import { Token } from "markdown-it";
import { InputRule } from "prosemirror-inputrules";
import { Node as ProsemirrorNode, NodeSpec, NodeType } from "prosemirror-model";
import { TextSelection, NodeSelection, EditorState } from "prosemirror-state";
import * as React from "react";
import styled from "styled-components";
import { MarkdownSerializerState } from "../../core/mdSerializer";
import getDataTransferFiles from "../../core/queries/getDataTransferFiles";
import insertFiles from "../../core/commands/insertFiles";
import attachFiles from "../../core/commands/attachFiles";
import uploadPlaceholderPlugin from "../../plugins/uploadPlaceholder";
import uploadPlugin from "../../plugins/upload";
import { ComponentProps } from "../types";
import { Dispatch } from "../../types";
import Node from "../../nodes/Node";

/**
 * Matches following attributes in Markdown-typed image: [, alt, src, class]
 *
 * Example:
 * ![Lorem](image.jpg) -> [, "Lorem", "image.jpg"]
 * ![](image.jpg "class") -> [, "", "image.jpg", "small"]
 * ![Lorem](image.jpg "class") -> [, "Lorem", "image.jpg", "small"]
 */
const IMAGE_INPUT_REGEX = /!\[(?<alt>[^\][]*?)]\((?<filename>[^\][]*?)(?=“|\))“?(?<layoutclass>[^\][”]+)?”?\)$/;

const IMAGE_CLASSES = ["right-50", "left-50"];

const getLayoutAndTitle = (tokenTitle: string | null) => {
  if (!tokenTitle) {
    return {};
  }
  if (IMAGE_CLASSES.includes(tokenTitle)) {
    return {
      layoutClass: tokenTitle,
    };
  } else {
    return {
      title: tokenTitle,
    };
  }
};

export default class Image extends Node {
  get name() {
    return "image";
  }

  get schema(): NodeSpec {
    return {
      inline: true,
      attrs: {
        src: {},
        alt: {
          default: null,
        },
        layoutClass: {
          default: null,
        },
        title: {
          default: null,
        },
      },
      content: "text*",
      marks: "",
      group: "inline",
      selectable: true,
      draggable: true,
      parseDOM: [
        {
          tag: "div[class~=image]",
          getAttrs: (dom: HTMLDivElement) => {
            const img = dom.getElementsByTagName("img")[0];
            const className = dom.className;
            const layoutClassMatched =
              className && className.match(/image-(.*)$/);
            const layoutClass = layoutClassMatched
              ? layoutClassMatched[1]
              : null;
            return {
              src: img?.getAttribute("src"),
              alt: img?.getAttribute("alt"),
              title: img?.getAttribute("title"),
              layoutClass: layoutClass,
            };
          },
        },
        {
          tag: "img",
          getAttrs: (dom: HTMLImageElement) => {
            return {
              src: dom.getAttribute("src"),
              alt: dom.getAttribute("alt"),
              title: dom.getAttribute("title"),
            };
          },
        },
      ],
      toDOM: (node) => {
        const className = node.attrs.layoutClass
          ? `image image-${node.attrs.layoutClass}`
          : "image";
        return [
          "div",
          {
            class: className,
          },
          ["img", { ...node.attrs, contentEditable: "false" }],
          ["p", { class: "caption" }, 0],
        ];
      },
    };
  }

  handleKeyDown = ({
    node,
    getPos,
  }: {
    node: ProsemirrorNode;
    getPos: () => number;
  }) => (event: React.KeyboardEvent<HTMLSpanElement>) => {
    // Pressing Enter in the caption field should move the cursor/selection
    // below the image
    if (event.key === "Enter") {
      event.preventDefault();

      const { view } = this.editor;
      const $pos = view.state.doc.resolve(getPos() + node.nodeSize);
      view.dispatch(
        view.state.tr.setSelection(new TextSelection($pos)).split($pos.pos)
      );
      view.focus();
      return;
    }

    // Pressing Backspace in an an empty caption field should remove the entire
    // image, leaving an empty paragraph
    if (event.key === "Backspace" && event.currentTarget.innerText === "") {
      const { view } = this.editor;
      const $pos = view.state.doc.resolve(getPos());
      const tr = view.state.tr.setSelection(new NodeSelection($pos));
      view.dispatch(tr.deleteSelection());
      view.focus();
      return;
    }
  };

  handleBlur = ({
    node,
    getPos,
  }: {
    node: ProsemirrorNode;
    getPos: () => number;
  }) => (event: React.FocusEvent<HTMLSpanElement>) => {
    const alt = event.currentTarget.innerText;
    const { src, title, layoutClass } = node.attrs;

    if (alt === node.attrs.alt) {
      return;
    }

    const { view } = this.editor;
    const { tr } = view.state;

    // update meta on object
    const pos = getPos();
    const transaction = tr.setNodeMarkup(pos, undefined, {
      src,
      alt,
      title,
      layoutClass,
    });
    view.dispatch(transaction);
  };

  handleSelect = ({ getPos }: { getPos: () => number }) => (
    event: React.MouseEvent
  ) => {
    event.preventDefault();

    const { view } = this.editor;
    const $pos = view.state.doc.resolve(getPos());
    const transaction = view.state.tr.setSelection(new NodeSelection($pos));
    view.dispatch(transaction);
  };

  handleMouseDown = (ev: React.MouseEvent<HTMLParagraphElement>) => {
    if (document.activeElement !== ev.currentTarget) {
      ev.preventDefault();
      ev.stopPropagation();
      ev.currentTarget.focus();
    }
  };

  component = (props: ComponentProps) => {
    return (
      <ImageComponent
        {...props}
        onClick={this.handleSelect(props)}
        onSrc={this.editor.handleSrc}
      >
        <Caption
          onKeyDown={this.handleKeyDown(props)}
          onBlur={this.handleBlur(props)}
          onMouseDown={this.handleMouseDown}
          className="caption"
          tabIndex={-1}
          role="textbox"
          contentEditable
          suppressContentEditableWarning
          data-caption={this.options.dictionary.imageCaptionPlaceholder}
        >
          {props.node.attrs.alt}
        </Caption>
      </ImageComponent>
    );
  };

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
    let markdown =
      " ![" +
      state.esc((node.attrs.alt || "").replace("\n", "") || "", false) +
      "](" +
      state.esc(node.attrs.src || "", false);
    if (node.attrs.layoutClass) {
      markdown += ' "' + state.esc(node.attrs.layoutClass, false) + '"';
    } else if (node.attrs.title) {
      markdown += ' "' + state.esc(node.attrs.title, false) + '"';
    }
    markdown += ")";
    state.write(markdown);
  }

  parseMarkdown() {
    return {
      node: "image",
      getAttrs: (token: Token) => {
        return {
          src: token.attrGet("src"),
          alt:
            (token?.children &&
              token.children[0] &&
              token.children[0].content) ||
            null,
          ...getLayoutAndTitle(token?.attrGet("title")),
        };
      },
    };
  }

  commands({ type }: { type: NodeType }) {
    return {
      replaceImage: () => (state: EditorState) => {
        const { view } = this.editor;
        const {
          attachFile,
          uploadFile,
          onFileUploadStart,
          onFileUploadStop,
          onShowToast,
        } = this.editor.props;

        if ((!uploadFile && !attachFile) || (uploadFile && attachFile)) {
          throw new Error("Attach or Upload?");
        }
        
        if (uploadFile) {
          // create an input element and click to trigger picker
          const inputElement = document.createElement("input");
          inputElement.type = "file";
          inputElement.accept = "image/*";
          inputElement.onchange = (event: Event) => {
            const files = getDataTransferFiles(event);
            insertFiles(view, event, state.selection.from, files, {
              uploadFile,
              onFileUploadStart,
              onFileUploadStop,
              onShowToast,
              dictionary: this.options.dictionary,
              replaceExisting: true,
            });
          };
          inputElement.click();

          return true;
        }

        if (attachFile) {
          attachFiles(view, state.selection.from, {
            accept: "image/*", 
            attachFile,
            handleSrc: this.editor.handleSrc,
            replaceExisting: true,
          });

          return true;
        }
        return false;
      },
      deleteImage: () => (state: EditorState, dispatch: Dispatch) => {
        dispatch(state.tr.deleteSelection());
        return true;
      },
      alignRight: () => (state: EditorState, dispatch: Dispatch) => {
        if (!(state.selection instanceof NodeSelection)) {
          return false;
        }
        const attrs = {
          ...state.selection.node.attrs,
          title: null,
          layoutClass: "right-50",
        };
        const { selection } = state;
        dispatch(state.tr.setNodeMarkup(selection.from, undefined, attrs));
        return true;
      },
      alignLeft: () => (state: EditorState, dispatch: Dispatch) => {
        if (!(state.selection instanceof NodeSelection)) {
          return false;
        }
        const attrs = {
          ...state.selection.node.attrs,
          title: null,
          layoutClass: "left-50",
        };
        const { selection } = state;
        dispatch(state.tr.setNodeMarkup(selection.from, undefined, attrs));
        return true;
      },
      alignCenter: () => (state: EditorState, dispatch: Dispatch) => {
        if (!(state.selection instanceof NodeSelection)) {
          return false;
        }
        const attrs = { ...state.selection.node.attrs, layoutClass: null };
        const { selection } = state;
        dispatch(state.tr.setNodeMarkup(selection.from, undefined, attrs));
        return true;
      },
      createImage: (attrs: Record<string, any>) => (
        state: EditorState,
        dispatch: Dispatch
      ) => {
        const { selection } = state;
        const position =
          selection instanceof TextSelection
            ? selection.$cursor?.pos
            : selection.$to.pos;
        if (position === undefined) {
          return false;
        }

        const node = type.create(attrs);
        const transaction = state.tr.insert(position, node);
        dispatch(transaction);
        return true;
      },
    };
  }

  inputRules({ type }: { type: NodeType }) {
    return [
      new InputRule(IMAGE_INPUT_REGEX, (state, match, start, end) => {
        const [okay, alt, src, matchedTitle] = match;
        const { tr } = state;

        if (okay) {
          tr.replaceWith(
            start - 1,
            end,
            type.create({
              src,
              alt,
              ...getLayoutAndTitle(matchedTitle),
            })
          );
        }

        return tr;
      }),
    ];
  }

  get plugins() {
    return [uploadPlaceholderPlugin, uploadPlugin(this.options)];
  }
}

const ImageComponent = (
  props: ComponentProps & {
    onClick: (event: React.MouseEvent<HTMLDivElement>) => void;
    onSrc: (src: string) => string;
    children: React.ReactNode;
  }
) => {
  const { theme, isSelected, node, onSrc } = props;
  const { alt, src, layoutClass } = node.attrs;
  const newSrc = onSrc(src);
  const className = layoutClass ? `image image-${layoutClass}` : "image";
  //const [width, setWidth] = React.useState(0);

  return (
    <div contentEditable={false} className={className}>
      <ImageWrapper
        className={isSelected ? "ProseMirror-selectednode" : ""}
        onClick={props.onClick}
      >
        <img alt={alt} src={newSrc} />
      </ImageWrapper>
      {props.children}
    </div>
  );
};

const Caption = styled.p`
  border: 0;
  display: block;
  font-size: 13px;
  font-style: italic;
  font-weight: normal;
  color: ${(props) => props.theme.textSecondary};
  padding: 8px 0 4px;
  line-height: 16px;
  text-align: center;
  min-height: 1em;
  outline: none;
  background: none;
  resize: none;
  user-select: text;
  margin: 0 !important;
  cursor: text;

  &:empty:not(:focus) {
    display: none;
  }

  &:empty:before {
    color: ${(props) => props.theme.placeholder};
    content: attr(data-caption);
    pointer-events: none;
  }
`;

const ImageWrapper = styled.div`
  line-height: 0;
  position: relative;
  margin-left: auto;
  margin-right: auto;
  max-width: 100%;

  &.ProseMirror-selectednode + ${Caption} {
    display: block;
  }
`;
