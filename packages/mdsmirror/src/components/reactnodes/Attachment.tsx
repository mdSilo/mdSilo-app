import { Token } from "markdown-it";
import { TbLink, TbPaperclip } from "react-icons/tb";
import { NodeSpec, NodeType, Node as ProsemirrorNode } from "prosemirror-model";
import * as React from "react";
import toggleWrap from "../../core/commands/toggleWrap";
import Widget from "./Widget";
import { MarkdownSerializerState } from "../../core/mdSerializer";
import attachmentRule from "../../core/rules/attachment";
import { ComponentProps } from "../types";
import Node from "../../nodes/Node";

export default class Attachment extends Node {
  get name() {
    return "attachment";
  }

  get rulePlugins() {
    return [attachmentRule];
  }

  get schema(): NodeSpec {
    return {
      attrs: {
        id: {
          default: null,
        },
        href: {
          default: null,
        },
        title: {},
        size: {},
      },
      group: "block",
      defining: true,
      atom: true,
      parseDOM: [
        {
          priority: 100,
          tag: "a.attachment",
          getAttrs: (dom: HTMLAnchorElement) => {
            return {
              id: dom.id,
              title: dom.innerText,
              href: dom.getAttribute("href"),
              size: parseInt(dom.dataset.size || "0", 10),
            };
          },
        },
      ],
      toDOM: (node) => {
        return [
          "a",
          {
            class: `attachment`,
            id: node.attrs.id,
            href: node.attrs.href,
            download: node.attrs.title,
            "data-size": node.attrs.size,
          },
          node.attrs.title,
        ];
      },
      toPlainText: (node: ProsemirrorNode) => node.attrs.title,
    };
  }

  component({ isSelected, theme, node }: ComponentProps) {
    return (
      <Widget
        icon={<TbPaperclip />}
        href={node.attrs.href}
        title={node.attrs.title}
        context={node.attrs.href 
          ? (bytesToHumanReadable(node.attrs.size)) 
          : null
        }
        isSelected={isSelected}
        //theme={theme}
        className="attachment-link" 
        onClickAnchor={this.editor.props.onClickAttachment}
      >
        {node.attrs.href && <TbLink color="currentColor" size={20} />}
      </Widget>
    );
  }

  commands({ type }: { type: NodeType }) {
    return (attrs: Record<string, any>) => toggleWrap(type, attrs);
  }

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
    state.ensureNewLine();
    state.write(
      `[${node.attrs.title} ${node.attrs.size}](${node.attrs.href})\n\n`
    );
    state.ensureNewLine();
  }

  parseMarkdown() {
    return {
      node: "attachment",
      getAttrs: (tok: Token) => ({
        href: tok.attrGet("href"),
        title: tok.attrGet("title"),
        size: tok.attrGet("size"),
      }),
    };
  }
}


/**
 * Converts bytes to human readable string for display
 *
 * @param bytes filesize in bytes
 * @returns Human readable filesize as a string
 */
 export function bytesToHumanReadable(bytes: number) {
  const out = ("0".repeat((bytes.toString().length * 2) % 3) + bytes).match(
    /.{3}/g
  );

  if (!out || bytes < 1000) {
    return bytes > 0 ? `${bytes} Bytes` : '';
  }

  const f = out[1].substring(0, 2);

  return `${Number(out[0])}${f === "00" ? "" : `.${f}`} ${
    "  kMGTPEZY"[out.length]
  }B`;
}
