import { Token } from "markdown-it";
import { wrappingInputRule } from "prosemirror-inputrules";
import { NodeSpec, NodeType, Schema, Node as PmNode } from "prosemirror-model";
import toggleList from "../core/commands/toggleList";
import { MarkdownSerializerState } from "../core/mdSerializer";
import Node from "./Node";

export default class OrderedList extends Node {
  get name() {
    return "ordered_list";
  }

  get schema(): NodeSpec {
    return {
      attrs: {
        order: {
          default: 1,
        },
        // all items numbered the same, e.g. `1.` `1.` `1.`, keep it on save
        sameNumber: {
          default: false,
        },
      },
      content: "list_item+",
      group: "block",
      parseDOM: [
        {
          tag: "ol",
          getAttrs: (dom: HTMLOListElement) => ({
            order: dom.hasAttribute("start")
              ? parseInt(dom.getAttribute("start") || "1", 10)
              : 1,
          }),
        },
      ],
      toDOM: (node) =>
        node.attrs.order === 1
          ? ["ol", 0]
          : ["ol", { start: node.attrs.order }, 0],
    };
  }

  commands({ type, schema }: { type: NodeType; schema: Schema }) {
    return () => toggleList(type, schema.nodes.list_item);
  }

  keys({ type, schema }: { type: NodeType; schema: Schema }) {
    return {
      "Ctrl-9": toggleList(type, schema.nodes.list_item),
    };
  }

  inputRules({ type }: { type: NodeType }) {
    return [
      wrappingInputRule(
        /^(\d+)\.\s$/,
        type,
        (match) => ({ order: +match[1] }),
        (match, node) => node.childCount + node.attrs.order === +match[1]
      ),
    ];
  }

  toMarkdown(state: MarkdownSerializerState, node: PmNode) {
    const start = node.attrs.order !== undefined ? node.attrs.order : 1;
    const same = !!node.attrs.sameNumber;
    const maxW = `${same ? start : start + node.childCount - 1}`.length;
    const space = state.repeat(" ", maxW + 2);

    state.renderList(node, space, (index: number) => {
      const nStr = `${same ? start : start + index}`;
      return state.repeat(" ", maxW - nStr.length) + nStr + ". ";
    });
  }

  parseMarkdown() {
    return {
      block: "ordered_list",
      getAttrs: (tok: Token, tokens: Token[], i: number) => ({
        order: parseInt(tok.attrGet("start") || "1", 10),
        sameNumber: isSameNumber(tokens, i),
      }),
    };
  }
}

/**
 * Check if the items of the ordered list opened at `tokens[i]` are all
 * numbered the same, e.g. `1.` `1.` `1.`
 */
function isSameNumber(tokens: Token[], i: number): boolean {
  const level = tokens[i].level;
  const numbers: string[] = [];
  for (let j = i + 1; j < tokens.length; j++) {
    const tok = tokens[j];
    if (tok.level === level && tok.type === "ordered_list_close") {
      break;
    }
    if (tok.level === level + 1 && tok.type === "list_item_open") {
      numbers.push(tok.info);
    }
  }
  return numbers.length > 1 && numbers.every((n) => n === numbers[0]);
}
