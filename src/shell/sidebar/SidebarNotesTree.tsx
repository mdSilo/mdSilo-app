import {
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
  memo,
  forwardRef,
} from "react";
import { createPortal } from "react-dom";
import { Virtuoso, type ListProps } from "react-virtuoso";
import {
  CollisionDetection,
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import OverlayScroll, { useScroller } from "@/ui/OverlayScroll";
import { NoteTreeItem, store, useStore } from "@/state/store";
import { useCurrentViewContext } from "@/state/useCurrentView";
import useOnNoteLinkClick from "@/writer/hooks/useOnNoteLinkClick";
import { listDir } from "@/workspace/open";
import { normalizeSlash } from "@/workspace/util";
import SidebarNoteLink, {
  INDENT_PER_LEVEL,
  TreeDndData,
} from "./SidebarNoteLink";
import { canMoveTo, moveIntoDir } from "./treeMove";

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

// the space around the rows: drop to move into the opened dir
const ROOT_DROP_ID = "__notes-tree-root__";

// a row over the root: the root holds the rows
const treeCollision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const rows = hits.filter((hit) => hit.id !== ROOT_DROP_ID);
  return rows.length > 0 ? rows : hits;
};

/**
 * Move the dragged item into the dir dropped on, then show it there: expand
 * the dir, and keep the moved note open.
 */
const dropToMove = async (
  node: NoteTreeItem,
  tarDir: string,
  openNote: (id: string) => Promise<unknown>,
) => {
  const srcPath = normalizeSlash(node.id);
  const currentNoteId = normalizeSlash(store.getState().currentNoteId || "");
  const tarPath = await moveIntoDir(srcPath, tarDir);
  if (!tarPath) return;
  const { currentDir, noteTree, toggleExpandedDir } = store.getState();
  if (tarDir !== normalizeSlash(currentDir || "/")) {
    if (!noteTree[tarDir]) await listDir(tarDir, false);
    toggleExpandedDir(tarDir, true);
  }
  if (currentNoteId === srcPath) {
    await openNote(tarPath);
  } else if (currentNoteId.startsWith(`${srcPath}/`)) {
    await openNote(tarPath + currentNoteId.slice(srcPath.length));
  }
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

  const currentDir = useStore((state) => state.currentDir);
  const { onClick: openNote } = useOnNoteLinkClick();
  const [dragged, setDragged] = useState<NoteTreeItem | null>(null);
  // the dir to move the dragged item into, if it can
  const [dropDir, setDropDir] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
  );

  const onDragStart = (e: DragStartEvent) => {
    const d = e.active.data.current as TreeDndData | undefined;
    setDragged(d?.node ?? null);
  };
  const onDragOver = (e: DragOverEvent) => {
    const d = e.over?.data.current as TreeDndData | undefined;
    setDropDir(d && canMoveTo(String(e.active.id), d.dir) ? d.dir : null);
  };
  const onDragEnd = (e: DragEndEvent) => {
    setDragged(null);
    setDropDir(null);
    const node = (e.active.data.current as TreeDndData | undefined)?.node;
    const d = e.over?.data.current as TreeDndData | undefined;
    if (node && d) void dropToMove(node, d.dir, openNote);
  };
  const onDragCancel = () => {
    setDragged(null);
    setDropDir(null);
  };

  const contentWidth = useMemo(
    () =>
      treeContentWidth(data, (text) =>
        measureText(text, font || "16px sans-serif"),
      ),
    [data, font],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={treeCollision}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <TreeRoot
        ref={containerRef}
        dir={currentDir}
        isDropTarget={
          dropDir !== null && dropDir === normalizeSlash(currentDir || "/")
        }
        className={className}
      >
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
                isDropTarget={
                  node.is_dir &&
                  dropDir !== null &&
                  normalizeSlash(node.id) === dropDir
                }
                style={{ height: ROW_HEIGHT }}
              />
            )}
          />
        </OverlayScroll>
      </TreeRoot>
      {createPortal(
        <DragOverlay dropAnimation={null}>
          {dragged ? (
            <div className="px-2 py-1 text-sm rounded-sm shadow-popover bg-base-200 text-base-content w-max max-w-64 overflow-hidden text-ellipsis whitespace-nowrap">
              {dragged.title}
            </div>
          ) : null}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

/** The tree, to drop on to move into the opened dir. */
const TreeRoot = forwardRef<
  HTMLDivElement,
  {
    dir: string | undefined;
    isDropTarget: boolean;
    className?: string;
    children: React.ReactNode;
  }
>(function TreeRoot({ dir, isDropTarget, className = "", children }, ref) {
  const { setNodeRef } = useDroppable({
    id: ROOT_DROP_ID,
    data: { dir: normalizeSlash(dir || "/") } satisfies TreeDndData,
    disabled: !dir,
  });
  const setRef = (el: HTMLDivElement | null) => {
    setNodeRef(el);
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };
  return (
    <div
      ref={setRef}
      className={`${className} ${isDropTarget ? "ring-2 ring-inset ring-primary" : ""}`}
    >
      {children}
    </div>
  );
});

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
