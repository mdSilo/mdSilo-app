import { act, fireEvent, render, screen } from '@testing-library/react';
import { usePopups } from '../popups';
import { resetReaderStore, useReaderStore } from '../readerStore';
import type { BookNote } from '../annotations';
import type { FoliateView } from '../view';
import RangeHandles from './RangeHandles';

const AREA = { left: 0, top: 0, right: 1000, bottom: 800 };
const BOX = { left: 0, top: 0, right: 10, bottom: 10 };

// jsdom lays out nothing: every range on one line, the place at a point given
const rect = { left: 10, top: 20, right: 90, bottom: 40, width: 80, height: 20 } as DOMRect;
Range.prototype.getClientRects = function () {
  return [rect] as unknown as DOMRectList;
};
Range.prototype.getBoundingClientRect = () => rect;
let caret: { node: Node; offset: number } | undefined;
(document as Document & { caretRangeFromPoint?: unknown }).caretRangeFromPoint = () => {
  if (!caret) return null;
  const range = document.createRange();
  range.setStart(caret.node, caret.offset);
  return range;
};

let view: FoliateView;
const preview = vi.fn();

const renderHandles = () => render(
  <RangeHandles pane="main" view={() => view} area={() => AREA} vertical={false} onTurnHint={() => undefined} preview={preview} />,
);

/** "quick" of the page, as the range selected or highlighted */
function setup() {
  document.body.innerHTML = '<p>The quick brown fox jumps.</p>';
  const text = document.body.firstElementChild!.firstChild as Text;
  const range = document.createRange();
  range.setStart(text, 4);
  range.setEnd(text, 9);
  return { text, range };
}

const drag = (handle: HTMLElement, to: { node: Node; offset: number }) => {
  fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 });
  expect(usePopups.getState().adjusting).toBe(true);
  caret = to;
  fireEvent.pointerMove(handle, { clientX: 5, clientY: 5, buttons: 1, pointerId: 1 });
  fireEvent.pointerUp(handle, { pointerId: 1 });
};

beforeEach(() => {
  view = {
    renderer: { getContents: () => [{ doc: document, index: 1 }], scrolled: false },
    isFixedLayout: false,
    book: { dir: 'ltr' },
    getCFI: vi.fn((_index: number, range: Range) => `epubcfi(/6/4!/4/2,/1:${range.startOffset},/1:${range.endOffset})`),
  } as unknown as FoliateView;
  preview.mockClear();
  caret = undefined;
});

afterEach(() => {
  act(() => usePopups.getState().clear());
  resetReaderStore();
  document.body.innerHTML = '';
});

describe('the handles of a range', () => {
  test('the text selected, its end dragged: selected on to the word there', () => {
    const { text, range } = setup();
    act(() => usePopups.getState().setSelection({ text: 'quick', cfi: 'epubcfi(x)', index: 1, box: BOX, range }));
    renderHandles();
    drag(screen.getByTestId('range-handle-end'), { node: text, offset: 12 });
    const { selection, adjusting } = usePopups.getState();
    expect(adjusting).toBe(false);
    expect(selection).toMatchObject({ text: 'quick brown', cfi: 'epubcfi(/6/4!/4/2,/1:4,/1:15)', index: 1 });
    expect(document.getSelection()?.toString()).toBe('quick brown');
  });

  test('a highlight, its start dragged: drawn as it goes, saved once let go', () => {
    const { text, range } = setup();
    const now = new Date().toISOString();
    const note: BookNote = {
      id: 'x', type: 'annotation', cfi: 'epubcfi(/6/4!/4/2,/1:4,/1:9)', text: 'quick', note: '',
      color: 'yellow', style: 'highlight', createdAt: now, updatedAt: now,
    };
    act(() => {
      useReaderStore.getState().addNote(note);
      usePopups.getState().setAnnotation({ id: 'x', box: BOX, range });
    });
    renderHandles();
    drag(screen.getByTestId('range-handle-start'), { node: text, offset: 1 });
    expect(preview).toHaveBeenCalledWith(expect.objectContaining({ id: 'x' }), expect.anything());
    // drawn as saved again
    expect(preview).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'x' }));
    expect(useReaderStore.getState().notes[0]).toMatchObject({ cfi: 'epubcfi(/6/4!/4/2,/1:0,/1:9)', text: 'The quick' });
    expect(usePopups.getState().annotation).toMatchObject({ id: 'x' });
    expect(usePopups.getState().adjusting).toBe(false);
  });

  test('a handle let go where it was: nothing changed', () => {
    const { range } = setup();
    act(() => usePopups.getState().setSelection({ text: 'quick', cfi: 'epubcfi(x)', index: 1, box: BOX, range }));
    renderHandles();
    drag(screen.getByTestId('range-handle-end'), undefined as unknown as { node: Node; offset: number });
    expect(usePopups.getState().selection).toMatchObject({ text: 'quick', cfi: 'epubcfi(x)' });
  });

  test('none while the note of a highlight is written, or for the pages of the other book', () => {
    const { range } = setup();
    const now = new Date().toISOString();
    act(() => {
      useReaderStore.getState().addNote({
        id: 'x', type: 'annotation', cfi: 'epubcfi(x)', text: 'quick', note: '', createdAt: now, updatedAt: now,
      });
      usePopups.getState().setAnnotation({ id: 'x', box: BOX, range, edit: 'existing' });
    });
    renderHandles();
    expect(screen.queryByTestId('range-handle-start')).not.toBeInTheDocument();
    act(() => usePopups.getState().setSelection({ text: 'quick', cfi: 'epubcfi(x)', index: 1, box: BOX, range }));
    expect(screen.getByTestId('range-handle-start')).toBeInTheDocument();
    view = { ...view, renderer: { getContents: () => [], scrolled: false } } as unknown as FoliateView;
    act(() => usePopups.getState().setSelection({ text: 'quick', cfi: 'epubcfi(y)', index: 1, box: BOX, range }));
    expect(screen.queryByTestId('range-handle-start')).not.toBeInTheDocument();
  });
});
