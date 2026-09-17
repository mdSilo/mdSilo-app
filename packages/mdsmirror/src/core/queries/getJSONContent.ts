import { Node as ProseMirrorNode } from 'prosemirror-model';

export type JSONContent = {
  type?: string,
  from?: number,
  to?: number,
  attrs?: Record<string, any>,
  content?: JSONContent[],
  marks?: {
    type: string,
    attrs?: Record<string, any>,
    [key: string]: any,
  }[],
  text?: string,
  [key: string]: any,
};

export function getJSONContent(node: ProseMirrorNode, startOffset = 0): JSONContent {
  const isTopNode = node.type === node.type.schema.topNodeType;
  const increment = isTopNode ? 0 : 1;
  const from = startOffset;
  const to = from + node.nodeSize;
  // type, from , to
  const output: JSONContent = {
    type: node.type.name,
    from,
    to,
  };
  // marks
  const marks = node.marks.map(mark => {
    const output: { type: string, attrs?: Record<string, any> } = {
      type: mark.type.name,
    };

    if (Object.keys(mark.attrs).length) {
      output.attrs = { ...mark.attrs };
    }

    return output;
  });

  if (marks.length) {
    output.marks = marks;
  }
  // attrs
  const attrs = { ...node.attrs };

  if (Object.keys(attrs).length) {
    output.attrs = attrs;
  }
  // text
  if (node.text) {
    output.text = node.text;
  }
  // content, 
  if (node.content.childCount) {
    output.content = [];

    node.forEach((child, offset) => {
      output.content?.push(getJSONContent(child, startOffset + offset + increment))
    })
  }

  return output;
}
