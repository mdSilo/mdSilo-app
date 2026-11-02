import { fireEvent, render, screen, within } from "@testing-library/react";
import { VirtuosoMockContext } from "react-virtuoso";
import type { TOCItem } from "../document";
import TocView, { TOC_VIRTUAL_FROM, tocRows, tocSize } from "./TocView";

const toc: TOCItem[] = [
  { label: "One", href: "a" },
  {
    label: "Two",
    href: "b",
    subitems: [
      { label: "Two.1", href: "b#1" },
      { label: "Two.2", href: "b#2" },
    ],
  },
  { label: "Three", href: "c" },
];

const labels = () =>
  within(screen.getByTestId("reader-toc"))
    .getAllByRole("treeitem")
    .map((el) => el.textContent);

describe("TocView", () => {
  test("rows: the items opened, with their depth", () => {
    expect(tocRows(toc, new Set()).map((r) => r.item.label)).toEqual([
      "One",
      "Two",
      "Three",
    ]);
    const rows = tocRows(toc, new Set([toc[1]]));
    expect(rows.map((r) => [r.item.label, r.depth, r.key])).toEqual([
      ["One", 0, "0"],
      ["Two", 0, "1"],
      ["Two.1", 1, "1.0"],
      ["Two.2", 1, "1.1"],
      ["Three", 0, "2"],
    ]);
  });

  test("opened down to the chapter read; toggled; kept as pages turn", () => {
    const { rerender } = render(<TocView toc={toc} current="b#2" />);
    expect(labels()).toEqual(["One", "Two", "Two.1", "Two.2", "Three"]);
    const read = screen.getByRole("treeitem", { current: true });
    expect(read).toHaveTextContent("Two.2");
    expect(read).toHaveAttribute("aria-level", "2");

    fireEvent.click(screen.getByLabelText("Collapse"));
    expect(labels()).toEqual(["One", "Two", "Three"]);
    // a page turned in the same chapter: closed still
    rerender(<TocView toc={toc} current="b#2" />);
    expect(labels()).toEqual(["One", "Two", "Three"]);

    rerender(<TocView toc={toc} current="c" />);
    expect(screen.getByRole("treeitem", { current: true })).toHaveTextContent(
      "Three",
    );
    // into the chapter closed: opened again
    rerender(<TocView toc={toc} current="b#1" />);
    expect(labels()).toContain("Two.1");
  });

  test("long contents drawn in part, in the panel scrolled", () => {
    const long: TOCItem[] = Array.from(
      { length: TOC_VIRTUAL_FROM * 2 },
      (_, i) => ({ label: `Chapter ${i}`, href: `ch${i}` }),
    );
    const panel = document.createElement("div");
    document.body.append(panel);
    render(
      <VirtuosoMockContext.Provider
        value={{ viewportHeight: 400, itemHeight: 28 }}
      >
        <TocView toc={long} current="ch0" scroller={panel} />
      </VirtuosoMockContext.Provider>,
    );
    const shown = labels();
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(100);
    expect(shown[0]).toBe("Chapter 0");
    panel.remove();
  });

  test("long by all its items: drawn in part, opened or not", () => {
    // four books of a hundred chapters, as an anthology: four rows shown
    const books: TOCItem[] = Array.from({ length: 4 }, (_, b) => ({
      label: `Book ${b}`,
      href: `b${b}`,
      subitems: Array.from({ length: 100 }, (_, c) => ({
        label: `Book ${b} ${c}`,
        href: `b${b}c${c}`,
      })),
    }));
    expect(tocSize(books)).toBe(404);
    const panel = document.createElement("div");
    document.body.append(panel);
    const sized = (scroller: HTMLElement | null) => (
      <VirtuosoMockContext.Provider
        value={{ viewportHeight: 400, itemHeight: 28 }}
      >
        <TocView toc={books} scroller={scroller} />
      </VirtuosoMockContext.Provider>
    );
    const { rerender } = render(sized(null));
    // the panel not there yet: nothing drawn, not drawn whole first
    expect(screen.getByTestId("reader-toc")).toBeEmptyDOMElement();
    rerender(sized(panel));
    const list = screen.getByTestId("virtuoso-item-list");
    expect(labels()).toEqual(["Book 0", "Book 1", "Book 2", "Book 3"]);
    fireEvent.click(screen.getAllByLabelText("Expand")[0]);
    // the same list: not drawn again empty, the panel not scrolled to the top
    expect(screen.getByTestId("virtuoso-item-list")).toBe(list);
    expect(labels()).toContain("Book 0 0");
    panel.remove();
  });
});
