import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { storeOf } from '../readerStore';
import type { FoliateView, Pane } from '../view';
import {
  clampPosition, columnsOf, lineBoxesOf, rulerFilter, rulerPadding, rulerPositions, rulerSize, setRulerMover, snapColumns,
  snapColumnsToAnchor, snapToAnchor, snapToLines, stepPosition, visibleLines,
  type Column, type Direction, type LineBox, type RulerColor,
} from './ruler';

type Props = {
  pane: Pane;
  view: () => FoliateView | null;
  vertical: boolean;
  /** the lines, or the columns, right to left */
  rtl: boolean;
  scrolled: boolean;
  lines: number;
  opacity: number;
  color: RulerColor;
  fontSize: number;
  lineHeight: number;
  /** of the page, if not of the app */
  background?: string;
};

type Rect = { top: number; bottom: number; left: number; right: number; width: number; height: number };
type Block = { start: number; end: number; columnIndex?: number };

/** The rects of a range in a section, in the box of the ruler: the frame of the section is offset in the window. */
function rectsIn(range: Range, box: DOMRect): Rect[] {
  const frame = range.startContainer?.ownerDocument?.defaultView?.frameElement?.getBoundingClientRect();
  const fx = (frame?.left ?? 0) - box.left;
  const fy = (frame?.top ?? 0) - box.top;
  return Array.from(range.getClientRects()).map((r) => ({
    top: r.top + fy, bottom: r.bottom + fy, left: r.left + fx, right: r.right + fx, width: r.width, height: r.height,
  }));
}

type CaretDoc = Document & {
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
};

/** A character of the text at a point of the window, in the sections shown. */
function charAt(docs: Document[], x: number, y: number): Range | null {
  for (const doc of docs) {
    const frame = doc.defaultView?.frameElement?.getBoundingClientRect();
    if (frame && (x < frame.left || x > frame.right || y < frame.top || y > frame.bottom)) continue;
    try {
      const caretDoc = doc as CaretDoc;
      const dx = x - (frame?.left ?? 0);
      const dy = y - (frame?.top ?? 0);
      let range: Range | null = null;
      if (caretDoc.caretRangeFromPoint) range = caretDoc.caretRangeFromPoint(dx, dy);
      else if (caretDoc.caretPositionFromPoint) {
        const pos = caretDoc.caretPositionFromPoint(dx, dy);
        if (pos) {
          range = doc.createRange();
          range.setStart(pos.offsetNode, pos.offset);
        }
      }
      const node = range?.startContainer;
      if (!range || !node || node.nodeType !== Node.TEXT_NODE) continue;
      // a character: a range with a rect
      const length = (node as Text).length;
      const offset = Math.min(range.startOffset, Math.max(0, length - 1));
      range.setStart(node, offset);
      range.setEnd(node, Math.min(length, offset + 1));
      return range;
    } catch {
      // the next section
    }
  }
  return null;
}

/** The lines of the page shown, of its range. */
function pageLines(range: Range, box: DOMRect, vertical: boolean, rtl: boolean): LineBox[] {
  const lines = lineBoxesOf(rectsIn(range, box), vertical, rtl, { top: 0, left: 0, right: box.width });
  return visibleLines(lines, vertical ? box.width : box.height);
}

/**
 * Scrolled: the lines of the sections in the view, and those just out of it,
 * to scroll to them.
 */
function scrolledLines(view: FoliateView | null, box: DOMRect, vertical: boolean, rtl: boolean): LineBox[] {
  const lines: LineBox[] = [];
  for (const { doc } of view?.renderer.getContents() ?? []) {
    const frame = doc?.defaultView?.frameElement?.getBoundingClientRect();
    if (!frame || !doc.body) continue;
    const away = vertical
      ? frame.right <= box.left || frame.left >= box.right
      : frame.bottom <= box.top || frame.top >= box.bottom;
    if (away) continue;
    const range = doc.createRange();
    range.selectNodeContents(doc.body);
    lines.push(...lineBoxesOf(rectsIn(range, box), vertical, rtl, { top: 0, left: 0, right: box.width }));
  }
  return lines.sort((a, b) => a.start - b.start || a.end - b.end);
}

