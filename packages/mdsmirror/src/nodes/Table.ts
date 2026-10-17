import { NodeSpec, Node as ProsemirrorNode, Schema } from "prosemirror-model";
import { EditorState, Plugin, TextSelection } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { chainCommands } from "prosemirror-commands";
import { InputRule } from "prosemirror-inputrules";
import {
  addColumnAfter,
  addRowAfter,
  columnResizing, // TODO
  deleteColumn,
  deleteRow,
  deleteTable,
  goToNextCell,
  tableEditing,
  toggleHeader,
} from "prosemirror-tables";
import {
  addRowBefore,
  addColumnBefore,
  addRowAndMoveSelection,
  setColumnAttr,
  createTable,
  exportTable,
  sortTable,
  setTableAttr,
  deleteColSelection,
  deleteRowSelection,
  deleteCellSelection,
  moveOutOfTable,
  createTableInner,
  deleteTableIfSelected,
  splitCellAndCollapse,
  mergeCellsAndCollapse,
  moveRow,
  moveColumn,
} from "../core/commands/table";
import { isColSelection } from "../core/queries/table";
import Node from "./Node";
import { Dispatch } from "../types";
import { TableView } from "./TableView";
import { MarkdownSerializerState } from "../core/mdSerializer";
import tablesRule from "../core/rules/tables";
import { FixTablesPlugin } from "../plugins/FixTables";
import { TableLayoutPlugin } from "../plugins/TableLayoutPlugin";

export default class Table extends Node {
  get name() {
    return "table";
  }

  get schema(): NodeSpec {
    return {
      content: "tr+",
      tableRole: "table",
      isolating: true,
      group: "block",
      parseDOM: [{ tag: "table" }],
      attrs: {
        layout: {
          default: null,
        },
      },
      toDOM() {
        // Note: This is overridden by TableView
        return ["div", { class: "table-wrapper" }, ["table", {}, ["tbody", 0]]];
      },
    };
  }

  get rulePlugins() {
    return [tablesRule];
  }

  commands() {
    return {
      createTable,
      setColumnAttr,
      setTableAttr,
      sortTable,
      addColumnBefore,
      addColumnAfter: () => addColumnAfter,
      deleteColumn: () => deleteColumn,
      addRowBefore,
      addRowAfter: () => addRowAfter,
      deleteRow: () => deleteRow,
      deleteTable: () => deleteTable,
      exportTable,
      toggleHeaderColumn: () => toggleHeader("column"),
      toggleHeaderRow: () => toggleHeader("row"),
      moveRowUp: ({ index }: { index?: number } = {}) =>
        moveRow({ index, direction: -1 }),
      moveRowDown: ({ index }: { index?: number } = {}) =>
        moveRow({ index, direction: 1 }),
      moveColumnLeft: ({ index }: { index?: number } = {}) =>
        moveColumn({ index, direction: -1 }),
      moveColumnRight: ({ index }: { index?: number } = {}) =>
        moveColumn({ index, direction: 1 }),
      mergeCells: () => mergeCellsAndCollapse(),
      splitCell: () => splitCellAndCollapse(),
    };
  }

  keys() {
    return {
      Tab: chainCommands(goToNextCell(1), addRowAndMoveSelection()),
      "Shift-Tab": goToNextCell(-1),
      "Mod-Enter": addRowAndMoveSelection(),
      "Mod-Backspace": chainCommands(
        deleteCellSelection,
        deleteColSelection(),
        deleteRowSelection(),
        deleteTableIfSelected()
      ),
      Backspace: chainCommands(
        deleteCellSelection,
        deleteColSelection(),
        deleteRowSelection(),
        deleteTableIfSelected()
      ),
      "Alt-ArrowUp": moveRow({ direction: -1 }),
      "Alt-ArrowDown": moveRow({ direction: 1 }),
      // only claimed when a column is selected, so Alt-Left/Right keeps
      // moving by word inside a cell on macOS
      "Alt-ArrowLeft": (state: EditorState, dispatch?: Dispatch) =>
        isColSelection(state) && moveColumn({ direction: -1 })(state, dispatch),
      "Alt-ArrowRight": (state: EditorState, dispatch?: Dispatch) =>
        isColSelection(state) && moveColumn({ direction: 1 })(state, dispatch),
      ArrowDown: moveOutOfTable(1),
      ArrowUp: moveOutOfTable(-1),
    };
  }

  inputRules() {
    return [
      new InputRule(/^(\|--)$/, (state, _, start, end) => {
        const nodes = createTableInner(state, 2, 2);
        const tr = state.tr.replaceWith(start - 1, end, nodes).scrollIntoView();
        const resolvedPos = tr.doc.resolve(start + 1);
        tr.setSelection(TextSelection.near(resolvedPos));
        return tr;
      }),
    ];
  }

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
    state.renderTable(node);
    state.closeBlock(node);
  }

  parseMarkdown() {
    return { block: "table" };
  }

  get plugins() {
    return [
      // Note: Important to register columnResizing before tableEditing
      columnResizing({
        View: TableView,
      }),
      tableEditing(),
      new FixTablesPlugin(),
      new TableLayoutPlugin(),
    ];
  }
}
