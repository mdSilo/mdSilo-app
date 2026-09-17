import { Node } from "prosemirror-model";

export function toPlainText(root: Node) {
  return textBetween(root, 0, root.content.size);
}

/**
 * Returns the text content between two positions.
 *
 * @param doc The Prosemirror document to use
 * @param from A start point
 * @param to An end point
 * @returns A string of plain text
 */
export function textBetween(doc: Node, from: number, to: number): string {
  let text = "";
  let first = true;
  const blockSeparator = "\n";

  doc.nodesBetween(from, to, (node, pos) => {
    let nodeText = "";

    if (node.type.spec.leafText) {
      nodeText += node.type.spec.leafText(node);
    } else if (node.isText) {
      nodeText += node.textBetween(
        Math.max(from, pos) - pos,
        to - pos,
        blockSeparator
      );
    }

    if (
      node.isBlock &&
      ((node.isLeaf && nodeText) || node.isTextblock) &&
      blockSeparator
    ) {
      if (first) {
        first = false;
      } else {
        text += blockSeparator;
      }
    }

    text += nodeText;
  });

  return text;
}

export function sanitizeValue(value: string): string {
  if (!value) {
    return "";
  }

  return (
    value
      .toString()
      // Formula triggers
      .replace(/^([+\-=@∑√∏<>＜＞≤≥＝≠±÷×])/u, "'$1")
      // Control characters
      .replace(/[\u0000-\u001F\u007F-\u009F]/gu, "")
      // Zero-width spaces
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      // Bidirectional control
      .replace(/[\u202A-\u202E\u2066-\u2069]/g, "")
  );
}
