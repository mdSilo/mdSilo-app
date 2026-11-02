import { render, screen } from "@testing-library/react";
import { VirtuosoGridMockContext, VirtuosoMockContext } from "react-virtuoso";
import Shelf, { VIRTUAL_FROM } from "./Shelf";
import type { ShelfBook, ShelfItem } from "./shelf";

const books = (n: number): ShelfBook[] =>
  Array.from({ length: n }, (_, i) => ({
    hash: `h${i}`,
    file: `reading/b${i}.epub`,
    title: `Book ${i}`,
    author: "",
    format: "EPUB",
    addedAt: "2026-01-01T00:00:00Z",
    path: `/ws/reading/b${i}.epub`,
    here: true,
  }));

const renderItem = (item: ShelfItem) => (
  <div data-testid="item">{"title" in item ? item.title : item.name}</div>
);

describe("Shelf", () => {
  test("a short shelf drawn whole", () => {
    const scroller = document.createElement("div");
    render(
      <Shelf
        items={books(VIRTUAL_FROM - 1)}
        virtual={false}
        mode="grid"
        scroller={scroller}
        renderItem={renderItem}
      />,
    );
    expect(screen.getAllByTestId("item")).toHaveLength(VIRTUAL_FROM - 1);
  });

  test("a long shelf waits for the page scrolled: not drawn whole first", () => {
    const { container } = render(
      <Shelf
        items={books(500)}
        virtual
        mode="grid"
        scroller={null}
        renderItem={renderItem}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("a long list drawn in part: the books in view", () => {
    const scroller = document.createElement("div");
    document.body.append(scroller);
    render(
      <VirtuosoMockContext.Provider
        value={{ viewportHeight: 400, itemHeight: 100 }}
      >
        <Shelf
          items={books(500)}
          virtual
          mode="list"
          scroller={scroller}
          renderItem={renderItem}
        />
      </VirtuosoMockContext.Provider>,
    );
    const shown = screen.getAllByTestId("item");
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(50);
    expect(shown[0]).toHaveTextContent("Book 0");
    scroller.remove();
  });

  test("a long grid drawn in part", () => {
    const scroller = document.createElement("div");
    document.body.append(scroller);
    render(
      <VirtuosoGridMockContext.Provider
        value={{
          viewportHeight: 400,
          viewportWidth: 400,
          itemHeight: 200,
          itemWidth: 100,
        }}
      >
        <Shelf
          items={books(500)}
          virtual
          mode="grid"
          scroller={scroller}
          renderItem={renderItem}
        />
      </VirtuosoGridMockContext.Provider>,
    );
    const shown = screen.getAllByTestId("item");
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(100);
    scroller.remove();
  });
});