/**
 * The columns of the page shown. Two pages side by side can be of two
 * sections: the range of the page is of one, the other is in too, else the
 * ruler turns the page past it.
 */
function pageColumns(view: FoliateView | null, range: Range, box: DOMRect, count: number, rtl: boolean): Column[] {
  const primary = range.startContainer?.ownerDocument;
  const rects = rectsIn(range, box);
  for (const { doc } of view?.renderer.getContents() ?? []) {
    if (doc === primary || !doc.body) continue;
    const frame = doc.defaultView?.frameElement?.getBoundingClientRect();
    if (!frame || frame.right <= box.left || frame.left >= box.right) continue;
    try {
      const all = doc.createRange();
      all.selectNodeContents(doc.body);
      rects.push(...rectsIn(all, box));
    } catch {
      // gone, as the page turns
    }
  }
  const shown = rects.filter((r) => (r.left + r.right) / 2 >= 0 && (r.left + r.right) / 2 <= box.width);
  return columnsOf(shown, count, box.width, rtl)
    .map((c) => ({ ...c, lines: visibleLines(c.lines, box.height) }))
    .filter((c) => c.lines.length > 0);
}

const EASE = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

/**
 * The reading ruler over the pages (ported from readup): the band on a few
 * lines, moved by the clicks on the sides and the arrows (see moveRuler), or
 * dragged by its edges; the rest of the page dimmed. In two columns, it is on
 * one of them. It stays on the same text as the pages are laid out again.
 */
