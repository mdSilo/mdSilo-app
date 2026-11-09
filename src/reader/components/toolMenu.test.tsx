import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { usePopups, type TextSelection } from "../popups";
import BookPopups, { type Tool } from "./BookPopups";

const selection: TextSelection = {
  text: "entropy",
  cfi: "epubcfi(/6/4)",
  index: 1,
  box: { left: 100, top: 200, right: 160, bottom: 220 },
};

function renderPopups(tools: (s: TextSelection) => Tool[]) {
  const root = document.createElement("div");
  root.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
    }) as DOMRect;
  const rootRef = createRef<HTMLDivElement>() as { current: HTMLDivElement };
  rootRef.current = root;
  render(<BookPopups rootRef={rootRef} tools={tools} />);
  act(() => usePopups.getState().setSelection(selection));
}

afterEach(() => usePopups.getState().clear());

describe("a tool with a menu", () => {
  it("is one button, its items in a list by the toolbar", async () => {
    const card = vi.fn();
    const count = vi.fn();
    renderPopups(() => [
      {
        id: "plugins",
        title: "Plugins",
        icon: <span>P</span>,
        menu: [
          {
            id: "card",
            title: "Quote card",
            group: "Quote Card",
            icon: (
              <img alt="" src="mdsplugin://localhost/quote-card/icon.svg" />
            ),
            onClick: card,
          },
          { id: "count", title: "Count words", icon: <span />, onClick: count },
        ],
      },
    ]);
    expect(screen.queryByRole("button", { name: "Quote card" })).toBeNull();
    const button = screen.getByRole("button", { name: "Plugins" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    const items = screen.getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual([
      "Quote cardQuote Card",
      "Count words",
    ]);
    await userEvent.click(items[0]);
    expect(card).toHaveBeenCalledTimes(1);
    expect(count).not.toHaveBeenCalled();
    // chosen: the list closes
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("is not there with nothing in it", () => {
    renderPopups(() => [
      {
        id: "plugins",
        title: "Plugins",
        icon: <span />,
        menu: [],
        hidden: true,
      },
      { id: "x", title: "X", icon: <span />, onClick: () => undefined },
    ]);
    expect(screen.queryByRole("button", { name: "Plugins" })).toBeNull();
    expect(screen.getByRole("button", { name: "X" })).toBeInTheDocument();
  });
});

describe("the toolbar of the text selected, on a touch screen", () => {
  it("is docked at the bottom, its menus opening above it", async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(hover: none) and (pointer: coarse)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    renderPopups(() => [
      {
        id: "plugins",
        title: "Plugins",
        icon: <span />,
        menu: [{ id: "a", title: "A", icon: <span />, onClick: vi.fn() }],
      },
    ]);
    const popup = screen.getByTestId("selection-popup");
    expect(popup).toHaveAttribute("data-docked");
    expect(popup).toHaveClass("bottom-2");
    await userEvent.click(screen.getByRole("button", { name: "Plugins" }));
    expect(screen.getByRole("menu")).toHaveClass("bottom-full");
  });
});
