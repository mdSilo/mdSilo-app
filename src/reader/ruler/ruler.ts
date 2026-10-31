import type { Pane } from '../view';
import type { Side } from '../pagination';

/**
 * The reading ruler (ported from readup): a band over a few lines of the
 * page, the rest dimmed. A click on the sides or the arrow keys move it to
 * the next lines, by the real lines of the text; past the last, the page turns.
 * Written down the page, the band stands across it and moves sideways.
 */

/** A line along the way the band moves, px: from the top; written down the page, from the start of the lines. */
export type LineBox = { start: number; end: number };
/** A column of the text, px across, and its lines. */
export type Column = { left: number; right: number; lines: LineBox[] };
export type Direction = 'backward' | 'forward';

type Rect = { top: number; bottom: number; left: number; right: number; width: number; height: number };

export type RulerColor = 'transparent' | 'yellow' | 'green' | 'blue' | 'rose';
export const RULER_COLORS: RulerColor[] = ['transparent', 'yellow', 'green', 'blue', 'rose'];
/** the swatches of the settings */
export const RULER_SWATCHES: Record<RulerColor, string> = {
  transparent: 'transparent', yellow: '#facc15', green: '#4ade80', blue: '#60a5fa', rose: '#fb7185',
};

/** the tint of the band: of the text under it, by a filter of the backdrop */
export const rulerFilter = (color: RulerColor, opacity: number) => {
  const hue = { yellow: 0, green: 70, blue: 135, rose: 225 }[color as Exclude<RulerColor, 'transparent'>] ?? 0;
  return `sepia(${opacity}) saturate(2) hue-rotate(${hue}deg) brightness(1)`;
};

/**
 * The rects of a range are of its lines and of the blocks it holds: the
 * blocks are thicker than most, the lines being many.
 */
function dropBlocks(rects: Rect[], vertical: boolean): Rect[] {
  const valid = rects.filter((r) => r && r.width > 0 && r.height > 0);
  if (valid.length < 3) return valid;
  const thickness = (r: Rect) => (vertical ? r.width : r.height);
  const median = valid.map(thickness).sort((a, b) => a - b)[Math.floor(valid.length / 2)] ?? 0;
  if (median <= 0) return valid;
  return valid.filter((r) => thickness(r) <= median * 1.8);
}

/** The pieces of the lines as lines: those over more than half of the smaller one are one. */
function mergeLines(spans: LineBox[]): LineBox[] {
  spans.sort((a, b) => a.start - b.start || a.end - b.end);
  const lines: LineBox[] = [];
  for (const span of spans) {
    const current = lines[lines.length - 1];
    if (current) {
      const overlap = Math.min(current.end, span.end) - Math.max(current.start, span.start);
      if (overlap > 0.5 * Math.min(current.end - current.start, span.end - span.start)) {
        current.start = Math.min(current.start, span.start);
        current.end = Math.max(current.end, span.end);
        continue;
      }
    }
    lines.push({ start: span.start, end: span.end });
  }
  return lines;
}

/**
 * The lines of rects in the box of the ruler: from its top; written down the
 * page, from its right (lines right to left) or its left.
 */
export function lineBoxesOf(rects: Rect[], vertical: boolean, rtl: boolean, box: { top: number; left: number; right: number }): LineBox[] {
  const spans = dropBlocks(rects, vertical).map((r) => {
    let start = vertical ? (rtl ? box.right - r.right : r.left - box.left) : r.top - box.top;
    let end = vertical ? (rtl ? box.right - r.left : r.right - box.left) : r.bottom - box.top;
    if (end < start) [start, end] = [end, start];
    return { start, end };
  });
  return mergeLines(spans);
}

/** The lines at least half shown in `size` px; the range of a page has some beyond it. */
export function visibleLines(lines: LineBox[], size: number): LineBox[] {
  if (size <= 0) return lines;
  return lines.filter((b) => {
    const height = b.end - b.start;
    return height > 0 && Math.min(b.end, size) - Math.max(b.start, 0) >= 0.5 * height;
  });
}

/** The columns of rects in the box (`width` px, `count` columns), and their lines; in the order read. */
export function columnsOf(rects: Rect[], count: number, width: number, rtl: boolean): Column[] {
  const cols = Math.max(1, Math.floor(count));
  if (width <= 0) return [];
  const buckets: Rect[][] = Array.from({ length: cols }, () => []);
  for (const r of dropBlocks(rects, false)) {
    const at = Math.floor((r.left + r.right) / 2 / (width / cols));
    buckets[Math.max(0, Math.min(cols - 1, at))].push(r);
  }
  const columns: Column[] = [];
  for (const bucket of buckets) {
    if (!bucket.length) continue;
    const lines = mergeLines(bucket.map((r) => ({ start: r.top, end: r.bottom })));
    columns.push({ left: Math.min(...bucket.map((r) => r.left)), right: Math.max(...bucket.map((r) => r.right)), lines });
  }
  return rtl ? columns.reverse() : columns;
}

type Text = { fontSize: number; lineHeight: number };

/** px, `lines` lines of the text */
export const rulerSize = (lines: number, { fontSize, lineHeight }: Text) =>
  Math.round(lines * (fontSize || 16) * (lineHeight || 1.5));

/** px, the room around the lines in the band: a third of a line, about */
export const rulerPadding = ({ fontSize, lineHeight }: Text) =>
  Math.round((fontSize || 16) * (lineHeight || 1.5) * 0.3);

