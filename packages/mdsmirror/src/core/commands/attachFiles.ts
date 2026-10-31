import { Attrs } from "prosemirror-model";
import { NodeSelection } from "prosemirror-state";
import { insertPoint } from "prosemirror-transform";
import { EditorView } from "prosemirror-view";

export type Options = {
  /** Set to true to replace any existing image at the users selection */
  replaceExisting?: boolean;
  isAttachment?: boolean;
  accept: string;
  attachFile?: (accept: string) => Promise<Attach[]>;
  handleSrc?: (src: string) => string;
};

export type Attach = {
  type: string;
  name: string;
  size: number;
  src: string;
};

const attachFiles = function (
  view: EditorView,

  _pos: number,
  options: Options
): void {
  const { accept, attachFile, handleSrc, replaceExisting } = options;

  if (!attachFile) {
    console.warn("no attachFile callback provided.");
    return;
  }

  attachFile(accept)
    .then(async (attachs: Attach[]) => {
      // preload the images so they are shown at once when inserted, then
      // insert all files in the picked order
      await Promise.all(
        attachs
          .filter((file) => file.type.startsWith("image/"))
          .map((file) =>
            preload((handleSrc && handleSrc(file.src)) || file.src)
          )
      );
      // the user might have attached multiple files at once,
      // only the first one replaces the selected node
      attachs.forEach((file, idx) => {
        const replace = !!replaceExisting && idx === 0;
        if (file.type.startsWith("image/")) {
          insertNode(view, "image", { src: file.src }, replace);
        } else {
          insertNode(
            view,
            "attachment",
            {
              href: file.src,
              title: file.name ?? "Untitled",
              size: file.size,
            },
            replace
          );
        }
      });
    })
    .catch((error) => console.error("Failed to attach file:", error));
};

/** resolve when the image is loaded or fails: never lose the attached */
function preload(src: string) {
  return new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });
}

/**
 * Insert the node at the current selection, which is read when inserting:
 * the document may have changed while picking the file.
 * Nothing in the document is overwritten: the node replaces a selected node
 * of the same type only if `replace`, an inline node(image) goes into the
 * selected empty textblock, else the node goes after the selected block,
 * an inline node in its own paragraph. An empty paragraph is added after
 * the node at the end of the document, so the user can go on typing below.
 */
function insertNode(
  view: EditorView,
  typeName: string,
  attrs: Attrs,
  replace: boolean
) {
  const { state } = view;
  const { schema, selection } = state;
  const type = schema.nodes[typeName];
  const paragraph = schema.nodes.paragraph;
  let tr = state.tr;

  if (
    replace &&
    selection instanceof NodeSelection &&
    selection.node.type === type
  ) {
    // keep the other attrs of the replaced node, e.g. alt, layout
    tr = tr.setNodeMarkup(selection.from, undefined, {
      ...selection.node.attrs,
      ...attrs,
    });
    tr = tr.setSelection(NodeSelection.create(tr.doc, selection.from));
    view.dispatch(tr.scrollIntoView());
    return;
  }

  const node = type.create(attrs);
  const { $from, $to } = selection;
  let at: number; // the position of the node
  if (
    node.isInline &&
    selection.empty &&
    $from.parent.isTextblock &&
    $from.parent.content.size === 0 &&
    $from.parent.canReplaceWith($from.index(), $from.index(), type)
  ) {
    tr = tr.insert($from.pos, node);
    at = $from.pos;
  } else {
    const block = node.isInline ? paragraph.create(null, node) : node;
    // after the textblock of the selection end, or after the selected blocks
    const after = $to.parent.inlineContent ? $to.after() : $to.pos;
    const pos = insertPoint(tr.doc, after, block.type) ?? after;
    tr = tr.insert(pos, block);
    at = node.isInline ? pos + 1 : pos;

    const end = pos + block.nodeSize;
    const $end = tr.doc.resolve(end);
    if ($end.depth === 0 && !$end.nodeAfter) {
      tr = tr.insert(end, paragraph.create());
    }
  }

  if (tr.doc.nodeAt(at)?.type === type) {
    tr = tr.setSelection(NodeSelection.create(tr.doc, at));
  }
  view.dispatch(tr.scrollIntoView());
}

export default attachFiles;
