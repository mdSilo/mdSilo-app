import * as React from "react";
import { render, act } from "@testing-library/react";
import { TextSelection } from "prosemirror-state";
import { CellSelection, TableMap } from "prosemirror-tables";
import MsEditor from "./index";
import { canMoveColumn, canMoveRow } from "./core/commands/table";

// https://github.com/mdSilo/mdSilo-app/issues/780
const md = [
  "| a | b | c |",
  "|:---|----|---:|",
  "| 1 | 2 | 3 |",
  "| 4 | 5 | 6 |",
].join("\n");

const setup = () => {
  const ref = React.createRef<MsEditor>();
  render(<MsEditor ref={ref} value={md} />);
  const ed = ref.current as MsEditor;
  return { ed, view: ed.view };
};

const cellPos = (view: MsEditor["view"], row: number, col: number) => {
  const table = view.state.doc.child(0);
  return 1 + TableMap.get(table).positionAt(row, col, table);
};

const selectRow = (view: MsEditor["view"], row: number) =>
  view.dispatch(
    view.state.tr.setSelection(
      CellSelection.rowSelection(view.state.doc.resolve(cellPos(view, row, 0)))
    )
  );

const selectCol = (view: MsEditor["view"], col: number) =>
  view.dispatch(
    view.state.tr.setSelection(
      CellSelection.colSelection(view.state.doc.resolve(cellPos(view, 0, col)))
    )
  );

const putCursor = (view: MsEditor["view"], row: number, col: number) =>
  view.dispatch(
    view.state.tr.setSelection(
      TextSelection.near(view.state.doc.resolve(cellPos(view, row, col) + 1))
    )
  );

const pressKey = (view: MsEditor["view"], key: string) =>
  !!view.someProp("handleKeyDown", (f) =>
    f(view, new KeyboardEvent("keydown", { key, altKey: true }))
  );

describe("moving table rows and columns", () => {
  test("moves a row down and up", async () => {
    const { ed, view } = setup();
    await act(async () => {
      selectRow(view, 1);
      ed.commands.moveRowDown({ index: 1 });
    });
    expect(ed.text().trim()).toBe(
      [
        "| a | b | c |",
        "|:---|----|---:|",
        "| 4 | 5 | 6 |",
        "| 1 | 2 | 3 |",
      ].join("\n")
    );
    await act(async () => {
      ed.commands.moveRowUp({ index: 2 });
    });
    expect(ed.text().trim()).toBe(md);
  });

  test("moves a column with its alignment", async () => {
    const { ed, view } = setup();
    await act(async () => {
      selectCol(view, 0);
      ed.commands.moveColumnRight({ index: 0 });
    });
    expect(ed.text().trim()).toBe(
      [
        "| b | a | c |",
        "|----|:---|---:|",
        "| 2 | 1 | 3 |",
        "| 5 | 4 | 6 |",
      ].join("\n")
    );
    await act(async () => {
      ed.commands.moveColumnLeft({ index: 1 });
    });
    expect(ed.text().trim()).toBe(md);
  });

  test("keeps the header row at the top and stays inside the table", async () => {
    const { view } = setup();
    await act(async () => selectRow(view, 1));
    expect(canMoveRow(view.state, 0, 1)).toBe(false);
    expect(canMoveRow(view.state, 1, -1)).toBe(false);
    expect(canMoveRow(view.state, 1, 1)).toBe(true);
    expect(canMoveRow(view.state, 2, 1)).toBe(false);
    await act(async () => selectCol(view, 0));
    expect(canMoveColumn(view.state, 0, -1)).toBe(false);
    expect(canMoveColumn(view.state, 2, 1)).toBe(false);
    expect(canMoveColumn(view.state, 1, -1)).toBe(true);
  });

  test("Alt-Up/Down moves the row of the cursor", async () => {
    const { ed, view } = setup();
    await act(async () => {
      putCursor(view, 2, 1);
      expect(pressKey(view, "ArrowUp")).toBe(true);
    });
    expect(ed.text().trim()).toBe(
      [
        "| a | b | c |",
        "|:---|----|---:|",
        "| 4 | 5 | 6 |",
        "| 1 | 2 | 3 |",
      ].join("\n")
    );
    await act(async () => {
      // the moved row is selected, so it can be moved again
      expect(pressKey(view, "ArrowDown")).toBe(true);
    });
    expect(ed.text().trim()).toBe(md);
  });

  test("Alt-Left/Right moves a selected column only", async () => {
    const { ed, view } = setup();
    await act(async () => {
      putCursor(view, 1, 1);
    });
    expect(pressKey(view, "ArrowRight")).toBe(false);
    await act(async () => {
      selectCol(view, 1);
      expect(pressKey(view, "ArrowRight")).toBe(true);
    });
    expect(ed.text().trim()).toBe(
      [
        "| a | c | b |",
        "|:---|---:|----|",
        "| 1 | 3 | 2 |",
        "| 4 | 6 | 5 |",
      ].join("\n")
    );
  });
});
