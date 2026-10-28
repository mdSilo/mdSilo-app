import { fireEvent, render, screen } from '@testing-library/react';
import { ImageViewer, TableViewer, zoomedOffset } from './MediaViewer';

const images = [
  { type: 'image' as const, src: 'https://x/1.png', alt: 'One' },
  { type: 'image' as const, src: 'https://x/2.png', alt: '' },
];

describe('image viewer', () => {
  test('pages through the images by the arrows, zooms, closes on Escape', () => {
    const onClose = vi.fn();
    render(<ImageViewer images={images} start={0} onClose={onClose} />);
    const viewer = screen.getByTestId('media-viewer');
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://x/1.png');
    // the description below the image, and on hover
    expect(screen.getByTestId('image-caption')).toHaveTextContent('One');
    expect(screen.getByRole('img')).toHaveAttribute('title', 'One');
    expect(screen.queryByLabelText('Previous image')).toBeNull();
    fireEvent.keyDown(viewer, { key: 'ArrowRight' });
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://x/2.png');
    expect(screen.queryByLabelText('Next image')).toBeNull();
    expect(screen.queryByTestId('image-caption')).toBeNull();
    fireEvent.click(screen.getByLabelText('Zoom in'));
    expect(screen.getByLabelText('Zoom level')).toHaveTextContent('120%');
    fireEvent.keyDown(viewer, { key: '0', ctrlKey: true });
    expect(screen.getByLabelText('Zoom level')).toHaveTextContent('100%');
    // a click on the image does not close it; beside it does
    fireEvent.click(screen.getByRole('img'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(viewer, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(viewer);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test('the keys do not reach the pages under it', () => {
    const onKey = vi.fn();
    window.addEventListener('keydown', onKey);
    render(<ImageViewer images={images} start={1} onClose={() => undefined} />);
    fireEvent.keyDown(screen.getByTestId('media-viewer'), { key: 'ArrowLeft' });
    window.removeEventListener('keydown', onKey);
    expect(onKey).not.toHaveBeenCalled();
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://x/1.png');
  });

  test('zooms about the pointer', () => {
    expect(zoomedOffset({ x: 100, y: 0 }, 1, 2, { x: 0, y: 0 })).toEqual({ x: -100, y: 0 });
  });
});

describe('table viewer', () => {
  test('the table of the book, without scripts or handlers', () => {
    render(
      <TableViewer
        html={'<table><tr><td>cell<img src="x" onerror="alert(1)"><script>alert(2)</script></td></tr></table>'}
        colors={{ bg: '#fff', fg: '#000' }}
        onClose={() => undefined}
      />,
    );
    const cell = screen.getByText('cell');
    expect(cell.closest('table')).not.toBeNull();
    expect(document.querySelector('[onerror]')).toBeNull();
    expect(document.querySelector('.media-table script')).toBeNull();
  });
});
