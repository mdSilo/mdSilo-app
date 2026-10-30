import {
  clickAction, cornerAt, cornerTurner, DWELL_MS, formatMinutes, formatProgress, keyAction, panStep, runKeyAction, turn,
  wheelGesture, wheelScrolls, zoomKey,
} from './pagination';
import { bookmarkAt } from './actions';
import { withDefaults } from './settings';
import { anchorOf } from './components/BookPopups';
import { pathTo } from './components/TocView';
import type { FoliateView } from './view';
import type { BookNote } from './annotations';

const viewOf = (dir = 'ltr', scrolled = false) => ({
  book: { dir },
  renderer: { scrolled, size: 0, prevSection: vi.fn(), nextSection: vi.fn() },
  prev: vi.fn(),
  next: vi.fn(),
  goToFraction: vi.fn(),
  history: { back: vi.fn(), forward: vi.fn() },
}) as unknown as FoliateView & {
  prev: ReturnType<typeof vi.fn>; next: ReturnType<typeof vi.fn>;
  renderer: { prevSection: ReturnType<typeof vi.fn>; nextSection: ReturnType<typeof vi.fn> };
};

describe('turning pages', () => {
  test('to a side, as the book is written', () => {
    const ltr = viewOf();
    turn(ltr, 'left');
    turn(ltr, 'down');
    expect(ltr.prev).toHaveBeenCalledTimes(1);
    expect(ltr.next).toHaveBeenCalledTimes(1);
    const rtl = viewOf('rtl');
    turn(rtl, 'left');
    expect(rtl.next).toHaveBeenCalled();
    turn(rtl, 'right', 'section');
    expect(rtl.renderer.prevSection).toHaveBeenCalled();
  });

  test('a click: the middle shows the bars, the sides turn', () => {
    const box = { left: 100, width: 800 };
    const options = { clickToTurn: true, swap: false };
    expect(clickAction(150, box, options)).toBe('left');
    expect(clickAction(500, box, options)).toBe('bars');
    expect(clickAction(850, box, options)).toBe('right');
    expect(clickAction(150, box, { ...options, swap: true })).toBe('right');
    expect(clickAction(150, box, { ...options, clickToTurn: false })).toBe('bars');
  });

  test('a gesture of the wheel turns one page', () => {
    const feed = wheelGesture();
    const at = (timeStamp: number, deltaY: number, deltaX = 0) => feed({ deltaX, deltaY, deltaMode: 0, timeStamp });
    expect(at(0, 10)).toBeUndefined();
    expect(at(16, 25)).toBe('down');
    // the momentum, then still
    expect(at(32, 40)).toBeUndefined();
    expect(at(100, 40)).toBeUndefined();
    expect(at(400, -50)).toBe('up');
    expect(at(800, 0, 60)).toBe('right');
    // lines, not pixels
    expect(feed({ deltaX: 0, deltaY: 1, deltaMode: 1, timeStamp: 1200 })).toBe('down');
  });

  test('the keys', () => {
    const k = (key: string, mods: Partial<Record<'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey', boolean>> = {}) =>
      keyAction({ key, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...mods });
    expect(k('ArrowRight')).toEqual({ turn: 'right' });
    expect(k(' ')).toEqual({ turn: 'down' });
    expect(k(' ', { shiftKey: true })).toEqual({ turn: 'up' });
    expect(k('ArrowDown', { altKey: true })).toEqual({ turn: 'down', mode: 'section' });
    expect(k('ArrowLeft', { altKey: true })).toEqual({ go: 'back' });
    expect(k('End')).toEqual({ go: 'end' });
    expect(k('f', { ctrlKey: true })).toBeUndefined();
    const view = viewOf();
    runKeyAction(view, { go: 'end' });
    expect(view.goToFraction).toHaveBeenCalledWith(1);
  });
});

