import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TbCaretRight as IconCaretRight } from "react-icons/tb";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import type { TOCItem } from "../document";
import { getView } from "../view";

/**
 * From how many items, opened or not, the contents are drawn in part, the
 * rows in view: below it, drawn whole is faster than measured as it scrolls.
 * By all the items, not the rows shown: a row opened never changes the way
 * the contents are drawn, the list drawn again empty first, the panel
 * scrolled back to the top.
 */
export const TOC_VIRTUAL_FROM = 300;

type Props = {
  toc: TOCItem[];
  /** the href of the chapter read */
  current?: string;
  /** the element scrolled, the panel: the contents drawn in part in it, if long */
  scroller?: HTMLElement | null;
};

export type TocRow = { item: TOCItem; depth: number; key: string };

/** The items down to the one of an href, if there. */
export function pathTo(items: TOCItem[], href: string): TOCItem[] | undefined {
  for (const item of items) {
    if (item.href === href) return [item];
    const sub = item.subitems ? pathTo(item.subitems, href) : undefined;
    if (sub) return [item, ...sub];
  }
  return undefined;
}

/** How many items: those in the items too. */
export const tocSize = (items: TOCItem[]): number =>
  items.reduce((n, item) => n + 1 + tocSize(item.subitems ?? []), 0);

/** The rows shown: the items, and the items in the ones opened. */
export function tocRows(
  items: TOCItem[],
  opened: Set<TOCItem>,
  depth = 0,
  prefix = "",
  rows: TocRow[] = [],
): TocRow[] {
  items.forEach((item, i) => {
    const key = `${prefix}${i}`;
    rows.push({ item, depth, key });
    if (item.subitems?.length && opened.has(item))
      tocRows(item.subitems, opened, depth + 1, `${key}.`, rows);
  });
  return rows;
}

/**
 * The table of contents of the book: the chapter read shown, opened down to
 * it. A page turned draws again only the rows it changes.
 */
function TocView({ toc, current, scroller }: Props) {
  const treeRef = useRef<HTMLDivElement>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const path = useMemo(
    () => (current ? pathTo(toc, current) : undefined),
    [toc, current],
  );
  const [opened, setOpened] = useState<Set<TOCItem>>(() => new Set(path));

  // another book: none opened but down to the chapter read
  const tocRef = useRef(toc);
  // the chapter shown last: scrolled to once
  const shown = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (tocRef.current === toc) return;
    tocRef.current = toc;
    shown.current = undefined;
    setOpened(new Set(path));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toc]);

  // opened as the reader goes into it
  useEffect(() => {
    if (!path) return;
    setOpened((old) =>
      path.every((item) => old.has(item)) ? old : new Set([...old, ...path]),
    );
  }, [path]);

  const toggle = useCallback(
    (item: TOCItem) =>
      setOpened((old) => {
        const next = new Set(old);
        if (!next.delete(item)) next.add(item);
        return next;
      }),
    [],
  );

  const rows = useMemo(() => tocRows(toc, opened), [toc, opened]);
  const virtual = useMemo(() => tocSize(toc) >= TOC_VIRTUAL_FROM, [toc]);
  // long contents wait for the panel: not drawn whole and scrolled first
  const waiting = virtual && !scroller;

  // the chapter read, in view: once per chapter, not again as rows toggle
  useEffect(() => {
    if (!current || shown.current === current || waiting) return;
    if (virtual) {
      const index = rows.findIndex((r) => r.item.href === current);
      if (index < 0) return;
      virtuosoRef.current?.scrollIntoView({ index, align: "center" });
    } else {
      const el = treeRef.current?.querySelector('[aria-current="true"]');
      if (!el) return;
      el.scrollIntoView?.({ block: "nearest" });
    }
    shown.current = current;
  }, [current, rows, virtual, waiting]);

  if (toc.length === 0) {
    return (
      <p className="p-4 text-sm text-base-content/60">No table of contents</p>
    );
  }
  const row = ({ item, depth }: TocRow) => (
    <TocItem
      item={item}
      depth={depth}
      isCurrent={current !== undefined && item.href === current}
      open={opened.has(item)}
      onToggle={toggle}
    />
  );
  return (
    <div
      ref={treeRef}
      role="tree"
      aria-label="Table of contents"
      className="py-2 text-sm"
      data-testid="reader-toc"
    >
      {waiting ? null : virtual ? (
        <Virtuoso
          ref={virtuosoRef}
          customScrollParent={scroller ?? undefined}
          data={rows}
          computeItemKey={(_, r) => r.key}
          itemContent={(_, r) => row(r)}
        />
      ) : (
        rows.map((r) => <div key={r.key}>{row(r)}</div>)
      )}
    </div>
  );
}

const TocItem = memo(function TocItem({
  item,
  depth,
  isCurrent,
  open,
  onToggle,
}: {
  item: TOCItem;
  depth: number;
  isCurrent: boolean;
  open: boolean;
  onToggle: (item: TOCItem) => void;
}) {
  const hasChildren = Boolean(item.subitems?.length);
  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={hasChildren ? open : undefined}
      aria-selected={isCurrent}
      aria-current={isCurrent ? "true" : undefined}
      className={`flex items-center pr-2 hover:bg-base-content/10 ${isCurrent ? "bg-primary/10 text-primary font-semibold" : ""}`}
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
    >
      {hasChildren ? (
        <button
          className="p-1 rounded-sm hover:bg-base-content/15"
          onClick={() => onToggle(item)}
          aria-label={open ? "Collapse" : "Expand"}
        >
          <IconCaretRight
            size={14}
            className={`transition-transform ${open ? "rotate-90" : ""}`}
          />
        </button>
      ) : (
        <span className="w-[22px]" />
      )}
      <button
        className="flex-1 py-1 text-left truncate"
        title={item.label}
        onClick={() => void getView()?.goTo(item.href)}
      >
        {item.label?.trim() || "-"}
      </button>
    </div>
  );
});

export default memo(TocView);
