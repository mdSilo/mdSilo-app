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
}

const attachFiles = function (
  view: EditorView,
  pos: number,
  options: Options
): void {
  const { accept, attachFile, handleSrc } = options;

  if (!attachFile) {
    console.warn("no attachFile callback provided.");
    return;
  }

  attachFile(accept).then((attachs: Attach[]) => {
    const { schema } = view.state;
    // the user might have attached multiple files at once, we need to loop
    for (const file of attachs) {
      const isImage = file.type.startsWith("image/");
      const src = file.src; 
      const { tr } = view.state;

      // insert new line below before attach
      // console.log("pos", view.state.selection.from, view.state.selection.to);
      const transaction0 = view.state.tr.split(
        view.state.selection.from
      );
      view.dispatch(transaction0);
      const transaction1 = view.state.tr.split(
        view.state.selection.to
      );
      view.dispatch(transaction1);

      const $pos = tr.doc.resolve(pos);
      // console.log("$pos", $pos);
      const from = $pos.pos;
      const to = $pos.pos;
      // console.log("after node size", $pos.nodeAfter, $pos.nodeAfter?.nodeSize);
      
      if (isImage) {
        const newImg = new Image();
        const imgSrc = (handleSrc && handleSrc(src)) || src;
        newImg.src = imgSrc;
        newImg.onload = () => {
          view.dispatch(
            view.state.tr.replaceWith(
              from,
              to || from,
              schema.nodes.image.create({ src })
            )
          );
          // If the users selection is still at the file then make sure to select
          // the entire node once done. Otherwise, if the selection has moved
          // elsewhere then we don't want to modify it
          if (view.state.selection.from === from) {
            view.dispatch(
              view.state.tr.setSelection(
                new NodeSelection(view.state.doc.resolve(from))
              )
            );
          }
        };

        newImg.onerror = (error) => { throw error; };
      } else {
        view.dispatch(
          view.state.tr.replaceWith(
            from,
            to || from,
            schema.nodes.attachment.create({
              href: src,
              title: file.name ?? "Untitled",
              size: file.size,
            })
          )
        );

        // If the users selection is still at the file then make sure to select
        // the entire node once done. Otherwise, if the selection has moved
        // elsewhere then we don't want to modify it
        if (view.state.selection.from === from) {
          view.dispatch(
            view.state.tr.setSelection(
              new NodeSelection(view.state.doc.resolve(from))
            )
          );
        }
      }
    }
  })
};

export default attachFiles;