describe('a fixed layout larger than the view', () => {
  /** a page 1000 high in a view 400 high, scrolled to `top`; as wide as the view, or twice */
  const page = (top: number, left = 0, wide = false) =>
    ({ scrollTop: top, scrollLeft: left, scrollHeight: 1000, clientHeight: 400, scrollWidth: wide ? 1200 : 600, clientWidth: 600 });

  test('panned to a side before it turns', () => {
    // fit to the width: down and up, across too
    expect(panStep(page(0), 'down', false)).toEqual({ axis: 'y', left: 0, top: 340 });
    expect(panStep(page(0), 'right', false)).toEqual({ axis: 'y', left: 0, top: 340 });
    // the rest of it, then at the edge
    expect(panStep(page(500), 'down', false).top).toBe(100);
    expect(panStep(page(600), 'down', false).top).toBe(0);
    expect(panStep(page(0), 'up', true).top).toBe(0);
    expect(panStep(page(300), 'left', true).top).toBe(-300);
    // zoomed in, wider: across by the left and right
    expect(panStep(page(0, 0, true), 'right', false)).toEqual({ axis: 'x', left: 510, top: 0 });
    expect(panStep(page(0, 600, true), 'right', false)).toEqual({ axis: 'x', left: 0, top: 0 });
    expect(panStep(page(0, 600, true), 'left', true).left).toBe(-510);
  });

  test('turned at the edge: the page before shown from its bottom', async () => {
    const renderer = { ...page(0), scrolled: false, scrollBy: vi.fn() };
    const view = { ...viewOf(), isFixedLayout: true, renderer } as unknown as ReturnType<typeof viewOf>;
    view.prev.mockResolvedValue(undefined);
    view.next.mockResolvedValue(undefined);
    await turn(view, 'down');
    expect(renderer.scrollBy).toHaveBeenCalledWith({ left: 0, top: 340, behavior: 'smooth' });
    expect(view.next).not.toHaveBeenCalled();
    await turn(view, 'up');
    expect(view.prev).toHaveBeenCalled();
    expect(renderer.scrollTop).toBe(1000);
    renderer.scrollTop = 600;
    await turn(view, 'down');
    expect(view.next).toHaveBeenCalled();
    expect(renderer.scrollTop).toBe(0);
  });

  test('the wheel scrolls it, and turns no page in that gesture', () => {
    expect(wheelScrolls(page(0), 0, 40)).toBe(true);
    expect(wheelScrolls(page(0), 0, -40)).toBe(false);
    expect(wheelScrolls(page(600), 0, 40)).toBe(false);
    expect(wheelScrolls(page(0), 40, 0)).toBe(false);
    expect(wheelScrolls(page(0, 0, true), 40, 0)).toBe(true);
    const feed = wheelGesture();
    const at = (timeStamp: number, scrolls: boolean) => feed({ deltaX: 0, deltaY: 50, deltaMode: 0, timeStamp }, scrolls);
    expect(at(0, true)).toBeUndefined();
    // at the edge, the momentum of the gesture
    expect(at(16, false)).toBeUndefined();
    // a new one
    expect(at(400, false)).toBe('down');
  });

  test('zoomed by Ctrl with +, - and 0', () => {
    const k = (key: string, ctrlKey = true) => zoomKey({ key, ctrlKey, metaKey: false, altKey: false, shiftKey: false });
    expect(k('=')).toBe(1);
    expect(k('+')).toBe(1);
    expect(k('-')).toBe(-1);
    expect(k('0')).toBe('reset');
    expect(k('=', false)).toBeUndefined();
    expect(k('f')).toBeUndefined();
  });
});

describe('a selection dragged over pages', () => {
  const area = { left: 100, top: 50, right: 900, bottom: 650 };
  const screen = { width: 1000, height: 700 };

  test('the corners of the text turn it: the end forward, the start back', () => {
    expect(cornerAt({ x: 890, y: 640 }, area, false, screen)).toBe('end');
    expect(cornerAt({ x: 110, y: 60 }, area, false, screen)).toBe('start');
    // the end of a line, or of the page, is not a corner
    expect(cornerAt({ x: 890, y: 300 }, area, false, screen)).toBeUndefined();
    expect(cornerAt({ x: 500, y: 640 }, area, false, screen)).toBeUndefined();
    // written right to left, the page ends at its bottom left
    expect(cornerAt({ x: 110, y: 640 }, area, true, screen)).toBe('end');
  });

  test('dragged out of the page, at the edge left', () => {
    expect(cornerAt({ x: 950, y: 300 }, area, false, screen)).toBe('end');
    expect(cornerAt({ x: 500, y: 680 }, area, false, screen)).toBe('end');
    expect(cornerAt({ x: 50, y: 300 }, area, false, screen)).toBe('start');
    // out of the window: not a pointer
    expect(cornerAt({ x: 1500, y: 300 }, area, false, screen)).toBeUndefined();
  });

  test('a page turned once it rests at a corner, once a stay', async () => {
    vi.useFakeTimers();
    const turnTo = vi.fn();
    const hints: unknown[] = [];
    const turner = cornerTurner(turnTo, (hint) => hints.push(hint));
    // passing by
    turner.note('end');
    await vi.advanceTimersByTimeAsync(DWELL_MS / 2);
    turner.note(undefined);
    await vi.advanceTimersByTimeAsync(DWELL_MS);
    expect(turnTo).not.toHaveBeenCalled();
    // resting
    turner.note('end');
    turner.note('end');
    await vi.advanceTimersByTimeAsync(DWELL_MS);
    expect(turnTo).toHaveBeenCalledWith('end');
    expect(hints.at(-1)).toEqual({ corner: 'end', turned: true });
    await vi.advanceTimersByTimeAsync(DWELL_MS * 3);
    expect(turnTo).toHaveBeenCalledTimes(1);
    // out and back: again
    turner.note(undefined);
    turner.note('end');
    await vi.advanceTimersByTimeAsync(DWELL_MS);
    expect(turnTo).toHaveBeenCalledTimes(2);
    // the drag over: no turn, no mark
    turner.note(undefined);
    turner.note('start');
    turner.cancel();
    await vi.advanceTimersByTimeAsync(DWELL_MS);
    expect(turnTo).toHaveBeenCalledTimes(2);
    expect(hints.at(-1)).toBeUndefined();
    vi.useRealTimers();
  });
});

