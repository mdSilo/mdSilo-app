import * as React from "react";
import { render, act, fireEvent } from "@testing-library/react";
import { TextSelection } from "prosemirror-state";
import copy from "copy-to-clipboard";
import MsEditor from "./index";

vi.mock("copy-to-clipboard", () => ({ default: vi.fn() }));

const setup = async (
  props: Partial<React.ComponentProps<typeof MsEditor>>,
  value = "hello selected world"
) => {
  const ref = React.createRef<MsEditor>();
  render(<MsEditor ref={ref} value={value} {...props} />);
  const { view } = ref.current as MsEditor;
  // select "selected"
  await act(async () => {
    view.focus();
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 7, 15))
    );
  });
  return view;
};

const button = (title: string) =>
  document.querySelector(`[title="${title}"] button`) as HTMLElement | null;

/** an action of the list under the Plugins button */
const pickAction = async (title: string) => {
  await act(async () => {
    fireEvent.click(button("Plugins")!);
  });
  const item = [...document.querySelectorAll('[role="menuitem"]')].find(
    (el) => el.querySelector(".title")?.textContent === title
  ) as HTMLElement;
  await act(async () => {
    fireEvent.click(item);
  });
};

describe("selection toolbar", () => {
  test("copies the text selected", async () => {
    const onShowToast = vi.fn();
    await setup({ onShowToast });
    await act(async () => {
      fireEvent.click(button("Copy")!);
    });
    expect(copy).toHaveBeenCalledWith("selected", { format: "text/plain" });
    expect(onShowToast).toHaveBeenCalledWith("Copied", "info");
  });

  test("makes an issue of the text, linked after it", async () => {
    const onCreateIssue = vi.fn(async () => ({
      title: "#12",
      href: "issue:12",
    }));
    const view = await setup({ onCreateIssue });
    await act(async () => {
      fireEvent.click(button("New issue of it")!);
    });
    expect(onCreateIssue).toHaveBeenCalledWith("selected");
    const { state } = view;
    expect(state.doc.textContent).toBe("hello selected #12 world");
    const link = state.schema.marks.link.create({ href: "issue:12" });
    expect(state.doc.rangeHasMark(16, 19, link)).toBe(true);
    expect(state.doc.rangeHasMark(15, 16, link)).toBe(false);
  });

  test("no issue button without onCreateIssue", async () => {
    await setup({});
    expect(button("Copy")).not.toBeNull();
    expect(button("New issue of it")).toBeNull();
  });

  test("an action given replaces the text selected", async () => {
    const run = vi.fn(async (text: string) => ({
      replace: text.toUpperCase(),
    }));
    const view = await setup({
      selectionActions: [{ id: "up", title: "Upper case", run }],
    });
    await pickAction("Upper case");
    expect(run).toHaveBeenCalledWith("selected", { markdown: "selected" });
    expect(view.state.doc.textContent).toBe("hello SELECTED world");
  });

  test("an action puts Markdown after the block of the text", async () => {
    const run = vi.fn(async () => ({
      insertMarkdown: "![A card](./assets/card.png)",
    }));
    const view = await setup({
      selectionActions: [{ id: "card", title: "Card", run }],
    });
    await pickAction("Card");
    const { doc } = view.state;
    expect(doc.childCount).toBe(2);
    expect(doc.child(0).textContent).toBe("hello selected world");
    const image = doc.child(1).firstChild!;
    expect(image.type.name).toBe("image");
    expect(image.attrs).toMatchObject({
      src: "./assets/card.png",
      alt: "A card",
    });
  });

  test("an action is given the text selected as Markdown too", async () => {
    const run = vi.fn(async () => undefined);
    await setup(
      { selectionActions: [{ id: "show", title: "Show", run }] },
      "hello **selected** world"
    );
    await pickAction("Show");
    expect(run).toHaveBeenCalledWith("selected", { markdown: "**selected**" });
  });

  test("an action given puts its answer after the text", async () => {
    const run = vi.fn(async () => ({ insert: "(1)" }));
    const view = await setup({
      selectionActions: [{ id: "cite", title: "Cite", run }],
    });
    await pickAction("Cite");
    expect(view.state.doc.textContent).toBe("hello selected (1) world");
  });

  test("the actions are in a list under one button, with icons", async () => {
    await setup({
      selectionActions: [
        {
          id: "card",
          title: "Quote card",
          icon: "mdsplugin://localhost/quote-card/icon.svg",
          group: "Quote Card",
          run: async () => undefined,
        },
        { id: "count", title: "Count words", run: async () => undefined },
      ],
    });
    expect(button("Quote card")).toBeNull();
    expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(0);
    await act(async () => {
      fireEvent.click(button("Plugins")!);
    });
    const items = [...document.querySelectorAll('[role="menuitem"]')];
    expect(items.map((el) => el.textContent)).toEqual([
      "Quote cardQuote Card",
      "Count words",
    ]);
    expect(items[0].querySelector("img")?.getAttribute("src")).toBe(
      "mdsplugin://localhost/quote-card/icon.svg"
    );
    // a puzzle piece for the one without an icon
    expect(items[1].querySelector("svg")).not.toBeNull();
    await act(async () => {
      fireEvent.click(button("Plugins")!);
    });
    expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(0);
  });

  test("an action changing nothing, or failing", async () => {
    const onShowToast = vi.fn();
    const view = await setup({
      onShowToast,
      selectionActions: [
        { id: "show", title: "Show", run: async () => undefined },
        {
          id: "fail",
          title: "Fail",
          run: async () => {
            throw new Error("offline");
          },
        },
      ],
    });
    await pickAction("Show");
    await pickAction("Fail");
    expect(view.state.doc.textContent).toBe("hello selected world");
    expect(onShowToast).toHaveBeenCalledWith("Fail: offline", "error");
  });
});
