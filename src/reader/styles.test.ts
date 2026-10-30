import { applyLayout, setSpread } from './styles';
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

  test('zoomed by steps, within the bounds', () => {
    expect(zoomBy(100, 1)).toBe(110);
    expect(zoomBy(100, -0.25)).toBe(98);
    expect(zoomBy(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(zoomBy(MIN_ZOOM + 5, -1)).toBe(MIN_ZOOM);
  });
});