describe('progress', () => {
  test('of a book reflowed: the time and pages left in the chapter, where in the book', () => {
    expect(formatProgress({
      fraction: 0.123, location: { current: 4, total: 120 }, time: { section: 12.4, total: 300 }, page: 2, pages: 6,
    }, false)).toEqual({ left: '12 min § 3 pages', right: '5 / 120 · 12%' });
    expect(formatProgress({ fraction: 0.5, page: 5, pages: 6 }, false)).toEqual({ left: 'last page', right: '50%' });
    expect(formatProgress(undefined, false)).toEqual({ left: '', right: '' });
  });

  test('of a fixed layout book: its pages', () => {
    expect(formatProgress({ fraction: 0.1, section: { current: 9, total: 100 } }, true))
      .toEqual({ left: '90 pages left', right: '10 / 100 · 10%' });
    expect(formatProgress({ fraction: 1, section: { current: 99, total: 100 } }, true).left).toBe('Last page');
  });

  test('minutes', () => {
    expect(formatMinutes(0.2)).toBe('1 min');
    expect(formatMinutes(59)).toBe('59 min');
    expect(formatMinutes(120)).toBe('2 h');
    expect(formatMinutes(135)).toBe('2 h 15 min');
  });
});

describe('the toolbar', () => {
  const root = { left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 } as DOMRect;

  test('under the text, or above it when there is no room below', () => {
    const below = anchorOf({ left: 400, top: 100, right: 600, bottom: 120 }, root, 380, 80);
    expect(below).toMatchObject({ dir: 'down', left: 310, offset: 132, arrow: 190 });
    const above = anchorOf({ left: 400, top: 700, right: 600, bottom: 760 }, root, 380, 80);
    expect(above).toMatchObject({ dir: 'up', offset: 112 });
  });

  test('kept in the page, its arrow at the text', () => {
    const anchor = anchorOf({ left: 960, top: 100, right: 990, bottom: 120 }, root, 380, 80);
    expect(anchor.left).toBe(612);
    expect(anchor.arrow).toBe(363);
  });
});

describe('bookmarks and contents', () => {
  const bookmark = (cfi: string): BookNote => ({
    id: cfi, type: 'bookmark', cfi, note: '', createdAt: '', updatedAt: '',
  });

  test('a bookmark in the page shown', () => {
    const page = 'epubcfi(/6/4!/4,/2/1:0,/10/1:20)';
    expect(bookmarkAt([bookmark('epubcfi(/6/4!/4/6/1:3)')], page)?.id).toBe('epubcfi(/6/4!/4/6/1:3)');
    expect(bookmarkAt([bookmark('epubcfi(/6/4!/4/12/1:0)')], page)).toBeUndefined();
    expect(bookmarkAt([bookmark(page)], page)?.id).toBe(page);
  });

  test('the items down to the chapter read', () => {
    const toc = [
      { label: 'One', href: 'a' },
      { label: 'Two', href: 'b', subitems: [{ label: 'Two.1', href: 'b#1' }] },
    ];
    expect(pathTo(toc, 'b#1')?.map((i) => i.label)).toEqual(['Two', 'Two.1']);
    expect(pathTo(toc, 'z')).toBeUndefined();
  });

  test('the colors of the highlights, completed', () => {
    const settings = withDefaults({ highlightColors: { underline: 'red' } as never });
    expect(settings.highlightColors).toEqual({ highlight: 'yellow', underline: 'red', squiggly: 'blue' });
  });
});
