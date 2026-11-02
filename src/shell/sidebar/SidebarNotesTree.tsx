import {
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
  memo,
  forwardRef,
} from "react";
import { Virtuoso, type ListProps } from "react-virtuoso";
import OverlayScroll, { useScroller } from "@/ui/OverlayScroll";
import { NoteTreeItem } from "@/state/store";
import { useCurrentViewContext } from "@/state/useCurrentView";
import SidebarNoteLink, { INDENT_PER_LEVEL } from "./SidebarNoteLink";

export type NoteTreeRow = {
  node: NoteTreeItem;
  depth: number;
  isExpanded: boolean;
};

type Props = {
  data: NoteTreeRow[];
  className?: string;
};

const ROW_HEIGHT = 32;

// row layout, see SidebarNoteLink: indent per level, then icon, title, dropdown
const ROW_CHROME = 8 + 28 + 8 + 32 + 8; // base pad + icon + right pad + dropdown + slack

/**
 * Width needed to show every row in full: the list scrolls horizontally
 * when deep or long rows overflow the sidebar.
 */
export const treeContentWidth = (
  rows: NoteTreeRow[],
  measure: (text: string) => number,
): number => {
  let max = 0;
  for (const { node, depth } of rows) {
    const w = depth * INDENT_PER_LEVEL + ROW_CHROME + measure(node.title);
    if (w > max) max = w;
  }
  return Math.ceil(max);
};

// measure text with canvas, cached per font; fallback to an estimate
const textWidthCache = new Map<string, Map<string, number>>();
let measureCtx: CanvasRenderingContext2D | null | undefined;
const measureText = (text: string, font: string): number => {
  let byText = textWidthCache.get(font);
  if (!byText) {
    byText = new Map();
    textWidthCache.set(font, byText);
  }
  const cached = byText.get(text);
  if (cached !== undefined) return cached;
  if (measureCtx === undefined) {
    measureCtx = document.createElement("canvas").getContext("2d");
  }
  let width: number;
  if (measureCtx) {
    measureCtx.font = font;
    width = measureCtx.measureText(text).width;
  } else {
    width = text.length * 8;
  }
  byText.set(text, width);
  return width;
};

function SidebarNotesTree(props: Props) {
  const { data, className } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scroller, scrollerRef] = useScroller();
  // font of the rows, to measure titles
  const [font, setFont] = useState("");
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (el) setFont(window.getComputedStyle(el).font);
  }, []);

  const currentView = useCurrentViewContext();
  const params = currentView.state.params;
  const noteId = params?.noteId || "";

  const currentNoteId = useMemo(() => {
    const id = noteId;
    return id && typeof id === "string" ? id : undefined;
  }, [noteId]);

  const contentWidth = useMemo(
    () =>
      treeContentWidth(data, (text) =>
        measureText(text, font || "16px sans-serif"),
      ),
    [data, font],
  );

  return (
    <div ref={containerRef} className={className}>
      <OverlayScroll scroller={scroller} className="h-full">
        <Virtuoso
          scrollerRef={scrollerRef}
          data={data}
          fixedItemHeight={ROW_HEIGHT}
          context={{ contentWidth }}
          components={{ List: TreeList }}
          computeItemKey={(index, row) => `${row.node.id}-${index}`}
          itemContent={(_, { node, depth, isExpanded }) => (
            <SidebarNoteLink
              node={node}
              depth={depth}
              isExpanded={isExpanded}
              isHighlighted={node.id === currentNoteId}
              style={{ height: ROW_HEIGHT }}
            />
          )}
        />
      </OverlayScroll>
    </div>
  );
}

/**
 * The rows, as wide as the widest: the list scrolls horizontally when they
 * overflow the sidebar. Overflow visible: the sticky row buttons stick to
 * the scroller.
 */
const TreeList = forwardRef<
  HTMLDivElement,
  ListProps & { context: { contentWidth: number } }
>(function TreeList({ context, style, ...props }, ref) {
  return (
    <div
      ref={ref}
      {...props}
      data-testid="notes-tree-list"
      style={{ ...style, width: context.contentWidth, minWidth: "100%" }}
    />
  );
});

export default memo(SidebarNotesTree);
