import { Token } from "markdown-it";
import { NodeSpec } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import { DecorationSet, Decoration, EditorView } from "prosemirror-view";
import Node from "./Node";
import { addColumnBefore, selectColumn } from "../core/commands/table";
import { getCellAttrs, setCellAttrs } from "../core/rules/tables";
import { getCellsInRow, isColumnSelected } from "../core/queries/table";
import { combineClass } from "../core/helper";

export default class TableHeadCell extends Node {
  get name() {
    return "th";
  }

  get schema(): NodeSpec {
    return {
      content: "block+",
      tableRole: "header_cell",
      isolating: true,
      parseDOM: [{ tag: "th", getAttrs: getCellAttrs }],
      toDOM(node) {
        return ["th", setCellAttrs(node), 0];
      },
      attrs: {
        colspan: { default: 1 },
        rowspan: { default: 1 },
        alignment: { default: null },
        colwidth: { default: null },
      },
    };
  }

  toMarkdown() {
    // see: renderTable
  }

  parseMarkdown() {
    return {
      block: "th",
      getAttrs: (tok: Token) => ({ alignment: tok.info }),
    };
  }

  get plugins() {
    function buildAddColumnDecoration(pos: number, index: number) {
      const className = combineClass('table-add-column', {first: index === 0});

      return Decoration.widget(
        pos + 1,
        () => {
          const plus = document.createElement("a");
          plus.role = "button";
          plus.className = className;
          plus.dataset.index = index.toString();
          return plus;
        },
        {
          key: combineClass(className, index),
        }
      );
    }

    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            mousedown: (view: EditorView, event: MouseEvent) => {
              if (!(event.target instanceof HTMLElement)) {
                return false;
              }

              const targetAddColumn = event.target.closest(
                `.table-add-column`
              );
              if (targetAddColumn) {
                event.preventDefault();
                event.stopImmediatePropagation();
                const index = Number(
                  targetAddColumn.getAttribute("data-index")
                );
                addColumnBefore({ index })(view.state, view.dispatch);
                return true;
              }

              const targetGripColumn = event.target.closest(
                `.table-grip-column`
              );
              if (targetGripColumn) {
                event.preventDefault();
                event.stopImmediatePropagation();

                selectColumn(
                  Number(targetGripColumn.getAttribute("data-index")),
                  event.metaKey || event.shiftKey
                )(view.state, view.dispatch);
                return true;
              }

              return false;
            },
          },
          decorations: (state) => {
            if (!this.editor.view?.editable) {
              return;
            }

            const { doc } = state;
            const decorations: Decoration[] = [];
            const cols = getCellsInRow(0)(state);

            if (cols) {
              cols.forEach((pos, index) => {
                const className = combineClass('table-grip-column', {
                  selected: isColumnSelected(index)(state),
                  first: index === 0,
                  last: index === cols.length - 1,
                });

                decorations.push(
                  Decoration.widget(
                    pos + 1,
                    () => {
                      const grip = document.createElement("a");
                      grip.role = "button";
                      grip.className = className;
                      grip.dataset.index = index.toString();
                      return grip;
                    },
                    {
                      key: combineClass(className, index),
                    }
                  )
                );

                if (index === 0) {
                  decorations.push(buildAddColumnDecoration(pos, index));
                }

                decorations.push(buildAddColumnDecoration(pos, index + 1));
              });
            }

            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  }
}
