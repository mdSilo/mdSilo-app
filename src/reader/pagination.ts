import type { FoliateView } from './view';
import type { Box } from './popups';

/**
 * Turning the pages: by a click on the sides of the page, the
 * wheel, the keys, the buttons of the bars. In scrolled flow a page is the
 * height shown, ending between two lines.
 */

export type Side = 'left' | 'right' | 'up' | 'down';
export type TurnMode = 'page' | 'section';

type Line = { start: number; end: number };

/**
 * The lines of the sections around the view, from its start along the scroll:
 * across the page from its top, down the page (columns) from its right.
 */
function linesAround(view: FoliateView, box: DOMRect, vertical: boolean): Line[] {
  const size = vertical ? box.width : box.height;
  const lines: Line[] = [];
  for (const { doc } of view.renderer.getContents()) {
    const frame = doc?.defaultView?.frameElement?.getBoundingClientRect();
    if (!frame || !doc.body) continue;
    // a section a view or more away: none of its lines to snap to
    const near = vertical
      ? frame.right > box.left - size && frame.left < box.right + size
      : frame.bottom > box.top - size && frame.top < box.bottom + size;
    if (!near) continue;
    const range = doc.createRange();
    range.selectNodeContents(doc.body);
    const rects = Array.from(range.getClientRects()).filter((r) => r.width > 2 && r.height > 2);
    // the boxes of the blocks too: the lines are those no thicker than most
    const thickness = (r: DOMRect) => (vertical ? r.width : r.height);
    const sorted = rects.map(thickness).sort((a, b) => a - b);
    const maxLine = (sorted[Math.floor(sorted.length / 2)] ?? 0) * 1.8;
    for (const r of rects) {
      if (thickness(r) > maxLine) continue;
      lines.push(vertical
        ? { start: box.right - (frame.left + r.right), end: box.right - (frame.left + r.left) }
        : { start: frame.top + r.top - box.top, end: frame.top + r.bottom - box.top });
    }
  }
  return lines;
}

/**
 * The distance to scroll by whole lines: the line cut at the end of the view
 * at the start of the next, or the line cut at its start at the end of the
 * one before; else the distance asked.
 */
function snapToLines(view: FoliateView, distance: number, forward: boolean): number {
  try {
    const container = view.renderer.shadowRoot?.querySelector('#container');
    if (!container) return distance;
    // foliate marks the text written down the page, scrolled across
    const vertical = container.classList.contains('vertical');
    const box = container.getBoundingClientRect();
    const size = vertical ? box.width : box.height;
    const lines = linesAround(view, box, vertical);
    if (lines.length < 2) return distance;
    let snapped: number;
    if (forward) {
      // the first line not all shown is the start of the next view
      const cut = lines.filter((l) => l.end > size + 1);
      if (!cut.length) return distance;
      snapped = Math.min(...cut.map((l) => l.start));
    } else {
      // the last line not all shown before is the end of the view before
      const cut = lines.filter((l) => l.start < -1);
      if (!cut.length) return distance;
      snapped = size - Math.max(...cut.map((l) => l.end));
    }
    return snapped > size * 0.4 && snapped < size * 1.6 ? snapped : distance;
  } catch {
    return distance;
  }
}

/** px a wheel step scrolls, by its mode: pixels, lines, pages of `page` px */
export const wheelPixels = (delta: number, mode: number, page: number) =>
  mode === 1 ? delta * 16 : mode === 2 ? delta * page : delta;

type Scroller = Pick<HTMLElement, 'scrollLeft' | 'scrollTop' | 'scrollWidth' | 'scrollHeight' | 'clientWidth' | 'clientHeight'>;

/** the part of the view a pan moves by: some of it still in view after */
const PAN = 0.85;

/**
 * A page larger than the view (fit to the width, zoomed in), turned to a
 * side: first panned there, across by the left and right if it is wider,
 * else down or up; at its edge, `axis` with no step, turned.
 */
