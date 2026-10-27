import type { FoliateView } from './view';

/**
 * Turning the pages, as readup does: by a click on the sides of the page, the
 * wheel, the keys, the buttons of the bars. In scrolled flow a page is the
 * height shown, ending between two lines.
 */

export type Side = 'left' | 'right' | 'up' | 'down';
export type TurnMode = 'page' | 'section';

/** The lines of the text in view, to scroll by whole lines; or the distance asked. */
function snapToLines(view: FoliateView, distance: number, forward: boolean): number {
  try {
    const visible = view.renderer.getContents().find(({ doc }) => {
      const frame = doc?.defaultView?.frameElement?.getBoundingClientRect();
      return Boolean(frame && frame.bottom > 1 && frame.top < window.innerHeight);
    });
    const frame = visible?.doc.defaultView?.frameElement as HTMLElement | undefined;
    if (!visible || !frame) return distance;
    let container: HTMLElement | null = frame;
    while (container && container.id !== 'container') container = container.parentElement;
    if (!container) return distance;
    const box = container.getBoundingClientRect();
    const frameBox = frame.getBoundingClientRect();
    const size = box.height;
    const scrollTop = container.scrollTop;
    const range = visible.doc.createRange();
    range.selectNodeContents(visible.doc.body);
    const rects = Array.from(range.getClientRects()).filter((r) => r.width > 2 && r.height > 2);
    if (rects.length < 2) return distance;
    const heights = rects.map((r) => r.height).sort((a, b) => a - b);
    const maxLine = (heights[Math.floor(heights.length / 2)] ?? 0) * 1.8;
    const toContent = (y: number) => y + frameBox.top - box.top + scrollTop;
    const lines = rects
      .filter((r) => r.height <= maxLine)
      .map((r) => ({ top: toContent(r.top), bottom: toContent(r.bottom) }))
      .sort((a, b) => a.top - b.top);
    let snapped: number;
    if (forward) {
      // the first line not all shown is the top of the next view
      const next = lines.find((l) => l.bottom > scrollTop + size + 1);
      if (!next) return distance;
      snapped = next.top - scrollTop;
    } else {
      // the last line not all shown above is the bottom of the view before
      const prev = [...lines].reverse().find((l) => l.top < scrollTop - 1);
      if (!prev) return distance;
      snapped = scrollTop + size - prev.bottom;
    }
    return snapped > size * 0.4 && snapped < size * 1.6 ? snapped : distance;
  } catch {
    return distance;
  }
}

/** Turn a page, or go to a section, to a side of the screen. */
export function turn(view: FoliateView | null, side: Side, mode: TurnMode = 'page') {
  if (!view?.renderer) return;
  const rtl = view.book?.dir === 'rtl';
  // to the left is back, but in a book written right to left
  const back = side === 'up' || (side === 'left' ? !rtl : false) || (side === 'right' && rtl);
  if (mode === 'section') {
    return back ? view.renderer.prevSection?.() : view.renderer.nextSection?.();
  }
  if (view.renderer.scrolled && view.renderer.size) {
    const distance = snapToLines(view, view.renderer.size, !back);
    return back ? view.prev(distance) : view.next(distance);
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

export type WheelSample = { deltaX: number; deltaY: number; deltaMode: number; timeStamp: number };

/**
 * One page turned by a gesture of the wheel: the travel adds up to a
 * threshold, then the rest of the gesture (the momentum of a touchpad) is
 * ignored until the wheel stops.
 */
export function wheelGesture({ threshold = 30, idleMs = 200 } = {}) {
  let x = 0;
  let y = 0;
  let last = -Infinity;
  let turned = false;
  const px = (delta: number, mode: number) => (mode === 1 ? delta * 40 : mode === 2 ? delta * 800 : delta);
  return (e: WheelSample): Side | undefined => {
    if (e.timeStamp - last > idleMs) {
      x = y = 0;
      turned = false;
    }
    last = e.timeStamp;
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
  if (minutes !== undefined && minutes > 0) parts.push(`${formatMinutes(minutes)} left in chapter`);
  if (p.pages && p.page !== undefined) {
    const left = Math.max(0, p.pages - p.page - 1);
    parts.push(left > 0 ? `${left} ${left === 1 ? 'page' : 'pages'}` : 'last page');
  }
  const loc = p.location?.total ? `${p.location.current + 1} / ${p.location.total} · ` : '';
  return { left: parts.join(' · '), right: `${loc}${percent}` };
}

export function formatMinutes(minutes: number): string {
  const m = Math.max(1, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}
