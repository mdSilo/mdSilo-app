import { Node as PmNode } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import copy from "copy-to-clipboard";
import textToSlug from "../core/queries/textToSlug";

const getNodeAnchors = (doc: PmNode, name: string, className: string) => {
  const decorations: Decoration[] = [];
  const previouslySeen = {};

  doc.descendants((node, pos) => {
    if (node.type.name !== name) {
      return;
    }

    // calculate the optimal id
    const slug = textToSlug(node.textContent);
    let id = slug;

    // check if we've already used it, and if so how many times?
    // Make the new id based on that number ensuring that we have
    // unique ID's even when headings are identical
    if (previouslySeen[slug] > 0) {
      id = textToSlug(node.textContent, previouslySeen[slug]);
    }

    // record that we've seen this slug for the next loop
    previouslySeen[slug] =
      previouslySeen[slug] !== undefined ? previouslySeen[slug] + 1 : 1;

    decorations.push(
      Decoration.widget(
        pos,
        () => {
          const anchor = document.createElement("a");
          anchor.id = id;
          anchor.className = className;
          return anchor;
        },
        {
          side: -1,
          key: id,
        }
      )
    );
  });

  return DecorationSet.create(doc, decorations);
};


const getMarkAnchors = (doc: PmNode, name: string, className: string) => {
  const decorations: Decoration[] = [];
  const previouslySeen = {};

  doc.descendants((node, pos) => {
    node.forEach(child => {
      const hashs = child.marks.filter((m) => m.type.name === name)
      if (hashs.length > 0) { 
        // calculate the optimal id
        const slug = textToSlug(child.textContent, 0, 't');
        let id = slug;

        // check if we've already used it, and if so how many times?
        // Make the new id based on that number ensuring that we have
        // unique ID's even when headings are identical
        if (previouslySeen[slug] > 0) {
          id = textToSlug(child.textContent, previouslySeen[slug], 't');
        }

        // record that we've seen this slug for the next loop
        previouslySeen[slug] =
          previouslySeen[slug] !== undefined ? previouslySeen[slug] + 1 : 1;

        decorations.push(
          Decoration.widget(
            pos,
            () => {
              const anchor = document.createElement("a");
              anchor.id = id;
              anchor.className = className;
              return anchor;
            },
            {
              side: -1,
              key: id,
            }
          )
        );
      }
    })
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

export function copyAnchor (event: MouseEvent, className: string, onCopy?: any) {
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

export function copyHashtag (anchor: HTMLElement, onCopy?: any) {
  // console.log("target", anchor)
  const hash = `#${anchor.id}`;
  if (onCopy) {
    onCopy(hash);
  } else {
    copy(hash);
  }
}
