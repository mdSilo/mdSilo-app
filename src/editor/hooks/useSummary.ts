import produce from 'immer';
import { createEditor, Editor, Descendant, Path, Element, Node, Text } from 'slate';
import { ElementType, FormattedText } from 'editor/slate';

export default function useExtractTexts (nodes: Descendant[]) {
  const matchingTexts = computeTextMatches(nodes);
  const result: Descendant[] = [];
  for (const [node, ] of matchingTexts) {
    result.push(node);
  }
  return result;
}

export function extractTexts (nodes: Descendant[], endIdx = 1) {
  const matchingTexts = computeTextMatches(nodes);
  const result: string[] = [];
  for (const [node, ] of matchingTexts) {
    result.push(node.text);
  }
  let texts = '';
  const slice = result.slice(0, endIdx);
  for (const str of slice) {
    texts += ` ${str}`;
  }
  return texts;
}

const computeTextMatches = (nodes: Descendant[]) => {
  const editor = createEditor();
  editor.children = nodes;

  const matchingTexts = Editor.nodes<FormattedText>(editor, {
    at: [],
    match: (n) => Text.isText(n) && n.text.trim().length > 0,
  });

  return matchingTexts;
}

export function bleachLinks (nodes: Descendant[]) {
  const matchingLinks = computeNodeMatches(nodes, true);
  let result: Descendant[] = nodes;
  for (const node of matchingLinks) {
    result = produce(result, (draftState) => {
      const path = node.path;
      if (path.length <= 0) {
        return [];
      }

      let linkNode = draftState[path[0]];
      for (const pathNumber of path.slice(1)) {
        linkNode = (linkNode as Element).children[pathNumber];
      }
      
      if (!Element.isElement(linkNode) || !checkLink((linkNode as Element).type)) {
        return [];
      }

      // change the Type of the element
      (linkNode.children as Descendant[]).unshift({ text: `${linkNode.type} : ` });
      linkNode.type = ElementType.Paragraph;
    });
  }

  return result;
}

type NodeMatch = {
  node: Node;
  path: Path;
};

const computeNodeMatches = (nodes: Descendant[], isLink = false) => {
  const editor = createEditor();
  editor.children = nodes;

  const matchingElements = Editor.nodes(editor, {
    at: [],
    match: (n) =>
      Element.isElement(n) && (isLink ? checkLink(n.type) : !checkLink(n.type))
  });

  const result: NodeMatch[] = [];
  for (const [node, path] of matchingElements) {
    result.push({ node, path });
  }
  return result;
};

const checkLink = (typ: ElementType) => { 
  return (
    typ === ElementType.NoteLink || 
    typ === ElementType.PubLink || 
    typ === ElementType.BlockReference
  );
};
