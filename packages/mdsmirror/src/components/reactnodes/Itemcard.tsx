import { Token } from "markdown-it";
import { NodeSpec, NodeType, Node as ProsemirrorNode } from "prosemirror-model";
import * as React from "react";
import styled from "styled-components";
import toggleWrap from "../../core/commands/toggleWrap";
import { MarkdownSerializerState } from "../../core/mdSerializer";
import itemcardRule from "../../core/rules/itemcard";
import itemLinkRule from "../../core/rules/itemlink";
import { ComponentProps } from "../types";
import Node from "../../nodes/Node";

export default class Itemcard extends Node {
  get name() {
    return "itemcard";
  }

  get rulePlugins() {
    return [itemcardRule, itemLinkRule];
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
        cover: {},
        info: {},
      },
      group: "block",
      defining: true,
      atom: true,
      parseDOM: [
        {
          priority: 100,
          tag: "a.itemcard",
          getAttrs: (dom: HTMLAnchorElement) => {
            return {
              id: dom.id,
              title: dom.innerText,
              href: dom.getAttribute("href"),
              cover: dom.dataset.cover,
              info: dom.dataset.info,
            };
          },
        },
      ],
      toDOM: (node) => {
        return [
          "a",
          {
            class: `itemcard`,
            id: node.attrs.id,
            href: node.attrs.href,
            "data-cover": node.attrs.cover,
            "data-info": node.attrs.info,
          },
          node.attrs.title,
        ];
      },
      toPlainText: (node: ProsemirrorNode) => node.attrs.title,
    };
  }

  component({ theme, node }: ComponentProps) {
    return (
      <CardBox 
        theme={theme} 
        className="itemcard" 
        href={node.attrs.href}
        target="_blank"
        rel="noreferrer nofollow" 
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          // console.log("click", e);
          const handleClick = this.editor.props.onOpenLink;
          if (!handleClick) return;
          handleClick(node.attrs.href);
        }}
      >
        <CardInfo>
          <Title>{node.attrs.title}</Title>
          <CardMeta>{node.attrs.info}</CardMeta>
        </CardInfo>
        {node.attrs.cover && <CardCover>
          <CardImg 
            src={node.attrs.cover} 
            loading="lazy" 
            referrerPolicy="no-referrer"
          ></CardImg>
        </CardCover>}
      </CardBox>
    );
  }

  commands({ type }: { type: NodeType }) {
    return (attrs: Record<string, any>) => toggleWrap(type, attrs);
  }

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
    state.ensureNewLine();
    state.write(
      `[${node.attrs.title} | ${node.attrs.info} | ${node.attrs.cover}](${node.attrs.href})\n\n`
    );
    state.ensureNewLine();
  }

  parseMarkdown() {
    return {
      node: "itemcard",
      getAttrs: (tok: Token) => ({
        href: tok.attrGet("href"),
        title: tok.attrGet("title"),
        cover: tok.attrGet("cover"),
        info: tok.attrGet("info"),
      }),
    };
  }
}

const CardBox = styled.a`
  display: flex;
  flex-direction: row;
  box-shadow: 0px 0px 0px 1px;
  padding: 2px;
  border-radius: 6px;
  cursor: pointer;
`;

const CardInfo = styled.div`
  flex: 8; 
  padding: 2px;
  overflow: auto;
`;

const Title = styled.b`
  font-weight: 600;
  font-size: 20px;
  padding: 2px;
  color: ${(props) => props.theme.text};
`;

const CardMeta = styled.div`
  padding: 2px;
  overflow: auto;
  color: ${(props) => props.theme.textTertiary};
  font-size: 14px;
`;

const CardCover = styled.div`
  flex: 2;
  padding: 2px;
`;

const CardImg = styled.img`
  border-radius: 2.5%;
  max-width: 180px;
  max-height: 180px;
`;
