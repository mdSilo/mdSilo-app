import * as React from "react";
import { render, act } from "@testing-library/react";
import { TextSelection } from "prosemirror-state";
import MsEditor from "./index";

// type the text char by char, as the key bindings and input rules see it
const typeText = (view: MsEditor["view"], text: string) => {
  for (const ch of text) {
    const key = new KeyboardEvent("keydown", { key: ch });
    if (view.someProp("handleKeyDown", (f) => f(view, key))) {
      continue;
    }
    const { from, to } = view.state.selection;
    const insert = () => view.state.tr.insertText(ch, from, to);
    if (
      !view.someProp("handleTextInput", (f) => f(view, from, to, ch, insert))
    ) {
      view.dispatch(insert());
    }
  }
};

const setup = (value: string) => {
  const ref = React.createRef<MsEditor>();
  render(<MsEditor ref={ref} value={value} />);
  const ed = ref.current as MsEditor;
  return { ed, view: ed.view };
};

describe("typing in the editor", () => {
  test("typing <!-- text --> makes an inline comment", async () => {
    const { ed, view } = setup("a");
    await act(async () => {
      view.focus();
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, 2))
      );
    });
    await act(async () => {
      typeText(view, " <!-- note -->");
    });
    const para = view.state.doc.child(0);
    expect(para.child(1).text).toBe(" note ");
    expect(para.child(1).marks[0].type.name).toBe("comment_inline");
    expect(ed.text()).toBe("a <!-- note -->");
  });

  test("-> is still an arrow", async () => {
    const { view } = setup("a");
    await act(async () => {
      view.focus();
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, 2))
      );
      typeText(view, " ->");
    });
    // https://github.com/mdSilo/mdSilo-app/issues/402
    expect(view.state.doc.child(0).type.name).toBe("paragraph");
    expect(view.state.doc.textContent).toBe("a →");
  });

  test("the comment command makes a comment block", async () => {
    const { ed, view } = setup("my note");
    await act(async () => {
      view.focus();
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, 2))
      );
      ed.commands.comment();
    });
    expect(view.state.doc.child(0).type.name).toBe("comment");
    // the trailing node is an empty paragraph
    expect(ed.text().trim()).toBe("<!--my note-->");
  });
});