export function panStep(el: Scroller, side: Side, back: boolean): { axis: 'x' | 'y'; left: number; top: number } {
  const across = side === 'left' || side === 'right';
  if (across && el.scrollWidth - el.clientWidth > 1) {
    const right = side === 'right';
    const room = right ? el.scrollWidth - el.clientWidth - el.scrollLeft : el.scrollLeft;
    const left = room > 1 ? (right ? 1 : -1) * Math.min(room, el.clientWidth * PAN) : 0;
    return { axis: 'x', left, top: 0 };
  }
  const room = back ? el.scrollTop : el.scrollHeight - el.clientHeight - el.scrollTop;
  const top = room > 1 ? (back ? -1 : 1) * Math.min(room, el.clientHeight * PAN) : 0;
  return { axis: 'y', left: 0, top };
}

/** Turn a page, or go to a section, to a side of the screen. */
export function turn(view: FoliateView | null, side: Side, mode: TurnMode = 'page') {
  if (!view?.renderer) return;
  const { renderer } = view;
  const rtl = view.book?.dir === 'rtl';
  // to the left is back, but in a book written right to left
  const back = side === 'up' || (side === 'left' ? !rtl : false) || (side === 'right' && rtl);
  if (mode === 'section') {
    return back ? renderer.prevSection?.() : renderer.nextSection?.();
  }
  if (view.isFixedLayout && renderer.scrolled) {
    // a page zoomed larger than the strip: panned across it first, by the other keys
    const horizontal = renderer.getAttribute('scroll-direction') === 'horizontal';
    const across = side === 'left' || side === 'right';
    // locked, the strip scrolled down is not panned across
    if (across !== horizontal && !(across && renderer.hasAttribute('lock-pan-x'))) {
      const step = panStep(renderer, side, back);
      if (step.axis === (across ? 'x' : 'y') && (step.left || step.top)) {
        renderer.scrollBy({ left: step.left, top: step.top, behavior: 'smooth' });
        return Promise.resolve();
      }
    }
    // along the strip, a view at a time
    return back ? view.prev() : view.next();
  }
  if (renderer.scrolled && renderer.size) {
    const distance = snapToLines(view, renderer.size, !back);
    return back ? view.prev(distance) : view.next(distance);
  }
  if (view.isFixedLayout) {
    const step = panStep(renderer, side, back);
    if (step.left || step.top) {
      renderer.scrollBy({ left: step.left, top: step.top, behavior: 'smooth' });
      return Promise.resolve();
    }
    if (step.axis === 'y' && renderer.scrollHeight - renderer.clientHeight > 1) {
      // the page before from its bottom, to read on up; the next from its top
      return (back ? view.prev() : view.next()).then(() => {
        renderer.scrollTop = back ? renderer.scrollHeight : 0;
      });
    }
  }
  return back ? view.prev() : view.next();
}

/**
 * What a click at `x` (in the window) of the page does: the middle shows the
 * bars, the sides turn the page.
 */
export function clickAction(
  x: number,
  box: { left: number; width: number },
  options: { clickToTurn: boolean; swap: boolean },
): 'bars' | 'left' | 'right' {
  const at = (x - box.left) / (box.width || 1);
  if (!options.clickToTurn || (at >= 0.375 && at <= 0.625)) return 'bars';
  const left = at < 0.5;
  return left !== options.swap ? 'left' : 'right';
}

/** ms a selection dragged rests at a corner of the page before the page turns */
export const DWELL_MS = 500;
/** the corners: a quarter of an ellipse, of this part of the page, up to CORNER_MAX_PX */
const CORNER_FRACTION = 0.15;
const CORNER_MAX_PX = 50;

/** The corner a selection is dragged to: at the 'end' of the page it turns forward, at the 'start' back. */
export type Corner = 'end' | 'start';
/** The corner armed, for its mark; `turned` once the page has turned. */
export type TurnHint = { corner: Corner; turned: boolean };

/**
 * The corner of the text of the page (`area`, in the window) a point of a
 * selection dragged is at: the bottom right ends the page
 * (the bottom left, in a book written right to left), the top left starts it.
 * A point dragged out of the page, past an edge, is at that end of it.
 */
