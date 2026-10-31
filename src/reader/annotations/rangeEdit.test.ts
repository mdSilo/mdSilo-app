import { fixedEnd, handlePoints, rangeTo, snapToWords } from './rangeEdit';

const page = (html: string) => {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLElement;
};

const textOf = (el: Element) => el.firstChild as Text;

/** jsdom lays out nothing: the place at a point, given */
const caretAt = (node: Node, offset: number) => {
  const doc = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null };
  doc.caretRangeFromPoint = () => {
    const range = document.createRange();
    range.setStart(node, offset);
    return range;
  };
};

afterEach(() => {
  delete (document as { caretRangeFromPoint?: unknown }).caretRangeFromPoint;
});

describe('the range of a highlight changed', () => {
  test('its ends snapped to the words they are in', () => {
    const p = page('<p>The quick brown fox, jumps.</p>');
    const range = document.createRange();
    range.setStart(textOf(p), 6);
    range.setEnd(textOf(p), 12);
    snapToWords(range);
    expect(range.toString()).toBe('quick brown');
    // at a punctuation, or at the edge of a word: as it is
    range.setStart(textOf(p), 16);
    range.setEnd(textOf(p), 20);
    snapToWords(range);
    expect(range.toString()).toBe('fox,');
  });

  test('from the end kept to the word at the pointer, before or after it', () => {
    const p = page('<p>The quick brown fox jumps over the lazy dog.</p>');
    const text = textOf(p);
    const range = document.createRange();
    range.setStart(text, 4);
    range.setEnd(text, 9);
    expect(range.toString()).toBe('quick');

    // the end dragged into "fox": the start kept
    caretAt(text, 17);
    expect(rangeTo(fixedEnd(range, 'end'), { x: 0, y: 0 })?.toString()).toBe('quick brown fox');
    // the start dragged before it, into "The"
    caretAt(text, 1);
    expect(rangeTo(fixedEnd(range, 'start'), { x: 0, y: 0 })?.toString()).toBe('The quick');
    // the end dragged before the start: the range turned around
    expect(rangeTo(fixedEnd(range, 'end'), { x: 0, y: 0 })?.toString()).toBe('The ');
    // at the end kept: nothing
    caretAt(text, 4);
    expect(rangeTo(fixedEnd(range, 'end'), { x: 0, y: 0 })).toBeUndefined();
  });

  test('none off the text', () => {
    const p = page('<p>Some text</p>');
    const range = document.createRange();
    range.selectNodeContents(p);
    expect(rangeTo(fixedEnd(range, 'end'), { x: 0, y: 0 })).toBeUndefined();
  });

  test('the handles before the first line and after the last; on the sides, written down the page', () => {
    const p = page('<p>Two lines</p>');
    const range = document.createRange();
    range.selectNodeContents(p);
    const rect = (left: number, top: number, right: number, bottom: number) =>
      ({ left, top, right, bottom, width: right - left, height: bottom - top }) as DOMRect;
    range.getClientRects = () => [rect(10, 20, 200, 40), rect(10, 40, 80, 60)] as unknown as DOMRectList;
    expect(handlePoints(range)).toEqual({ start: { x: 10, y: 20 }, end: { x: 80, y: 60 } });
    expect(handlePoints(range, true)).toEqual({ start: { x: 200, y: 20 }, end: { x: 10, y: 60 } });
    range.getClientRects = () => [] as unknown as DOMRectList;
    expect(handlePoints(range)).toBeUndefined();
  });
});
