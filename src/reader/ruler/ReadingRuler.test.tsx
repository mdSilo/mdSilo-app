import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReaderStore, type ReaderLocation } from '../readerStore';
import type { FoliateView } from '../view';
import ReadingRuler from './ReadingRuler';
import { moveRuler, rulerPositions, type RulerColor } from './ruler';

// ported from readup's ReadingRuler tests

type TestRect = { top: number; bottom: number; left: number; right: number; width: number; height: number };

let range: unknown = null;
let contents: { doc: unknown }[] = [];
let columnCount = 1;
const fakeView = {
  renderer: { get columnCount() { return columnCount; }, getContents: () => contents },
  get lastLocation() { return { range }; },
} as unknown as FoliateView;
const view = () => fakeView;

/** lines of one column, in a section */
const lineRects = (count: number, pitch: number, height: number): TestRect[] =>
  Array.from({ length: count }, (_, i) => ({ top: i * pitch, bottom: i * pitch + height, left: 50, right: 750, width: 700, height }));

const frameAt = (left: number, top: number, width: number, height: number) => ({
  getBoundingClientRect: () => ({ x: left, y: top, left, top, right: left + width, bottom: top + height, width, height }) as DOMRect,
});

/** a section shown, scrolled by `top` */
function scrolledContents(top: number, rects: TestRect[]) {
  const doc: Record<string, unknown> = { body: {}, defaultView: { frameElement: frameAt(0, top, 800, 5000) } };
  doc.createRange = () => ({ startContainer: { ownerDocument: doc }, selectNodeContents: () => {}, getClientRects: () => rects });
  return [{ doc }];
}

/** a page of a section, at `left` */
function pageContent(left: number, width: number, rects: TestRect[]) {
  const doc: Record<string, unknown> = { body: {}, defaultView: { frameElement: frameAt(left, 0, width, 1000) } };
  const pageRange = { startContainer: { ownerDocument: doc }, selectNodeContents: () => {}, getClientRects: () => rects };
  doc.createRange = () => pageRange;
  return { doc, range: pageRange };
}

/** written down the page: three columns, right to left */
const verticalRange = () => ({
  startContainer: { ownerDocument: { defaultView: {} } },
  getClientRects: () => [
    { top: 50, bottom: 950, left: 760, right: 776, width: 16, height: 900 },
    { top: 50, bottom: 950, left: 400, right: 416, width: 16, height: 900 },
    { top: 50, bottom: 950, left: 40, right: 56, width: 16, height: 900 },
  ],
});

const setLocation = (cfi: string, fraction: number) =>
  act(() => useReaderStore.setState({ location: { cfi, fraction } as ReaderLocation }));

type Options = { vertical?: boolean; rtl?: boolean; scrolled?: boolean; lines?: number; color?: RulerColor };
const ruler = ({ vertical = false, rtl = false, scrolled = false, lines = 2, color = 'transparent' }: Options = {}) => (
  <ReadingRuler pane="main" view={view} vertical={vertical} rtl={rtl} scrolled={scrolled} lines={lines}
    opacity={0.5} color={color} fontSize={16} lineHeight={1.5} />
);

const band = (container: HTMLElement) => container.querySelector('[data-testid="ruler-band"]') as HTMLDivElement;
const forward = () => moveRuler('main', 'down', { vertical: false, key: false });

