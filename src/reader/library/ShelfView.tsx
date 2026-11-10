import { Fragment, type ReactNode } from "react";
import { Virtuoso, VirtuosoGrid } from "react-virtuoso";
import { useT } from "@/i18n";
import { isGroup, type ShelfItem, type ViewMode } from "./shelf";

/**
 * From how many books in the library the shelf is drawn in part, the items in
 * view: below it, drawn whole is faster than measured as it scrolls. By the
 * books of the library, not the items shown: a search or a group opened
 * never changes the way the shelf is drawn, the list drawn again empty
 * first, the page scrolled back to the top.
 */
export const VIRTUAL_FROM = 100;

// drawn beyond the view, e.g. a book dragged off it kept a while (px)
const OVERSCAN = 600;

const GRID = "grid gap-1 grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]";

const keyOf = (item: ShelfItem) =>
  isGroup(item) ? `group:${item.key}` : item.hash;

type Props = {
  items: ShelfItem[];
  /** drawn in part, see VIRTUAL_FROM */
  virtual: boolean;
  mode: ViewMode;
  /** the element scrolled: the page, the shelf in it below the toolbars */
  scroller: HTMLElement | null;
  renderItem: (item: ShelfItem) => ReactNode;
};

/** The books and groups, as a grid or a list. */
export default function Shelf({
  items,
  virtual,
  mode,
  scroller,
  renderItem,
}: Props) {
  const t = useT();
  // a long shelf waits for the page: not drawn whole first
  if (virtual && !scroller) return null;
  if (!virtual || !scroller) {
    return (
      <div
        className={mode === "grid" ? GRID : "flex flex-col"}
        role="list"
        aria-label={t("Bookshelf")}
      >
        {items.map((item) => (
          <Fragment key={keyOf(item)}>{renderItem(item)}</Fragment>
        ))}
      </div>
    );
  }
  return (
    <div role="list" aria-label={t("Bookshelf")}>
      {mode === "grid" ? (
        <VirtuosoGrid
          customScrollParent={scroller}
          data={items}
          computeItemKey={(_, item) => keyOf(item)}
          increaseViewportBy={OVERSCAN}
          listClassName={GRID}
          itemContent={(_, item) => renderItem(item)}
        />
      ) : (
        <Virtuoso
          customScrollParent={scroller}
          data={items}
          computeItemKey={(_, item) => keyOf(item)}
          increaseViewportBy={OVERSCAN}
          itemContent={(_, item) => renderItem(item)}
        />
      )}
    </div>
  );
}
