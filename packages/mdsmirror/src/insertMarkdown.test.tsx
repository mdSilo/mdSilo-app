import * as React from "react";
import { act, render } from "@testing-library/react";
import { TextSelection } from "prosemirror-state";
import MsEditor from "./index";

const setup = async (value: string, readOnly = false) => {
  const ref = React.createRef<MsEditor>();
  render(<MsEditor ref={ref} value={value} readOnly={readOnly} />);
  await act(async () => undefined);
  return ref.current as MsEditor;
};

// jsdom does not scroll
Element.prototype.scrollIntoView = vi.fn();

const QUOTE = "> to be\n>\n> — [Hamlet](book:abc#x)";

const cursorAt = (editor: MsEditor, text: string) => {
  const { view } = editor;
  let at = -1;
  view.state.doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text?.includes(text))
      at = pos + node.text.indexOf(text) + text.length;
  });
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, at))
  );
};

describe("insertMarkdown", () => {
  test("puts the blocks after the block of the cursor, then an empty paragraph to write in", async () => {
    const editor = await setup("one\n\ntwo");
    cursorAt(editor, "on");
    await act(async () => {
      expect(editor.insertMarkdown(QUOTE)).toBe(true);
    });
    const { doc, selection } = editor.view.state;
    expect(doc.childCount).toBe(4);
    expect(doc.child(0).textContent).toBe("one");
    expect(doc.child(1).type.name).toBe("blockquote");
    expect(doc.child(1).textContent).toContain("to be");
    expect(doc.child(2).type.name).toBe("paragraph");
    expect(doc.child(2).content.size).toBe(0);
    expect(doc.child(3).textContent).toBe("two");
    // the cursor in the empty paragraph
    expect(selection.$from.parent).toBe(doc.child(2));
    expect(editor.text()).toContain("[Hamlet](book:abc#x)");
  });

  test("in an empty paragraph: in place of it", async () => {
    const editor = await setup("one\n\n\\\n\ntwo");
    const { view } = editor;
    let empty = -1;
    view.state.doc.forEach((node, pos) => {
      if (empty < 0 && node.type.name === "paragraph" && !node.content.size)
        empty = pos + 1;
    });
    if (empty < 0) {
      // no empty paragraph parsed: make one after "one"
      await act(async () => {
        view.dispatch(
          view.state.tr.insert(
            view.state.doc.child(0).nodeSize,
            view.state.schema.nodes.paragraph.create()
          )
        );
      });
      empty = view.state.doc.child(0).nodeSize + 1;
    }
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, empty))
    );
    const before = view.state.doc.childCount;
    await act(async () => {
      editor.insertMarkdown(QUOTE);
    });
    const { doc } = view.state;
    // the empty paragraph became the quote, and one is made after it
    expect(doc.childCount).toBe(before + 1);
    expect(doc.child(1).type.name).toBe("blockquote");
  });

  test("does nothing in a note read only", async () => {
    const editor = await setup("one", true);
    expect(editor.insertMarkdown(QUOTE)).toBe(false);
    expect(editor.view.state.doc.textContent).toBe("one");
  });
});
