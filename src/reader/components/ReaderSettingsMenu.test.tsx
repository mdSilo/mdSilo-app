import { fireEvent, render, screen } from '@testing-library/react';
import { store } from '@/state/store';
import { DEFAULT_READER_SETTINGS, withDefaults } from '../settings';
import { useReaderStore } from '../readerStore';
import type { BookDoc } from '../document';
import ReaderSettingsMenu from './ReaderSettingsMenu';

const settings = () => withDefaults(store.getState().readerSettings);

describe('the settings of a fixed layout', () => {
  beforeEach(() => store.getState().setReaderSettings(DEFAULT_READER_SETTINGS));

  test('the zoom, the fit, the spreads and the cover', () => {
    render(<ReaderSettingsMenu fixedLayout />);
    // not of the text
    expect(screen.queryByText('Font size')).not.toBeInTheDocument();
    // the language to translate to: chosen in the popup of a translation, not here
    expect(screen.queryByText('Translate to')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Zoom in'));
    fireEvent.click(screen.getByLabelText('Zoom in'));
    expect(settings().zoomLevel).toBe(120);
    expect(screen.getByLabelText('Reset zoom')).toHaveTextContent('120%');
    fireEvent.click(screen.getByLabelText('Zoom out'));
    expect(settings().zoomLevel).toBe(110);
    fireEvent.click(screen.getByLabelText('Reset zoom'));
    expect(settings().zoomLevel).toBe(100);

    fireEvent.click(screen.getByText('Width'));
    expect(settings().zoomMode).toBe('fit-width');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Cover page alone' }));
    expect(settings().separateCover).toBe(false);
    fireEvent.click(screen.getByText('One page'));
    expect(settings().spreadMode).toBe('none');
    // the cover alone in spreads only
    expect(screen.queryByText('Cover page alone')).not.toBeInTheDocument();

    // scrolled: no spreads, the pages fit the strip
    fireEvent.click(screen.getByText('Vertical'));
    expect(settings()).toMatchObject({ flow: 'scrolled', scrollDirection: 'vertical' });
    expect(screen.queryByText('One page')).not.toBeInTheDocument();
    expect(screen.queryByText('Width')).not.toBeInTheDocument();
  });

  test('scrolled down or across, a webtoon, the panning locked', () => {
    store.getState().setReaderSettings({ ...DEFAULT_READER_SETTINGS, zoomLevel: 150 });
    render(<ReaderSettingsMenu fixedLayout />);
    // paged: no webtoon
    expect(screen.queryByText('Webtoon (no gaps)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Lock horizontal panning' }));
    expect(settings().lockPanX).toBe(true);

    // a webtoon: not zoomed, filling the width
    fireEvent.click(screen.getByText('Vertical'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Webtoon (no gaps)' }));
    expect(settings()).toMatchObject({ webtoon: true, zoomLevel: 100 });

    // across: no webtoon, the panning not locked
    fireEvent.click(screen.getByText('Horizontal'));
    expect(settings()).toMatchObject({ flow: 'scrolled', scrollDirection: 'horizontal', webtoon: false });
    expect(screen.queryByText('Webtoon (no gaps)')).not.toBeInTheDocument();
    expect(screen.queryByText('Lock horizontal panning')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Pages'));
    expect(settings().flow).toBe('paginated');
    expect(screen.getByText('Lock horizontal panning')).toBeInTheDocument();
  });

  test('the pages from right to left, of the book read', () => {
    render(<ReaderSettingsMenu fixedLayout />);
    // no book read: no toggle
    expect(screen.queryByText('Right-to-left pages')).not.toBeInTheDocument();
  });

  test('the pages from right to left: chosen, and back as the book says', () => {
    const book = { dir: 'ltr', rendition: { layout: 'pre-paginated' }, sections: [] } as unknown as BookDoc;
    useReaderStore.setState({ book, writingMode: 'auto' });
    render(<ReaderSettingsMenu fixedLayout />);
    const toggle = () => screen.getByRole('checkbox', { name: 'Right-to-left pages' });
    expect(toggle()).not.toBeChecked();
    fireEvent.click(toggle());
    expect(useReaderStore.getState().writingMode).toBe('horizontal-rtl');
    expect(toggle()).toBeChecked();
    fireEvent.click(toggle());
    expect(useReaderStore.getState().writingMode).toBe('auto');
    useReaderStore.setState({ book: undefined });
  });

  test('not shown for a book reflowed', () => {
    render(<ReaderSettingsMenu fixedLayout={false} />);
    expect(screen.queryByLabelText('Zoom in')).not.toBeInTheDocument();
    expect(screen.queryByText('Two pages')).not.toBeInTheDocument();
  });
});

describe('the reading ruler', () => {
  beforeEach(() => store.getState().setReaderSettings(DEFAULT_READER_SETTINGS));

  test('on, its lines, color and opacity; not for a fixed layout', () => {
    const { unmount } = render(<ReaderSettingsMenu fixedLayout={false} />);
    expect(screen.queryByText('Ruler lines')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Reading ruler' }));
    expect(settings().readingRuler).toBe(true);
    expect(screen.getByText('Ruler lines')).toBeInTheDocument();
    expect(screen.getByText('Ruler opacity')).toBeInTheDocument();
    expect(screen.getByLabelText('Ruler green')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByLabelText('Ruler no color'));
    expect(settings().rulerColor).toBe('transparent');
    unmount();
    render(<ReaderSettingsMenu fixedLayout />);
    expect(screen.queryByText('Reading ruler')).not.toBeInTheDocument();
  });
});
