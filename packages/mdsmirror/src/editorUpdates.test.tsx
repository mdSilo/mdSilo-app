import * as React from "react";
import { render, act } from "@testing-library/react";
import { TextSelection } from "prosemirror-state";
import MsEditor, { Props } from "./index";

const setup = async (props: Partial<Props> = {}) => {
  const ref = React.createRef<MsEditor>();
  const onChange = vi.fn();
  const element = (more: Partial<Props> = {}) => (
    <MsEditor ref={ref} onChange={onChange} {...props} {...more} />
  );
  const result = render(element());
  const ed = ref.current as MsEditor;
  const dispatch = (f: (tr: typeof ed.view.state.tr) => void) =>
    act(async () => {
      const { tr } = ed.view.state;
      f(tr);
      ed.view.dispatch(tr);
    });
  return { ed, onChange, dispatch, rerender: result.rerender, element };
};

describe("editor updates", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  test("the theme object is kept while its props do not change", async () => {
    const { ed, dispatch, rerender, element } = await setup({
      defaultValue: "text",
    });
    const theme = ed.theme();
    await dispatch((tr) => tr.insertText("more", 1));
    rerender(element());
    expect(ed.theme()).toBe(theme);

    rerender(element({ dark: true }));
    expect(ed.theme()).not.toBe(theme);
    expect(ed.theme().background).not.toBe(theme.background);
  });

  test("the dictionary object is kept while its prop does not change", async () => {
    const { ed } = await setup();
    const custom = { newLineEmpty: "Type…" };
    const dictionary = ed.dictionary(custom);
    expect(ed.dictionary(custom)).toBe(dictionary);
    expect(dictionary.newLineEmpty).toBe("Type…");
    expect(ed.dictionary()).not.toBe(dictionary);
  });

  test("the direction follows the content, checked on content changes only", async () => {
    const { ed, dispatch } = await setup({ defaultValue: "hello" });
    expect(ed.state.isRTL).toBe(false);
    const getComputedStyle = vi.spyOn(window, "getComputedStyle");
    // of the editor element, which has the dir attribute
    const dirChecks = () =>
      getComputedStyle.mock.calls.filter(([el]) => el === ed.elementRef.current)
        .length;

    // cursor moves and edits keeping the direction: no style recalc
    await dispatch((tr) => tr.setSelection(TextSelection.create(tr.doc, 3)));
    await dispatch((tr) => tr.insertText("abc", 1));
    expect(dirChecks()).toBe(0);

    // a right-to-left first character
    await dispatch((tr) => tr.insertText("مرحبا ", 1));
    expect(dirChecks()).toBe(1);
    expect(ed.state.isRTL).toBe(true);
  });

  // styled-components 6 passes the props of a styled element on to the DOM,
  // unless they are transient ($): React then warns about each of them
  test.each([
    ["editable", {}],
    ["read only", { readOnly: true, readOnlyWriteCheckboxes: true }],
  ])("no styling props reach the DOM (%s)", async (_, props) => {
    // styled-components warns in development only, not under "test"
    vi.stubEnv("NODE_ENV", "development");
    const warn = vi.spyOn(console, "warn");
    const error = vi.spyOn(console, "error");
    const { dispatch } = await setup({
      defaultValue: "# Title\n\n- [ ] task\n\n| a | b |\n|---|---|\n| 1 | 2 |",
      ...props,
    });
    await dispatch((tr) => tr.setSelection(TextSelection.create(tr.doc, 1, 4)));
    const leaks = [...warn.mock.calls, ...error.mock.calls]
      .map((args) => args.map(String).join(" "))
      .filter((text) =>
        /unknown prop|does not recognize|non-boolean attribute/.test(text)
      );
    expect(leaks).toEqual([]);
  });

  test("a value of the same document keeps the editor state", async () => {
    const { ed, dispatch, rerender, element } = await setup({
      value: "first\n\nsecond",
    });
    await dispatch((tr) => tr.setSelection(TextSelection.create(tr.doc, 10)));
    const state = ed.view.state;
    // e.g. the note loaded again, the file ending with a newline
    await act(async () => rerender(element({ value: "first\n\nsecond\n" })));
    expect(ed.view.state).toBe(state);
    expect(ed.view.state.selection.from).toBe(10);
  });

  test("a value of another document replaces it, the node views too", async () => {
    const error = vi.spyOn(console, "error");
    const image = "![cat](https://example.com/cat.png)";
    const { ed, rerender, element } = await setup({
      value: `text\n\n${image}`,
    });
    expect(ed.view.dom.querySelector("img")).not.toBeNull();
    await act(async () => rerender(element({ value: "other text" })));
    expect(ed.view.state.doc.textContent).toBe("other text");
    expect(ed.view.dom.querySelector("img")).toBeNull();
    // the React roots of the node views are not unmounted while rendering
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const unmountErrors = error.mock.calls.filter((args) =>
      String(args[0]).includes("synchronously unmount")
    );
    expect(unmountErrors).toEqual([]);
  });

  // the icon used to be rendered by React after the node was drawn: the
  // change of its DOM made ProseMirror draw it again, endlessly
  test("a notice is drawn once, with its icon", async () => {
    const { ed } = await setup({ value: ":::tip\nnotice text\n:::" });
    const block = ed.view.dom.querySelector(".notice-block");
    expect(block?.querySelectorAll(".icon svg path")).toHaveLength(3);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(ed.view.dom.querySelector(".notice-block")).toBe(block);
    expect(ed.view.dom.querySelectorAll(".notice-block svg")).toHaveLength(1);
  });

  test("onChange gets the markdown on content changes only", async () => {
    const { onChange, dispatch } = await setup({ defaultValue: "text" });
    await dispatch((tr) => tr.setSelection(TextSelection.create(tr.doc, 2)));
    expect(onChange).not.toHaveBeenCalled();

    await dispatch((tr) => tr.insertText("**", 1));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toBe("\\*\\*text");
  });
});
