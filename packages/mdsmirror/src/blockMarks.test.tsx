import * as React from "react";
import { act, render } from "@testing-library/react";
import { TextSelection } from "prosemirror-state";
import MsEditor from "./index";

const setup = async (value: string) => {
  const ref = React.createRef<MsEditor>();
  render(<MsEditor ref={ref} value={value} />);
  await act(async () => undefined);
  return ref.current as MsEditor;
};

// jsdom does not scroll
Element.prototype.scrollIntoView = vi.fn();

const marked = () =>
  [...document.querySelectorAll(".block-mark")].map((el) => el.textContent);

describe("blocks of text", () => {
  test("are the paragraphs, headings and items, in order", async () => {
    const editor = await setup("one\n\n# Two\n\n- three\n- four\n\n> five");
    expect(editor.textBlocks()).toEqual([
      { index: 0, text: "one", type: "paragraph" },
      { index: 1, text: "Two", type: "heading" },
      { index: 2, text: "three", type: "paragraph" },
      { index: 3, text: "four", type: "paragraph" },
      { index: 4, text: "five", type: "paragraph" },
    ]);
  });

  test("are marked, the marks following the edits, and taken back", async () => {
    const editor = await setup("one\n\ntwo\n\nthree");
    await act(async () =>
      editor.setBlockMarks([
        { index: 1, color: "rgb(255, 0, 0)" },
        { index: 9, color: "red" },
      ])
    );
    expect(marked()).toEqual(["two"]);
    expect(
      (document.querySelector(".block-mark") as HTMLElement).style
        .backgroundColor
    ).toBe("rgb(255, 0, 0)");
    // a paragraph made before it: the mark stays on its text
    await act(async () => {
      const { view } = editor;
      view.dispatch(
        view.state.tr.insert(
          0,
          view.state.schema.nodes.paragraph.create(
            null,
            view.state.schema.text("zero")
          )
        )
      );
    });
    expect(marked()).toEqual(["two"]);
    await act(async () => editor.setBlockMarks([]));
    expect(marked()).toEqual([]);
  });

  test("the cursor goes to one, and says which it is in", async () => {
    const editor = await setup("one\n\ntwo\n\nthree");
    await act(async () => {
      expect(editor.goToBlock(2)).toBe(true);
    });
    expect(editor.blockAtCursor()).toBe(2);
    await act(async () => {
      const { view } = editor;
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, 2))
      );
    });
    expect(editor.blockAtCursor()).toBe(0);
    expect(editor.goToBlock(7)).toBe(false);
  });
});
