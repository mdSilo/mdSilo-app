import * as React from "react";
import { render, act } from "@testing-library/react";
import { TextSelection } from "prosemirror-state";
import MsEditor from "./index";

const setup = async (strict: boolean) => {
  const ref = React.createRef<MsEditor>();
  const editor = (
    <MsEditor
      ref={ref}
      value="hello selected world"
      onSearchLink={async () => []}
      onCreateLink={async (title) => title}
    />
  );
  render(strict ? <React.StrictMode>{editor}</React.StrictMode> : editor);
  const ed = ref.current as MsEditor;
  const { view } = ed;
  // select "world"
  await act(async () => {
    view.focus();
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 16, 21))
    );
  });
  return { ed, view };
};

describe.each([false, true])("create link (StrictMode: %s)", (strict) => {
  test("the link command shows the link editor", async () => {
    const { ed, view } = await setup(strict);
    await act(async () => {
      ed.commands.link({ href: "" });
    });
    const { state } = view;
    // the mark is of the schema of the view
    expect(state.doc.rangeHasMark(16, 21, state.schema.marks.link)).toBe(true);
    // the link editor input is shown to enter the link
    expect(document.querySelector("input")).not.toBeNull();
    expect(document.querySelectorAll(".ProseMirror")).toHaveLength(1);
  });

  test("clicking a link left without href shows the link editor again", async () => {
    const { ed, view } = await setup(strict);
    await act(async () => {
      ed.commands.link({ href: "" });
    });
    // cancel: click elsewhere in the text, the link editor is gone
    await act(async () => {
      view.focus();
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, 3))
      );
    });
    expect(document.querySelector("input")).toBeNull();
    expect(
      view.state.doc.rangeHasMark(16, 21, view.state.schema.marks.link)
    ).toBe(true);

    // click into the link: the link editor shows and focuses its input
    await act(async () => {
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, 18))
      );
    });
    const input = document.querySelector("input");
    expect(input).not.toBeNull();
    // the mouseup of the click must not reset the selection
    await act(async () => {
      const target = view.domAtPos(18).node;
      target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    expect(view.state.selection.from).toBe(18);
    expect(document.querySelector("input")).not.toBeNull();
  });

  test("other toolbar commands work on the view", async () => {
    const { ed, view } = await setup(strict);
    await act(async () => {
      ed.commands.strong();
    });
    const { state } = view;
    expect(state.doc.rangeHasMark(16, 21, state.schema.marks.strong)).toBe(
      true
    );
  });
});
