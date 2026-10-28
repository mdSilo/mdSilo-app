import * as React from "react";
import { render, act, fireEvent } from "@testing-library/react";
import { TextSelection } from "prosemirror-state";
import copy from "copy-to-clipboard";
import MsEditor from "./index";

vi.mock("copy-to-clipboard", () => ({ default: vi.fn() }));

const setup = async (props: Partial<React.ComponentProps<typeof MsEditor>>) => {
  const ref = React.createRef<MsEditor>();
  render(<MsEditor ref={ref} value="hello selected world" {...props} />);
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
});
