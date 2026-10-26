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

  test("onChange gets the markdown on content changes only", async () => {
    const { onChange, dispatch } = await setup({ defaultValue: "text" });
    await dispatch((tr) => tr.setSelection(TextSelection.create(tr.doc, 2)));
    expect(onChange).not.toHaveBeenCalled();

    await dispatch((tr) => tr.insertText("**", 1));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toBe("\\*\\*text");
  });
});