/** The center of the band, % of `size` px, so the band of `band` px is all in it. */
export function clampPosition(position: number, size: number, band: number): number {
  if (size <= 0) return Math.max(0, Math.min(100, position));
  const half = (band / 2 / size) * 100;
  if (half >= 50) return 50;
  return Math.max(half, Math.min(100 - half, position));
}

/** The band moved by its size, with no lines to go by. */
export function stepPosition(position: number, size: number, band: number, direction: Direction): number {
  if (size <= 0) return clampPosition(position, size, band);
  const center = (position / 100) * size + (direction === 'forward' ? band : -band);
  return clampPosition((center / size) * 100, size, band);
}

function medianHeight(lines: LineBox[]) {
  const heights = lines.map((b) => b.end - b.start).filter((h) => h > 0).sort((a, b) => a - b);
  return heights[Math.floor(heights.length / 2)] ?? 0;
}

/**
 * The next (or previous) `count` lines after those from `start` to `end`;
 * none past the last (the page turns then). From -Infinity, the first lines;
 * back from Infinity, the last.
 */
export function snapToLines(start: number, end: number, count: number, direction: Direction, lines: LineBox[]): LineBox | null {
  if (!lines.length) return null;
  const n = Math.max(1, Math.floor(count));
  const eps = medianHeight(lines) * 0.3;
  const block = (from: number, to: number) => ({ start: lines[from].start, end: lines[to].end });
  if (direction === 'forward') {
    const from = lines.findIndex((b) => b.start >= end - eps);
    return from < 0 ? null : block(from, Math.min(from + n - 1, lines.length - 1));
  }
  let to = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].end <= start + eps) {
      to = i;
      break;
    }
  }
  return to < 0 ? null : block(Math.max(to - n + 1, 0), to);
}

/** snapToLines in a column, else on in the next (or back in the previous) column. */
export function snapColumns(
  index: number, start: number, end: number, count: number, direction: Direction, columns: Column[],
): { columnIndex: number; start: number; end: number } | null {
  if (!columns.length) return null;
  const at = Math.max(0, Math.min(index, columns.length - 1));
  const within = snapToLines(start, end, count, direction, columns[at].lines);
  if (within) return { columnIndex: at, ...within };
  const forward = direction === 'forward';
  for (let j = forward ? at + 1 : at - 1; forward ? j < columns.length : j >= 0; j += forward ? 1 : -1) {
    const edge = forward ? -Infinity : Infinity;
    const block = snapToLines(edge, edge, count, direction, columns[j].lines);
    if (block) return { columnIndex: j, ...block };
  }
  return null;
}

/**
 * The `count` lines from the line at `at` px, or near it (half a line); for
 * the band on the same text after the pages are laid out again.
 */
export function snapToAnchor(at: number, count: number, lines: LineBox[]): LineBox | null {
  if (!lines.length) return null;
  let index = lines.findIndex((b) => at >= b.start && at <= b.end);
  if (index < 0) {
    let best = Infinity;
    lines.forEach((b, i) => {
      const dist = at < b.start ? b.start - at : at - b.end;
      if (dist < best) {
        best = dist;
        index = i;
      }
    });
    if (index < 0 || best > medianHeight(lines) * 0.5) return null;
  }
  return { start: lines[index].start, end: lines[Math.min(index + Math.max(1, Math.floor(count)) - 1, lines.length - 1)].end };
}

/** snapToAnchor in the column at `across` px, or the nearest. */
export function snapColumnsToAnchor(
  at: number, across: number, count: number, columns: Column[],
): { columnIndex: number; start: number; end: number } | null {
  let columnIndex = -1;
  let best = Infinity;
  columns.forEach((c, i) => {
    const dist = across < c.left ? c.left - across : across > c.right ? across - c.right : 0;
    if (dist < best) {
      best = dist;
      columnIndex = i;
    }
  });
  const block = columnIndex < 0 ? null : snapToAnchor(at, count, columns[columnIndex].lines);
  return block ? { columnIndex, ...block } : null;
}

/** Written down the page, the arrows left and right turn the page, not the ruler; a click on a side moves it. */
export const isRulerKey = (side: Side, vertical: boolean) => !vertical || side === 'up' || side === 'down';

/** The way of a side: to the left is back, but in a book written right to left. */
export function moveDirection(side: Side, dir?: string): Direction {
  const left = side === 'left' ? dir !== 'rtl' : side === 'right' ? dir === 'rtl' : side === 'up';
  return left ? 'backward' : 'forward';
}

/** %, the center of the band last, of each pane: the ruler shown again starts there */
export const rulerPositions: Partial<Record<Pane, number>> = {};

/** The ruler shown, of each pane: it moves, or not (none to move to: the page turns). */
const movers: Partial<Record<Pane, (direction: Direction) => boolean>> = {};

export const setRulerMover = (pane: Pane, mover?: (direction: Direction) => boolean) => {
  movers[pane] = mover;
};

/** The ruler of the pane moved to a side, by a click or a key; false: the page to turn. */
export function moveRuler(pane: Pane, side: Side, opts: { dir?: string; vertical: boolean; key: boolean }): boolean {
  const mover = movers[pane];
  if (!mover || (opts.key && !isRulerKey(side, opts.vertical))) return false;
  return mover(moveDirection(side, opts.dir));
}
