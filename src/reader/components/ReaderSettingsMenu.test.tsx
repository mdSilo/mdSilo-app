import { fireEvent, render, screen } from '@testing-library/react';
import { store } from '@/state/store';
import { DEFAULT_READER_SETTINGS, withDefaults } from '../settings';
import ReaderSettingsMenu from './ReaderSettingsMenu';

const settings = () => withDefaults(store.getState().readerSettings);

describe('the settings of a fixed layout', () => {
  beforeEach(() => store.getState().setReaderSettings(DEFAULT_READER_SETTINGS));

  test('the zoom, the fit, the spreads and the cover', () => {
    render(<ReaderSettingsMenu fixedLayout />);
    // not of the text
    expect(screen.queryByText('Font size')).not.toBeInTheDocument();

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

    // scrolled: no spreads
    fireEvent.click(screen.getByText('Scroll'));
    expect(screen.queryByText('One page')).not.toBeInTheDocument();
    expect(screen.getByText('Width')).toBeInTheDocument();
  });

  test('not shown for a book reflowed', () => {
    render(<ReaderSettingsMenu fixedLayout={false} />);
    expect(screen.queryByLabelText('Zoom in')).not.toBeInTheDocument();
    expect(screen.queryByText('Two pages')).not.toBeInTheDocument();
  });
});
