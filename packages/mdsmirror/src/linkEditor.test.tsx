import * as React from "react";
import { render, act, fireEvent } from "@testing-library/react";
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

describe("item link", () => {
  test("{{ searches the items, Enter links the first found", async () => {
    const ref = React.createRef<MsEditor>();
    const onSearchItem = vi.fn(async () => [
      { title: "Dune", url: "book:0123456789abcdef0123456789abcdef" },
    ]);
    render(
      <MsEditor
        ref={ref}
        value="a"
        onSearchLink={async () => []}
        onSearchItem={onSearchItem}
        onCreateLink={async (title) => title}
      />
    );
    const view = (ref.current as MsEditor).view;
    await act(async () => {
      view.focus();
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, 2))
      );
    });
    await act(async () => {
      for (const ch of " {{") {
        const { from, to } = view.state.selection;
        const insert = () => view.state.tr.insertText(ch, from, to);
        if (
          !view.someProp("handleTextInput", (f) =>
            f(view, from, to, ch, insert)
          )
        ) {
          view.dispatch(insert());
        }
      }
    });
    const input = document.querySelector("input") as HTMLInputElement;
    expect(input.placeholder).toMatch(/books/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: "dune" } });
    });
    expect(onSearchItem).toHaveBeenCalledWith("dune");
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    const { state } = view;
    expect(state.doc.textContent).toBe("a Dune");
    expect(
      state.doc.rangeHasMark(
        3,
        7,
        state.schema.marks.link.create({
          href: "book:0123456789abcdef0123456789abcdef",
        })
      )
    ).toBe(true);
  });
});

describe("a short link clicked", () => {
  // the click of the link at a position, as the view handles it
  const click = (view: MsEditor["view"], pos: number) => {
    const a = view.dom.querySelector("a") as HTMLAnchorElement;
    const event = new MouseEvent("click", { bubbles: true });
    Object.defineProperty(event, "target", { value: a });
    return view.someProp("handleClick", (f) => f(view, pos, event));
  };

  test.each([5, 6])(
    "of one character, at its edge %i: selected, its toolbar shown",
    async (pos) => {
      const ref = React.createRef<MsEditor>();
      render(<MsEditor ref={ref} value="see [x](https://a.b) here" />);
      const { view } = ref.current as MsEditor;
      await act(async () => {
        view.focus();
        expect(click(view, pos)).toBe(true);
      });
      expect(view.state.selection.from).toBe(5);
      expect(view.state.selection.to).toBe(6);
      expect((document.querySelector("input") as HTMLInputElement).value).toBe(
        "https://a.b"
      );
    }
  );

  test("longer, clicked in it: as usual", async () => {
    const ref = React.createRef<MsEditor>();
    render(<MsEditor ref={ref} value="see [xyz](https://a.b) here" />);
    const { view } = ref.current as MsEditor;
    await act(async () => {
      view.focus();
      expect(click(view, 6)).toBeFalsy();
    });
  });
});
