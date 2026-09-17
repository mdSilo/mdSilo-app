import { Token } from "markdown-it";
import { NodeSpec, Slice } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import { DecorationSet, Decoration } from "prosemirror-view";
import Node from "./Node";
import { addRowBefore, selectRow, selectTable } from "../core/commands/table";
import { getCellsInColumn, isRowSelected, isTableSelected } from "../core/queries/table";
import { getCellAttrs, setCellAttrs } from "../core/rules/tables";
import { combineClass } from "../core/helper";

export default class TableCell extends Node {
  get name() {
    return "td";
  }

  get schema(): NodeSpec {
    return {
      content: "block+",
      tableRole: "cell",
      isolating: true,
      parseDOM: [{ tag: "td", getAttrs: getCellAttrs }],
      toDOM(node) {
        return ["td", setCellAttrs(node), 0];
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
      block: "td",
      getAttrs: (tok: Token) => ({ alignment: tok.info }),
    };
  }

  get plugins() {
    function buildAddRowDecoration(pos: number, index: number) {
      const className = combineClass('table-add-row', {first: index === 0});

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
          transformCopied: (slice) => {
            // check if the copied selection is a single table, with a single row, with a single cell. If so,
            // copy the cell content only – not a table with a single cell. This leads to more predictable pasting
            // behavior, both in and outside the app.
            if (slice.content.childCount === 1) {
              const table = slice.content.firstChild;
              if (
                table?.type.spec.tableRole === "table" &&
                table.childCount === 1
              ) {
                const row = table.firstChild;
                if (
                  row?.type.spec.tableRole === "row" &&
                  row.childCount === 1
                ) {
                  const cell = row.firstChild;
                  if (cell?.type.spec.tableRole === "cell") {
                    return new Slice(
                      cell.content,
                      slice.openStart,
                      slice.openEnd
                    );
                  }
                }
              }
            }

            return slice;
          },
          handleDOMEvents: {
            mousedown: (view, event) => {
              if (!(event.target instanceof HTMLElement)) {
                return false;
              }

              const targetAddRow = event.target.closest(
                `.table-add-row`
              );
              if (targetAddRow) {
                event.preventDefault();
                event.stopImmediatePropagation();
                const index = Number(targetAddRow.getAttribute("data-index"));

                addRowBefore({ index })(view.state, view.dispatch);
                return true;
              }

              const targetGrip = event.target.closest(
                `.table-grip`
              );
              if (targetGrip) {
                event.preventDefault();
                event.stopImmediatePropagation();
                selectTable()(view.state, view.dispatch);
                return true;
              }

              const targetGripRow = event.target.closest(
                `.table-grip-row`
              );
              if (targetGripRow) {
                event.preventDefault();
                event.stopImmediatePropagation();

                selectRow(
                  Number(targetGripRow.getAttribute("data-index")),
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
            const rows = getCellsInColumn(0)(state);

            if (rows) {
              rows.forEach((pos, index) => {
                if (index === 0) {
                  const className = combineClass('table-grip', {
                    selected: isTableSelected(state),
                  });

                  decorations.push(
                    Decoration.widget(
                      pos + 1,
                      () => {
                        const grip = document.createElement("a");
                        grip.role = "button";
                        grip.className = className;
                        return grip;
                      },
                      {
                        key: className,
                      }
                    )
                  );
                }

                const className = combineClass('table-grip-row', {
                  selected: isRowSelected(index)(state),
                  first: index === 0,
                  last: index === rows.length - 1,
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
                  decorations.push(buildAddRowDecoration(pos, index));
                }

                decorations.push(buildAddRowDecoration(pos, index + 1));
              });
            }

            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  }
}
