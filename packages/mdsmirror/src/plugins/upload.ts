import { Plugin } from "prosemirror-state";
import insertFiles from "../core/commands/insertFiles";
import getDataTransferFiles from "../core/queries/getDataTransferFiles";

const uploadPlugin = (options: any) => new Plugin({
  props: {
    handleDOMEvents: {
      paste(view, event: ClipboardEvent): boolean {
        if (
          (view.props.editable && !view.props.editable(view.state)) ||
          !options.uploadImage
        ) {
          return false;
        }

        if (!event.clipboardData) return false;

        // check if we actually pasted any files
        const files = Array.prototype.slice
          .call(event.clipboardData.items)
          .map(dt => dt.getAsFile())
          .filter(file => file);

        if (files.length === 0) return false;

        const { tr } = view.state;
        if (!tr.selection.empty) {
          tr.deleteSelection();
        }
        const pos = tr.selection.from;

        insertFiles(view, event, pos, files, options);
        return true;
      },
      
      drop(view, event: DragEvent): boolean {
        if (
          (view.props.editable && !view.props.editable(view.state)) ||
          !options.uploadImage
        ) {
          return false;
        }

        // filter to only include image files
        const files = getDataTransferFiles(event).filter(file =>
          /image/i.test(file.type)
        );
        if (files.length === 0) {
          return false;
        }

        // grab the position in the document for the cursor
        const result = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        });

        if (result) {
          insertFiles(view, event, result.pos, files, options);
          return true;
        }

        return false;
      },
    },
  },
});

export default uploadPlugin;