export function cornerAt(
  point: { x: number; y: number },
  area: Box,
  rtl = false,
  view = { width: window.innerWidth, height: window.innerHeight },
): Corner | undefined {
  const width = area.right - area.left;
  const height = area.bottom - area.top;
  if (width <= 0 || height <= 0) return undefined;
  const local = point.x - area.left;
  const x = rtl ? width - local : local;
  const y = point.y - area.top;
  if (x < 0 || x > width || y < 0 || y > height) {
    // out of the window: not a pointer
    if (point.x < 0 || point.x > view.width || point.y < 0 || point.y > view.height) return undefined;
    return x > width || y > height ? 'end' : 'start';
  }
  const rx = Math.min(width * CORNER_FRACTION, CORNER_MAX_PX);
  const ry = Math.min(height * CORNER_FRACTION, CORNER_MAX_PX);
  const inCorner = (dx: number, dy: number) => (dx / rx) ** 2 + (dy / ry) ** 2 <= 1;
  if (inCorner(width - x, height - y)) return 'end';
  if (inCorner(x, y)) return 'start';
  return undefined;
}

/**
 * The page turned by a selection dragged to a corner, so it goes on in the
 * next page: once it rests there DWELL_MS, and once a stay; dragged out of
 * the corner and back, it turns again.
 */
export function cornerTurner(
  turnTo: (corner: Corner) => Promise<unknown> | void,
  onHint: (hint?: TurnHint) => void,
) {
  let engaged: Corner | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let turning = false;
  const stop = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  return {
    /** the corner the selection is dragged at now, if any */
    note(corner?: Corner) {
      if (turning || corner === engaged) return;
      stop();
      engaged = corner;
      onHint(corner && { corner, turned: false });
      if (!corner) return;
      timer = setTimeout(() => {
        timer = undefined;
        turning = true;
        onHint({ corner, turned: true });
        void Promise.resolve(turnTo(corner)).finally(() => {
          turning = false;
        });
      }, DWELL_MS);
    },
    /** the drag is over */
    cancel() {
      stop();
      if (engaged) onHint(undefined);
      engaged = undefined;
    },
  };
}

export type WheelSample = { deltaX: number; deltaY: number; deltaMode: number; timeStamp: number };

/**
 * One page turned by a gesture of the wheel: the travel adds up to a
 * threshold, then the rest of the gesture (the momentum of a touchpad) is
 * ignored until the wheel stops. A gesture that `scrolls` a page larger than
 * the view turns none, even once at its edge.
 */
export function wheelGesture({ threshold = 30, idleMs = 200 } = {}) {
  let x = 0;
  let y = 0;
  let last = -Infinity;
  let turned = false;
  const px = (delta: number, mode: number) => (mode === 1 ? delta * 40 : mode === 2 ? delta * 800 : delta);
  return (e: WheelSample, scrolls = false): Side | undefined => {
    if (e.timeStamp - last > idleMs) {
      x = y = 0;
      turned = false;
    }
    last = e.timeStamp;
    if (scrolls) turned = true;
    if (turned) return undefined;
    x += px(e.deltaX, e.deltaMode);
    y += px(e.deltaY, e.deltaMode);
    if (Math.abs(x) < threshold && Math.abs(y) < threshold) return undefined;
    turned = true;
    const side: Side = Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up');
    x = y = 0;
    return side;
  };
}

/** The wheel scrolls the page there, larger than the view: not at its edge on the way of the wheel. */
export function wheelScrolls(el: Scroller, deltaX: number, deltaY: number): boolean {
  if (Math.abs(deltaY) >= Math.abs(deltaX)) {
    if (deltaY > 0) return el.scrollHeight - el.clientHeight - el.scrollTop > 1;
    return deltaY < 0 && el.scrollTop > 1;
  }
  if (deltaX > 0) return el.scrollWidth - el.clientWidth - el.scrollLeft > 1;
  return el.scrollLeft > 1;
}

/** The zoom of a fixed layout by Ctrl (⌘) with +, - and 0: steps in or out, or back to the fit. */
export function zoomKey({ key, ctrlKey, metaKey, altKey }: Keys): number | 'reset' | undefined {
  if (!(ctrlKey || metaKey) || altKey) return undefined;
  if (key === '=' || key === '+') return 1;
  if (key === '-' || key === '_') return -1;
  if (key === '0') return 'reset';
  return undefined;
}

