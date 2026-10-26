import { Node as PmNode } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import copy from "copy-to-clipboard";
import textToSlug from "../core/queries/textToSlug";

/** Unique ids from the slugs of the text: `slug`, then `slug-1`... */
const uniqueIds = (prefix?: string) => {
  const seen: Record<string, number> = {};
  return (text: string) => {
    const slug = textToSlug(text, 0, prefix);
    const count = seen[slug] || 0;
    seen[slug] = count + 1;
    return count > 0 ? textToSlug(text, count, prefix) : slug;
  };
};

const anchorWidget = (pos: number, id: string, className: string) =>
  Decoration.widget(
    pos,
    () => {
      const anchor = document.createElement("a");
      anchor.id = id;
      anchor.className = className;
      return anchor;
    },
    { side: -1, key: id }
  );

/** An anchor before each node of type `name` */
const getNodeAnchors = (doc: PmNode, name: string, className: string) => {
  const decorations: Decoration[] = [];
  const idOf = uniqueIds();

  doc.descendants((node, pos) => {
    if (node.type.name !== name) {
      // no such node in inline content
      return !node.isTextblock;
    }
    decorations.push(anchorWidget(pos, idOf(node.textContent), className));
    return false;
  });

  return DecorationSet.create(doc, decorations);
};

/** An anchor before the textblock of each text with mark `name` */
const getMarkAnchors = (doc: PmNode, name: string, className: string) => {
  const decorations: Decoration[] = [];
  const idOf = uniqueIds("t");

  doc.descendants((node, pos) => {
    if (!node.isTextblock) {
      return true;
    }
    node.forEach((child) => {
      if (child.marks.some((mark) => mark.type.name === name)) {
        decorations.push(anchorWidget(pos, idOf(child.textContent), className));
      }
    });
    return false;
  });

  return DecorationSet.create(doc, decorations);
};

export default function Anchor(name: string, className: string, isNode = true) {
  const plugin: Plugin = new Plugin({
    state: {
      init: (config, state) => {
        return isNode
          ? getNodeAnchors(state.doc, name, className)
          : getMarkAnchors(state.doc, name, className);
      },
      apply: (tr, oldState) => {
        return tr.docChanged
          ? isNode
            ? getNodeAnchors(tr.doc, name, className)
            : getMarkAnchors(tr.doc, name, className)
          : oldState;
      },
    },
    props: {
      decorations: (state) => plugin.getState(state),
    },
  });

  return plugin;
}

export function copyAnchor(event: MouseEvent, className: string, onCopy?: any) {
  // this is unfortunate but appears to be the best way to grab the anchor
  // as it's added directly to the dom by a decoration.
  const anchor =
    event.currentTarget instanceof HTMLButtonElement &&
    (event.currentTarget.parentNode?.parentNode
      ?.previousSibling as HTMLElement);

  if (!anchor || !anchor.className.includes(className)) {
    throw new Error("Did not find anchor");
  }
  const hash = `#${anchor.id}`;
  if (onCopy) {
    onCopy(hash);
  } else {
    copy(hash);
  }
}

export function copyHashtag(anchor: HTMLElement, onCopy?: any) {
  const hash = `#${anchor.id}`;
  if (onCopy) {
    onCopy(hash);
  } else {
    copy(hash);
  }
}
