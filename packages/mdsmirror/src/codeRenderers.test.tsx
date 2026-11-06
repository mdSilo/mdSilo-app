import * as React from "react";
import { render, act } from "@testing-library/react";
import MsEditor from "./index";

// fenced code is parsed into code_block nodes, not code_fence: the renderers
// given must reach them, to draw the block and offer the language
describe("code blocks drawn by the renderers given", () => {
  const setup = (value: string) => {
    const renderBars = vi.fn(async () => "<svg data-test='bars'></svg>");
    const ref = React.createRef<MsEditor>();
    const { container } = render(
      <MsEditor
        ref={ref}
        value={value}
        dark={false}
        codeRenderers={{ bars: renderBars }}
      />
    );
    return { renderBars, container, view: (ref.current as MsEditor).view };
  };

  test("draws a fenced block of a rendered language", async () => {
    const { renderBars, container, view } = setup("```bars\nApples: 3\n```");
    // diagrams are drawn just after the editor is made, see Diagram.ts
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(view.state.doc.child(0).attrs.language).toBe("bars");
    expect(renderBars).toHaveBeenCalledWith("Apples: 3", false);
    expect(container.querySelector("[data-test='bars']")).not.toBeNull();
  });

  test("the line added after a drawn block at the end is below the drawing", async () => {
    const { view } = setup("Hello\n\n```bars\nApples: 3\n```");
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    // the trailing paragraph, to write on below the block
    expect(view.state.doc.lastChild?.type.name).toBe("paragraph");
    const last = view.dom.lastElementChild as HTMLElement;
    expect(last.tagName).toBe("P");
    expect(
      last.previousElementSibling?.querySelector("[data-test='bars']")
    ).not.toBeNull();
  });

  test("offers the rendered language in the language menu", async () => {
    const { container } = setup("```js\nlet a = 1\n```");
    await act(async () => {});
    const options = [
      ...container.querySelectorAll(".code-block select option"),
    ].map((option) => (option as HTMLOptionElement).value);
    expect(options).toContain("bars");
  });
});
