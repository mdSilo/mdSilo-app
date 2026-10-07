import { Node, Schema } from "prosemirror-model";
import { NodeSelection } from "prosemirror-state";
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _pos: number,
  options: Options
): void {
  const { accept, attachFile, handleSrc } = options;

  if (!attachFile) {
    console.warn("no attachFile callback provided.");
    return;
  }

  attachFile(accept)
    .then((attachs: Attach[]) => {
      // the user might have attached multiple files at once
      for (const file of attachs) {
        const isImage = file.type.startsWith("image/");
        if (!isImage) {
          insertNode(view, (schema) =>
            schema.nodes.attachment.create({
              href: file.src,
              title: file.name ?? "Untitled",
              size: file.size,
            })
          );
          continue;
        }

        const insert = () =>
          insertNode(view, (schema) =>
            schema.nodes.image.create({ src: file.src })
          );
        // preload the image so it is shown at once when inserted,
        // insert it anyway if it fails to load: never lose the attached
        const img = new Image();
        img.onload = insert;
        img.onerror = insert;
        img.src = (handleSrc && handleSrc(file.src)) || file.src;
      }
    })
    .catch((error) => console.error("Failed to attach file:", error));
};

/**
 * Insert the node at the current selection, which is read when inserting:
 * the document may have changed while picking the file.
 * An inline node(image) is put in its own paragraph unless the selection is
 * in an empty one, a block node(attachment) is put after the current block.
 */
function insertNode(view: EditorView, create: (schema: Schema) => Node) {
  const { state } = view;
  const node = create(state.schema);
  const { $from } = state.selection;
  let tr = state.tr;

  if (
    node.isInline &&
    $from.parent.isTextblock &&
    $from.parent.content.size > 0
  ) {
    const paragraph = state.schema.nodes.paragraph.create(null, node);
    const at = $from.after();
    tr = tr.insert(at, paragraph);
    tr = tr.setSelection(NodeSelection.create(tr.doc, at + 1));
  } else {
    tr = tr.replaceSelectionWith(node);
    const pos = tr.selection.from - node.nodeSize;
    if (pos >= 0 && tr.doc.nodeAt(pos)?.type === node.type) {
      tr = tr.setSelection(NodeSelection.create(tr.doc, pos));
    }
  }

  view.dispatch(tr.scrollIntoView());
}

export default attachFiles;
