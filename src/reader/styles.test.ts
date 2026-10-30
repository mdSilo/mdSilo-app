import { applyLayout, pageLayout, setBookDir, setSpread, writingModeStyles } from './styles';
import { DEFAULT_READER_SETTINGS, MAX_ZOOM, MIN_ZOOM, zoomBy } from './settings';
import type { BookDoc } from './document';
import type { FoliateView } from './view';

const bookOf = (dir = 'ltr') => ({
  dir,
  rendition: { layout: 'pre-paginated' },
  sections: [{ id: 'cover' }, { id: 'p1' }],
}) as unknown as BookDoc;

/** a renderer of a fixed layout: its attributes, and each set */
function fixedView(book: BookDoc) {
  const renderer = document.createElement('div');
  const set = vi.spyOn(renderer, 'setAttribute');
  return { view: { book, renderer, isFixedLayout: true } as unknown as FoliateView, renderer, set };
}

describe('a fixed layout', () => {
  test('the spreads set before it opens: the cover alone, or the left page of the first spread', () => {
    const book = bookOf();
    setSpread(book, DEFAULT_READER_SETTINGS);
    expect(book.rendition?.spread).toBe('auto');
    expect(book.sections[0].pageSpread).toBe('');
    setSpread(book, { ...DEFAULT_READER_SETTINGS, spreadMode: 'none', separateCover: false });
    expect(book.rendition?.spread).toBe('none');
    expect(book.sections[0].pageSpread).toBe('left');
    const rtl = bookOf('rtl');
    setSpread(rtl, { ...DEFAULT_READER_SETTINGS, separateCover: false });
    expect(rtl.sections[0].pageSpread).toBe('right');
    // a book reflowed: as it is
    const reflowed = { ...bookOf(), rendition: { layout: 'reflowable' } } as BookDoc;
    setSpread(reflowed, DEFAULT_READER_SETTINGS);
    expect(reflowed.rendition?.spread).toBeUndefined();
  });

  test('the zoom and the spreads set on the renderer, only as they change', () => {
    const book = bookOf();
    setSpread(book, DEFAULT_READER_SETTINGS);
    const { view, renderer, set } = fixedView(book);
    applyLayout(view, DEFAULT_READER_SETTINGS);
    expect(renderer.getAttribute('zoom')).toBe('fit-page');
    expect(renderer.getAttribute('scale-factor')).toBe('100');
    expect(renderer.getAttribute('spread')).toBe('auto');
    expect(renderer.getAttribute('flow')).toBe('paginated');

    // each renders the pages again: not set again
    set.mockClear();
    applyLayout(view, DEFAULT_READER_SETTINGS);
    expect(set.mock.calls.map(([name]) => name)).toEqual(['flow']);

    set.mockClear();
    applyLayout(view, { ...DEFAULT_READER_SETTINGS, zoomMode: 'fit-width', zoomLevel: 150 });
    expect(set).toHaveBeenCalledWith('zoom', 'fit-width');
    expect(set).toHaveBeenCalledWith('scale-factor', '150');
    expect(set).not.toHaveBeenCalledWith('spread', expect.anything());

    // the cover paired: the spreads made again, the mode the same
    set.mockClear();
    applyLayout(view, { ...DEFAULT_READER_SETTINGS, separateCover: false });
    expect(book.sections[0].pageSpread).toBe('left');
    expect(set).toHaveBeenCalledWith('spread', 'auto');
  });

  test('scrolled across, a webtoon, the panning locked: the direction set before the flow', () => {
    const book = bookOf();
    const { view, renderer, set } = fixedView(book);
    applyLayout(view, DEFAULT_READER_SETTINGS);
    expect(renderer.getAttribute('scroll-direction')).toBe('vertical');
    expect(renderer.getAttribute('scroll-gap')).toBe('4');
    expect(renderer.hasAttribute('lock-pan-x')).toBe(false);

    set.mockClear();
    applyLayout(view, { ...DEFAULT_READER_SETTINGS, flow: 'scrolled', scrollDirection: 'horizontal' });
    // the strip built once, on its axis
    expect(set.mock.calls.map(([name]) => name)).toEqual(['scroll-direction', 'flow']);
    expect(renderer.getAttribute('flow')).toBe('scrolled');

    applyLayout(view, { ...DEFAULT_READER_SETTINGS, flow: 'scrolled', webtoon: true, lockPanX: true });
    expect(renderer.getAttribute('scroll-direction')).toBe('vertical');
    expect(renderer.getAttribute('scroll-gap')).toBe('0');
    expect(renderer.hasAttribute('lock-pan-x')).toBe(true);
    applyLayout(view, DEFAULT_READER_SETTINGS);
    expect(renderer.hasAttribute('lock-pan-x')).toBe(false);
  });

  test('zoomed by steps, within the bounds', () => {
    expect(zoomBy(100, 1)).toBe(110);
    expect(zoomBy(100, -0.25)).toBe(98);
    expect(zoomBy(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(zoomBy(MIN_ZOOM + 5, -1)).toBe(MIN_ZOOM);
  });
});

describe('the writing of a book', () => {
  test('the CSS of the writing chosen: none as the book says', () => {
    expect(writingModeStyles('auto')).toBe('');
    expect(writingModeStyles('vertical-rl')).toContain('writing-mode: vertical-rl !important');
    expect(writingModeStyles('vertical-lr')).toContain('writing-mode: vertical-lr !important');
    expect(writingModeStyles('vertical-lr')).not.toContain('direction');
    expect(writingModeStyles('horizontal-tb')).toContain('direction: ltr !important');
    const rtl = writingModeStyles('horizontal-rtl');
    expect(rtl).toContain('writing-mode: horizontal-tb !important');
    expect(rtl).toContain('direction: rtl !important');
  });

  test('the pages turn as the writing chosen, and as the book says again', () => {
    const book = { dir: 'ltr', sections: [] } as unknown as BookDoc;
    setBookDir(book, 'vertical-rl');
    expect(book.dir).toBe('rtl');
    setBookDir(book, 'vertical-lr');
    expect(book.dir).toBe('ltr');
    setBookDir(book, 'horizontal-rtl');
    expect(book.dir).toBe('rtl');
    setBookDir(book, 'auto');
    expect(book.dir).toBe('ltr');
    const rtl = { dir: 'rtl', sections: [] } as unknown as BookDoc;
    setBookDir(rtl, 'horizontal-tb');
    expect(rtl.dir).toBe('ltr');
    setBookDir(rtl, 'auto');
    expect(rtl.dir).toBe('rtl');
  });

  test('across the page: the margins above and below; scrolled, the view between them', () => {
    const settings = { ...DEFAULT_READER_SETTINGS, margin: 40 };
    expect(pageLayout(settings, false)).toEqual({
      inset: { top: 0, right: 0, bottom: 0, left: 0 },
      margins: { top: 40, right: 48, bottom: 40, left: 48 },
    });
    expect(pageLayout({ ...settings, flow: 'scrolled' }, false).inset).toEqual({ top: 40, right: 0, bottom: 40, left: 0 });
    expect(pageLayout(settings, false, true).inset).toEqual({ top: 40, right: 0, bottom: 40, left: 0 });
  });

  test('down the page: the margins on the sides, room for the bands in the double border', () => {
    const settings = { ...DEFAULT_READER_SETTINGS, margin: 40, doubleBorder: false };
    expect(pageLayout(settings, true).margins).toMatchObject({ right: 40, left: 40 });
    const framed = pageLayout({ ...settings, doubleBorder: true }, true).margins;
    expect(framed.right).toBeGreaterThan(17 + 32);
    expect(framed.left).toBe(framed.right);
    // no chapter: no band for it
    expect(pageLayout({ ...settings, doubleBorder: true, showHeader: false }, true).margins.right).toBeLessThan(framed.right - 31);
    // scrolled: the view between the bands
    const scrolled = pageLayout({ ...settings, doubleBorder: true, flow: 'scrolled' }, true);
    expect(scrolled.inset).toMatchObject({ top: 0, bottom: 0, left: framed.left, right: framed.right });
    expect(scrolled.margins).toMatchObject({ left: 0, right: 0 });
  });

  test('the margins set on the renderer, of the text across or down', () => {
    const renderer = document.createElement('div');
    const view = { renderer, isFixedLayout: false } as unknown as FoliateView;
    applyLayout(view, { ...DEFAULT_READER_SETTINGS, doubleBorder: false }, true);
    expect(renderer.getAttribute('margin-left')).toBe(`${DEFAULT_READER_SETTINGS.margin}px`);
    applyLayout(view, DEFAULT_READER_SETTINGS);
    expect(renderer.getAttribute('margin-top')).toBe(`${DEFAULT_READER_SETTINGS.margin}px`);
    expect(renderer.getAttribute('margin-left')).toBe('48px');
  });
});