export default function ReadingRuler({
  pane, view, vertical, rtl, scrolled, lines, opacity, color, fontSize, lineHeight, background,
}: Props) {
  const location = storeOf(pane)((s) => s.location);
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(rulerPositions[pane] ?? 33);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // the column of the band, px; none: across the page
  const [columnRect, setColumnRect] = useState<{ left: number; right: number } | null>(null);
  // px, the band: the lines and the room around them; 0 until measured
  const [bandSize, setBandSize] = useState(0);
  const [visible, setVisible] = useState(false);
  const [animate, setAnimate] = useState(false);

  const dragging = useRef(false);
  const dragOffset = useRef(0);
  const lastCfi = useRef<string | null>(null);
  const lastFraction = useRef<number | null>(null);
  const animateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const positionRef = useRef(position);
  const linesRef = useRef<LineBox[]>([]);
  const columnsRef = useRef<Column[]>([]);
  const columnIndex = useRef(0);
  // the text at the start of the band: the sections stay as the pages are laid
  // out again, so the band finds it again, and a relocate with it still shown is no page turned
  const anchor = useRef<Range | null>(null);
  const bandRef = useRef(0);
  const cacheCfi = useRef<string | null>(null);
  // scrolled: the view scrolled by a click past its end; the band then at the start (or the end) of the view
  const scrollAlign = useRef<Direction | null>(null);
  // scrolled: the band stays on the screen as it scrolls; placed once, again if the view is resized
  const placedAt = useRef(0);

  const columnCount = view()?.renderer.columnCount ?? 1;
  const multiColumn = !vertical && columnCount > 1;
  const text = { fontSize, lineHeight };
  const padding = rulerPadding(text);
  const fallbackSize = rulerSize(lines, text) + 2 * padding;
  // a tall image in the lines makes the band no larger
  const maxBand = rulerSize(lines + 1, text);
  const range = () => view()?.lastLocation?.range ?? null;

  const clamp = useCallback(
    (pos: number, dimension: number) => clampPosition(pos, dimension, bandRef.current || fallbackSize),
    [fallbackSize],
  );

  const setRulerPosition = useCallback((next: number, animated = false) => {
    if (animateTimer.current) clearTimeout(animateTimer.current);
    animateTimer.current = null;
    setAnimate(animated);
    setPosition(next);
    positionRef.current = next;
    rulerPositions[pane] = next;
    if (animated) {
      animateTimer.current = setTimeout(() => {
        setAnimate(false);
        animateTimer.current = null;
      }, 650);
    }
  }, [pane]);

  // the text at the start of the lines of the band; none there, none kept
  const captureAnchor = useCallback((start: number, end: number) => {
    const box = containerRef.current?.getBoundingClientRect();
    anchor.current = null;
    if (!box) return;
    // a few px in the first line
    const main = start + Math.min(10, Math.max(1, (end - start) / 2));
    const col = multiColumn ? columnsRef.current[columnIndex.current] : null;
    const crossStart = col?.left ?? 0;
    const crossEnd = col?.right ?? (vertical ? box.height : box.width);
    const docs = (view()?.renderer.getContents() ?? []).map((c) => c.doc).filter(Boolean);
    const primary = range()?.startContainer?.ownerDocument;
    if (primary && !docs.includes(primary)) docs.push(primary);
    // the middle of the line first, then off it, the line short
    for (const frac of [0.5, 0.3, 0.7]) {
      const cross = crossStart + (crossEnd - crossStart) * frac;
      const x = vertical ? (rtl ? box.width - main : main) : cross;
      const y = vertical ? cross : main;
      const found = charAt(docs, x + box.left, y + box.top);
      if (found) {
        anchor.current = found;
        return;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiColumn, vertical, rtl, view]);

  // the lines of the text anchored, where it is now; none if it is not shown (a page turned)
  const anchorBlock = useCallback((box: DOMRect): Block | null => {
    const kept = anchor.current;
    if (!kept?.startContainer?.ownerDocument?.defaultView) return null;
    try {
      const rects = rectsIn(kept, box);
      const r = rects.find((x) => x.width > 0 && x.height > 0) ?? rects[0];
      if (!r) return null;
      const cx = (r.left + r.right) / 2;
      const cy = (r.top + r.bottom) / 2;
      if (cx < 0 || cx > box.width || cy < 0 || cy > box.height) return null;
      const main = vertical ? (rtl ? box.width - cx : cx) : cy;
      return multiColumn ? snapColumnsToAnchor(main, cx, lines, columnsRef.current) : snapToAnchor(main, lines, linesRef.current);
    } catch {
      return null;
    }
  }, [vertical, rtl, lines, multiColumn]);

  // the band on lines: as large as they are and the room around, centered on them
  const applyBlock = useCallback((start: number, end: number, dimension: number, animated: boolean) => {
    const band = Math.min(end - start + 2 * padding, maxBand);
    bandRef.current = band;
    setBandSize(band);
    setRulerPosition(dimension > 0 ? ((start + end) / 2 / dimension) * 100 : positionRef.current, animated);
    captureAnchor(start, end);
  }, [padding, maxBand, setRulerPosition, captureAnchor]);

  const toColumn = (block: { columnIndex?: number }) => {
    if (block.columnIndex === undefined) return;
    columnIndex.current = block.columnIndex;
    const col = columnsRef.current[block.columnIndex];
    if (col) setColumnRect({ left: col.left, right: col.right });
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // the lines of the page, to move by; the band placed on them at first, and
  // again as the view is resized (a page turned: below)
  useEffect(() => {
    const pageRange = range();
    const box = containerRef.current?.getBoundingClientRect();
    const cfi = location?.cfi ?? null;
    const moved = cacheCfi.current !== null && cacheCfi.current !== cfi;
    cacheCfi.current = cfi;
    if (!pageRange || !box) {
      linesRef.current = [];
      columnsRef.current = [];
      setColumnRect(null);
      return;
    }
    try {
      const dimension = vertical ? box.width : box.height;
      const center = dimension > 0 ? (positionRef.current / 100) * dimension : 0;
      // from the start of the lines of the band, not its middle: in a line, forward would skip it
      const from = center - Math.max(0, (bandRef.current || fallbackSize) / 2 - padding);
      if (multiColumn) {
        const cols = pageColumns(view(), pageRange, box, columnCount, rtl);
        columnsRef.current = cols;
        linesRef.current = [];
        const index = Math.max(0, Math.min(columnIndex.current, cols.length - 1));
        setColumnRect(cols[index] ? { left: cols[index].left, right: cols[index].right } : null);
        if (!moved) {
          // the text anchored, not shown yet as the pages are laid out again: kept, for the relocate
          const block = anchor.current ? anchorBlock(box) : snapColumns(index, from, from, lines, 'forward', cols);
          if (block) {
            toColumn(block);
            applyBlock(block.start, block.end, dimension, false);
          }
        }
        return;
      }
      linesRef.current = scrolled ? scrolledLines(view(), box, vertical, rtl) : pageLines(pageRange, box, vertical, rtl);
      columnsRef.current = [];
      setColumnRect(null);
      // the band on the lines shown; the others, to scroll to
      const shown = scrolled ? visibleLines(linesRef.current, dimension) : linesRef.current;
      const pending = scrollAlign.current;
      if (pending) {
        scrollAlign.current = null;
        const block = pending === 'forward'
          ? snapToLines(-Infinity, -Infinity, lines, 'forward', shown)
          : snapToLines(Infinity, Infinity, lines, 'backward', shown);
        if (block) {
          applyBlock(block.start, block.end, dimension, true);
          placedAt.current = dimension;
        }
      } else if (!moved && !(scrolled && placedAt.current === dimension)) {
        const anchored = !scrolled && anchor.current;
        const block = anchored
          ? anchorBlock(box)
          : snapToLines(from, from, lines, 'forward', shown) ?? snapToLines(Infinity, Infinity, lines, 'backward', shown);
        if (block) {
          applyBlock(block.start, block.end, dimension, false);
          if (scrolled) placedAt.current = dimension;
        }
      }
    } catch {
      linesRef.current = [];
      columnsRef.current = [];
      setColumnRect(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, size.width, size.height, vertical, rtl, multiColumn, columnCount, lines, scrolled, applyBlock, anchorBlock]);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(timer);
  }, []);

  // a page turned: the band on its first lines, or its last, turned back
  useEffect(() => {
    if (!location || scrolled) return;
    const cfi = location.cfi;
    const fraction = location.fraction;
    const turned = lastCfi.current !== null && lastCfi.current !== cfi;
    const direction: Direction = lastFraction.current !== null && fraction < lastFraction.current ? 'backward' : 'forward';
    lastCfi.current = cfi;
    lastFraction.current = fraction;
    if (!turned) return;
    const frame = requestAnimationFrame(() => {
      const box = containerRef.current?.getBoundingClientRect();
      const dimension = box ? (vertical ? box.width : box.height) : 0;
      if (!box || dimension <= 0) return;
      // laid out again, the text still shown: on it
      const kept = anchorBlock(box);
      if (kept) {
        toColumn(kept);
        applyBlock(kept.start, kept.end, dimension, true);
        return;
      }
      const forward = direction === 'forward';
      if (multiColumn) {
        const cols = columnsRef.current;
        const block = forward
          ? snapColumns(0, -Infinity, -Infinity, lines, 'forward', cols)
          : snapColumns(cols.length - 1, Infinity, Infinity, lines, 'backward', cols);
        if (block) {
          toColumn(block);
          applyBlock(block.start, block.end, dimension, true);
          return;
        }
      } else {
        const pageRange = range();
        if (pageRange) {
          linesRef.current = pageLines(pageRange, box, vertical, rtl);
          const block = forward
            ? snapToLines(-Infinity, -Infinity, lines, 'forward', linesRef.current)
            : snapToLines(Infinity, Infinity, lines, 'backward', linesRef.current);
          if (block) {
            applyBlock(block.start, block.end, dimension, true);
            return;
          }
        }
      }
      // no lines: near the top
      anchor.current = null;
      bandRef.current = fallbackSize;
      setBandSize(fallbackSize);
      setRulerPosition(clamp(((44 + fallbackSize / 2) / dimension) * 100, dimension), true);
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, scrolled, vertical, rtl, multiColumn, lines, fallbackSize, applyBlock, anchorBlock, clamp, setRulerPosition]);

  useEffect(() => () => {
    if (animateTimer.current) clearTimeout(animateTimer.current);
  }, []);

  // the position along the way the band moves: written down the page right to left, from the right
  const pointerAt = (e: ReactPointerEvent, box: DOMRect) => {
    if (!vertical) return e.clientY - box.top;
    const fromLeft = e.clientX - box.left;
    return rtl ? box.width - fromLeft : fromLeft;
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;
    const box = containerRef.current?.getBoundingClientRect();
    // the band held where it is grabbed, not centered on the pointer
    dragOffset.current = box ? pointerAt(e, box) - (positionRef.current / 100) * (vertical ? box.width : box.height) : 0;
    setAnimate(false);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!dragging.current || !box) return;
    e.preventDefault();
    e.stopPropagation();
    const dimension = vertical ? box.width : box.height;
    const next = clamp(((pointerAt(e, box) - dragOffset.current) / dimension) * 100, dimension);
    setPosition(next);
    positionRef.current = next;
    rulerPositions[pane] = next;
  };

  // dragged, the band on other text: anchored to its first line
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    dragOffset.current = 0;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    const box = containerRef.current?.getBoundingClientRect();
    const dimension = box ? (vertical ? box.width : box.height) : 0;
    if (dimension <= 0) return;
    const center = (positionRef.current / 100) * dimension;
    const half = Math.max(0, (bandRef.current || fallbackSize) / 2 - padding);
    const boxes = multiColumn ? (columnsRef.current[columnIndex.current]?.lines ?? []) : linesRef.current;
    const first = boxes.find((b) => b.end > center - half && b.start < center + half);
    captureAnchor(first?.start ?? center - half, first?.end ?? center + half);
  };

  // resized: the band all in the view
  useEffect(() => {
    const dimension = vertical ? size.width : size.height;
    if (!dimension || dragging.current) return;
    const clamped = clamp(positionRef.current, dimension);
    if (clamped !== positionRef.current) setRulerPosition(clamped);
  }, [size.width, size.height, vertical, clamp, setRulerPosition]);

  // moved by a click on a side, or a key: to the next lines; false, none, the page turns
  useEffect(() => {
    const move = (direction: Direction) => {
      const el = containerRef.current;
      const dimension = el ? (vertical ? el.clientWidth : el.clientHeight) : 0;
      if (dragging.current || !dimension) return false;
      // the lines in the band, without the room around them
      const center = (positionRef.current / 100) * dimension;
      const half = Math.max(0, (bandRef.current || fallbackSize) / 2 - padding);
      const start = center - half;
      const end = center + half;
      if (multiColumn && columnsRef.current.length) {
        const block = snapColumns(columnIndex.current, start, end, lines, direction, columnsRef.current);
        if (!block) return false;
        toColumn(block);
        applyBlock(block.start, block.end, dimension, true);
        return true;
      }
      if (linesRef.current.length) {
        const block = snapToLines(start, end, lines, direction, linesRef.current);
        if (!block) {
          // scrolled: the view scrolls, the band then on its lines
          if (scrolled) scrollAlign.current = direction;
          return false;
        }
        // scrolled: the lines centered in the band; not all in the view, the view scrolls
        if (scrolled) {
          const bandHalf = (block.end - block.start) / 2 + padding;
          const blockCenter = (block.start + block.end) / 2;
          if (blockCenter - bandHalf < 0 || blockCenter + bandHalf > dimension) {
            scrollAlign.current = direction;
            return false;
          }
        }
        applyBlock(block.start, block.end, dimension, true);
        return true;
      }
      const next = stepPosition(positionRef.current, dimension, fallbackSize, direction);
      if (Math.abs(next - positionRef.current) < 0.001) return false;
      anchor.current = null;
      bandRef.current = fallbackSize;
      setBandSize(fallbackSize);
      setRulerPosition(next, true);
      return true;
    };
    setRulerMover(pane, move);
    return () => setRulerMover(pane, undefined);
  }, [pane, vertical, lines, padding, fallbackSize, multiColumn, scrolled, applyBlock, setRulerPosition]);

  const dimOpacity = Math.min(0.9, opacity);
  const band = bandSize > 0 ? bandSize : fallbackSize;
  const dimension = vertical ? size.width : size.height;
  // written down the page right to left, the position is from the right
  const renderPct = vertical && rtl ? 100 - position : position;
  const centerPx = (renderPct / 100) * dimension;
  const bandStart = Math.max(0, centerPx - band / 2);
  const bandEnd = Math.min(dimension, centerPx + band / 2);

  const tinted = color !== 'transparent';
  const filter = rulerFilter(color, opacity);
  const bandStyle = tinted ? { backdropFilter: filter, WebkitBackdropFilter: filter } : {};
  const outline = tinted ? '' : 'border border-base-content/50';
  const dim = { opacity: dimOpacity, ...(background ? { background } : {}) };
  const dimClass = `absolute pointer-events-none ${background ? '' : 'bg-base-100'}`;
  const transition = (moved: string[]) => (animate ? moved.map((p) => `${p} 0.6s ${EASE}`).join(', ') : 'none');
  const drag = { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };
  const handle = 'absolute pointer-events-auto touch-none';
  const handles = vertical
    ? [
      <div key="a" className={`${handle} inset-y-0 -left-2 w-4 cursor-col-resize`} {...drag} />,
      <div key="b" className={`${handle} inset-y-0 -right-2 w-4 cursor-col-resize`} {...drag} />,
    ]
    : [
      <div key="a" className={`${handle} inset-x-0 -top-2 h-4 cursor-row-resize`} {...drag} />,
      <div key="b" className={`${handle} inset-x-0 -bottom-2 h-4 cursor-row-resize`} {...drag} />,
    ];
  const root = `absolute inset-0 z-[5] pointer-events-none transition-opacity duration-150 ease-out ${visible ? 'opacity-100' : 'opacity-0'}`;

  if (vertical) {
    return (
      <div ref={containerRef} className={root} data-testid="reading-ruler" aria-hidden>
        <div className={`${dimClass} inset-y-0 left-0`} style={{ ...dim, width: bandStart, transition: transition(['width']) }} />
        <div className={`${dimClass} inset-y-0 right-0`} style={{ ...dim, width: size.width - bandEnd, transition: transition(['width']) }} />
        <div
          className={`absolute inset-y-0 my-2 rounded-2xl pointer-events-none ${outline}`}
          style={{ left: `${renderPct}%`, width: band, transform: 'translateX(-50%)', transition: transition(['left']), ...bandStyle }}
          data-testid="ruler-band"
        >
          {handles}
        </div>
      </div>
    );
  }

  if (columnRect) {
    // on one column: the other dimmed too
    const W = size.width;
    const top = Math.max(0, (position / 100) * size.height - band / 2);
    const bottom = Math.min(size.height, (position / 100) * size.height + band / 2);
    const height = Math.max(0, bottom - top);
    // the room around the lines, the same on the sides
    const left = Math.max(0, columnRect.left - padding);
    const right = Math.min(W, columnRect.right + padding);
    const moving = transition(['top', 'left', 'width', 'height']);
    return (
      <div ref={containerRef} className={root} data-testid="reading-ruler" aria-hidden>
        <div className={`${dimClass} inset-x-0 top-0`} style={{ ...dim, height: top, transition: transition(['height']) }} />
        <div className={`${dimClass} inset-x-0 bottom-0`} style={{ ...dim, height: size.height - bottom, transition: transition(['top', 'height']) }} />
        <div className={`${dimClass} left-0`} style={{ ...dim, top, height, width: left, transition: moving }} />
        <div className={`${dimClass} right-0`} style={{ ...dim, top, height, width: Math.max(0, W - right), transition: moving }} />
        <div
          className={`absolute rounded-2xl pointer-events-none ${outline}`}
          style={{ left, top, width: Math.max(0, right - left), height, transition: moving, ...bandStyle }}
          data-testid="ruler-band"
        >
          {handles}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={root} data-testid="reading-ruler" aria-hidden>
      <div className={`${dimClass} inset-x-0 top-0`} style={{ ...dim, height: bandStart, transition: transition(['height']) }} />
      <div className={`${dimClass} inset-x-0 bottom-0`} style={{ ...dim, height: size.height - bandEnd, transition: transition(['height']) }} />
      <div
        className={`absolute inset-x-0 mx-2 rounded-2xl pointer-events-none ${outline}`}
        style={{ top: `${position}%`, height: band, transform: 'translateY(-50%)', transition: transition(['top']), ...bandStyle }}
        data-testid="ruler-band"
      >
        {handles}
      </div>
    </div>
  );
}