export type KeyAction =
  | { turn: Side; mode?: TurnMode }
  | { go: 'start' | 'end' | 'back' | 'forward' };

type Keys = { key: string; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean };

/** The keys of reading, as in readup. */
export function keyAction({ key, shiftKey, altKey, ctrlKey, metaKey }: Keys): KeyAction | undefined {
  if (ctrlKey || metaKey) return undefined;
  if (altKey) {
    if (key === 'ArrowLeft') return { go: 'back' };
    if (key === 'ArrowRight') return { go: 'forward' };
    if (key === 'ArrowUp') return { turn: 'up', mode: 'section' };
    if (key === 'ArrowDown') return { turn: 'down', mode: 'section' };
    return undefined;
  }
  if (shiftKey) {
    if (key === ' ') return { turn: 'up' };
    if (key === 'H' || key === 'ArrowLeft') return { go: 'back' };
    if (key === 'L' || key === 'ArrowRight') return { go: 'forward' };
    if (key === 'K' || key === 'ArrowUp') return { turn: 'up', mode: 'section' };
    if (key === 'J' || key === 'ArrowDown') return { turn: 'down', mode: 'section' };
    return undefined;
  }
  switch (key) {
    case 'ArrowLeft': case 'h': return { turn: 'left' };
    case 'ArrowRight': case 'l': return { turn: 'right' };
    case 'ArrowUp': case 'k': case 'PageUp': return { turn: 'up' };
    case 'ArrowDown': case 'j': case 'PageDown': case ' ': return { turn: 'down' };
    case 'Home': return { go: 'start' };
    case 'End': return { go: 'end' };
    default: return undefined;
  }
}

/** Do what a key asks. */
export function runKeyAction(view: FoliateView | null, action: KeyAction) {
  if (!view) return;
  if ('turn' in action) return turn(view, action.turn, action.mode);
  if (action.go === 'start') return view.goToFraction(0);
  if (action.go === 'end') return view.goToFraction(1);
  if (action.go === 'back') return view.history.back();
  return view.history.forward();
}

/** Where the reader is, as foliate-js says on `relocate`. */
export type PageInfo = { current: number; total: number };

export type Progress = {
  fraction: number;
  /** the section; for a fixed layout book (PDF, comics), its page */
  section?: PageInfo;
  /** of the book, by 1500 characters */
  location?: PageInfo;
  /** minutes left: in the section, in the book */
  time?: { section: number; total: number };
  /** the pages of the section shown, the page of it */
  page?: number;
  pages?: number;
};

/**
 * The progress shown below the text: what is left on the left, where the
 * reader is on the right.
 */
export function formatProgress(p: Progress | undefined, fixedLayout: boolean): { left: string; right: string } {
  if (!p) return { left: '', right: '' };
  const percent = `${Math.round(p.fraction * 100)}%`;
  if (fixedLayout) {
    if (!p.section?.total) return { left: '', right: percent };
    const left = p.section.total - p.section.current - 1;
    return {
      left: left > 0 ? `${left} ${left === 1 ? 'page' : 'pages'} left` : 'Last page',
      right: `${p.section.current + 1} / ${p.section.total} · ${percent}`,
    };
  }
  const parts: string[] = [];
  const minutes = p.time ? Math.round(p.time.section) : undefined;
  if (minutes !== undefined && minutes > 0) parts.push(`${formatMinutes(minutes)}`);
  if (p.pages && p.page !== undefined) {
    const left = Math.max(0, p.pages - p.page - 1);
    parts.push(left > 0 ? `${left} ${left === 1 ? 'page' : 'pages'}` : 'last page');
  }
  const loc = p.location?.total ? `${p.location.current + 1} / ${p.location.total} · ` : '';
  return { left: parts.join(' § '), right: `${loc}${percent}` };
}

export function formatMinutes(minutes: number): string {
  const m = Math.max(1, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}