describe('ReadingRuler', () => {
  beforeEach(() => {
    range = null;
    contents = [];
    columnCount = 1;
    delete rulerPositions.main;
    useReaderStore.setState({ location: undefined });
    global.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} } as unknown as typeof ResizeObserver;
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 1000 });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      { x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 1000, width: 800, height: 1000 } as DOMRect,
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('lets the clicks through the band, but on its edges, to drag', () => {
    const { container } = render(ruler());
    expect(band(container).className).toContain('pointer-events-none');
    const handles = container.querySelectorAll('.cursor-row-resize');
    expect(handles).toHaveLength(2);
    handles.forEach((h) => expect(h.className).toContain('pointer-events-auto'));
  });

  it('steps by its size with no lines to go by', async () => {
    const { container } = render(ruler());
    // the band: 2 lines (48) and the room around them (2 × 7); 330 + 62 of 1000
    act(() => {
      expect(forward()).toBe(true);
    });
    await waitFor(() => expect(parseFloat(band(container).style.top)).toBeCloseTo(39.2, 5));
    expect(band(container).style.transition).toContain('top 0.6s');
  });

  it('is dragged from where it is held, not centered on the pointer', () => {
    const { container } = render(ruler());
    const top = container.querySelector('.cursor-row-resize') as HTMLDivElement;
    expect(band(container).style.top).toBe('33%');
    fireEvent.pointerDown(top, { pointerId: 1, clientY: 306 });
    fireEvent.pointerMove(top, { pointerId: 1, clientY: 316 });
    expect(band(container).style.top).toBe('34%');
  });

  it('turns the page at the end of the view', () => {
    // the most, for the band of 62 px in 1000
    rulerPositions.main = 96.9;
    render(ruler());
    expect(forward()).toBe(false);
  });

  it('goes to the top of a page turned', async () => {
    rulerPositions.main = 96.9;
    setLocation('epubcfi(/6/2!/4/2)', 0.1);
    const { container } = render(ruler());
    expect(parseFloat(band(container).style.top)).toBeCloseTo(96.9, 5);
    setLocation('epubcfi(/6/2!/4/18)', 0.11);
    await waitFor(() => expect(parseFloat(band(container).style.top)).toBeLessThan(20));
  });

  it('goes on in the next page of two side by side, of another section, before turning', async () => {
    columnCount = 2;
    const left = pageContent(0, 400, [{ top: 450, bottom: 490, left: 40, right: 360, width: 320, height: 40 }]);
    const right = pageContent(400, 400, [
      { top: 100, bottom: 140, left: 40, right: 360, width: 320, height: 40 },
      { top: 200, bottom: 240, left: 40, right: 360, width: 320, height: 40 },
    ]);
    const next = pageContent(800, 400, [{ top: 100, bottom: 140, left: 40, right: 360, width: 320, height: 40 }]);
    contents = [{ doc: left.doc }, { doc: right.doc }, { doc: next.doc }];
    range = left.range;
    rulerPositions.main = 47;
    const { container } = render(ruler({ lines: 1 }));
    const bandLeft = () => parseFloat(band(container).style.left);
    await waitFor(() => expect(bandLeft()).toBeLessThan(400));
    act(() => {
      expect(forward()).toBe(true);
    });
    await waitFor(() => expect(bandLeft()).toBeGreaterThan(400));
    act(() => {
      expect(forward()).toBe(true);
    });
    expect(forward()).toBe(false);
  });

  it('stays on the screen as the view scrolls', () => {
    range = {};
    contents = scrolledContents(0, lineRects(50, 100, 40));
    rulerPositions.main = 50;
    setLocation('page-1', 0.1);
    const { container } = render(ruler({ scrolled: true }));
    // placed on a line
    const before = parseFloat(band(container).style.top);
    expect(before).toBeGreaterThan(50);
    contents = scrolledContents(-130, lineRects(50, 100, 40));
    setLocation('page-1', 0.1);
    expect(parseFloat(band(container).style.top)).toBeCloseTo(before, 5);
  });

  it('scrolled, still moves by the lines', async () => {
    range = {};
    contents = scrolledContents(0, lineRects(50, 100, 40));
    rulerPositions.main = 50;
    const { container } = render(ruler({ scrolled: true }));
    const before = parseFloat(band(container).style.top);
    act(() => {
      expect(forward()).toBe(true);
    });
    await waitFor(() => expect(parseFloat(band(container).style.top)).toBeGreaterThan(before));
  });

  it('written down the page right to left, goes forward to the left', async () => {
    range = verticalRange();
    rulerPositions.main = 4;
    const { container } = render(ruler({ vertical: true, rtl: true, lines: 1 }));
    const bandLeft = () => parseFloat(band(container).style.left);
    // on the first column, on the right
    await waitFor(() => expect(bandLeft()).toBeGreaterThan(80));
    const before = bandLeft();
    act(() => {
      expect(forward()).toBe(true);
    });
    await waitFor(() => expect(bandLeft()).toBeLessThan(before));
  });

  it('written down the page left to right, goes forward to the right', async () => {
    range = verticalRange();
    rulerPositions.main = 4;
    const { container } = render(ruler({ vertical: true, lines: 1 }));
    const bandLeft = () => parseFloat(band(container).style.left);
    await waitFor(() => expect(bandLeft()).toBeLessThan(20));
    const before = bandLeft();
    act(() => {
      expect(forward()).toBe(true);
    });
    await waitFor(() => expect(bandLeft()).toBeGreaterThan(before));
  });

  it('stays on the same text as the pages are laid out again', async () => {
    // the line of the text anchored: at 300, then at 600
    const anchorRect = { top: 300, bottom: 340, left: 50, right: 750, width: 700, height: 40 };
    const doc: Record<string, unknown> = {};
    const anchor = {
      startContainer: { nodeType: 3, length: 20, ownerDocument: doc },
      startOffset: 0,
      setStart: () => {},
      setEnd: () => {},
      getClientRects: () => [anchorRect],
    };
    Object.assign(doc, { defaultView: {}, caretRangeFromPoint: () => anchor });
    const pageRange = (rects: TestRect[]) => ({ startContainer: { ownerDocument: doc }, getClientRects: () => rects });

    range = pageRange(lineRects(9, 100, 40));
    setLocation('epubcfi(/6/2!/4/2)', 0.1);
    const { container } = render(ruler());
    const top = () => parseFloat(band(container).style.top);
    // the lines at 300..440
    expect(top()).toBeCloseTo(37, 1);
    // laid out again: another place, back a little, as a page turned back would be
    anchorRect.top = 600;
    anchorRect.bottom = 640;
    range = pageRange(lineRects(9, 100, 40));
    setLocation('epubcfi(/6/2!/4/18)', 0.09);
    await waitFor(() => expect(top()).toBeCloseTo(67, 1));
  });

  it('tints the text in the band, or outlines it with no color', () => {
    const tinted = render(ruler({ color: 'yellow' }));
    expect(band(tinted.container).getAttribute('style')).toContain('sepia');
    expect(band(tinted.container).className).not.toContain('border');
    cleanup();
    const plain = render(ruler());
    expect(band(plain.container).getAttribute('style')).not.toContain('sepia');
    expect(band(plain.container).className).toContain('border-base-content/50');
  });
});
