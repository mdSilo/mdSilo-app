/**
 * The range of a highlight, or of the text selected, changed by dragging a
 * handle at one of its ends: the other end stays where it
 * is, as a place in the text; the end dragged goes to the word under the
 * pointer.
 */

export type Point = { x: number; y: number };

/** A place in the text: a node and an offset in it. */
export type Place = { node: Node; offset: number };

/**
 * The frame of a page of the book in the window: where it is, and its scale
 * (a page of a fixed layout is scaled by a transform, from its top left).
 */
export function frameOf(doc: Document | null | undefined) {
  const frame = doc?.defaultView?.frameElement as HTMLElement | null | undefined;
  if (!frame) return { left: 0, top: 0, scale: 1 };
  const rect = frame.getBoundingClientRect();
  const scale = frame.offsetWidth ? rect.width / frame.offsetWidth : 1;
  return { left: rect.left, top: rect.top, scale: scale || 1 };
}

/**
 * Where the handles of a range go, in the window: before its first line and
 * after its last; on the right and the left of them, written down the page.
 */
export function handlePoints(range: Range, vertical = false): { start: Point; end: Point } | undefined {
  const rects = Array.from(range.getClientRects()).filter((r) => r.width || r.height);
  if (!rects.length) return undefined;
  const first = rects[0];
  const last = rects[rects.length - 1];
  const { left, top, scale } = frameOf(range.startContainer.ownerDocument);
  const at = (x: number, y: number) => ({ x: left + x * scale, y: top + y * scale });
  return {
    start: at(vertical ? first.right : first.left, first.top),
    end: at(vertical ? last.left : last.right, last.bottom),
  };
}

/** The place in the text at a point of the window, in a page of the book. */
export function placeAt(doc: Document, point: Point): Place | undefined {
  const { left, top, scale } = frameOf(doc);
  const x = (point.x - left) / scale;
  const y = (point.y - top) / scale;
  const withPosition = doc as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  if (withPosition.caretPositionFromPoint) {
    const pos = withPosition.caretPositionFromPoint(x, y);
    return pos ? { node: pos.offsetNode, offset: pos.offset } : undefined;
  }
  const range = doc.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : undefined;
}

type Segmenter = { segment: (text: string) => Iterable<{ segment: string; index: number; isWordLike?: boolean }> };

const segmenter: Segmenter | undefined = (() => {
  try {
    const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: object) => Segmenter }).Segmenter;
    return Seg ? new Seg(undefined, { granularity: 'word' }) : undefined;
  } catch {
    return undefined;
  }
})();

const isPunctuation = (ch: string) => /^[\p{P}\p{S}]$/u.test(ch);

/** The word of a text an offset is inside of (not at its edges). */
function wordAround(text: string, offset: number) {
  if (!segmenter) return undefined;
  for (const { segment, index, isWordLike } of segmenter.segment(text)) {
    if (index >= offset) return undefined;
    if (isWordLike && index + segment.length > offset) return { start: index, end: index + segment.length };
  }
  return undefined;
}

/** The ends of a range in a word moved to its edges, to take all of it. */
export function snapToWords(range: Range) {
  const { startContainer: start, startOffset } = range;
  if (start.nodeType === Node.TEXT_NODE) {
    const text = start.textContent ?? '';
    const word = isPunctuation(text[startOffset] ?? '') ? undefined : wordAround(text, startOffset);
    if (word) range.setStart(start, word.start);
  }
  const { endContainer: end, endOffset } = range;
  if (end.nodeType === Node.TEXT_NODE) {
    const text = end.textContent ?? '';
    const word = isPunctuation(text[endOffset - 1] ?? '') ? undefined : wordAround(text, endOffset);
    if (word) range.setEnd(end, word.end);
  }
}

/**
 * The range from a place kept to the word at a point of the window, the
 * first of them whichever comes first; none if the point is not on the text
 * of that page, or at the place itself.
 */
export function rangeTo(anchor: Place, point: Point): Range | undefined {
  const doc = anchor.node.ownerDocument;
  if (!doc) return undefined;
  const place = placeAt(doc, point);
  if (!place) return undefined;
  const range = doc.createRange();
  try {
    const order = doc.createRange();
    order.setStart(anchor.node, anchor.offset);
    if (order.comparePoint(place.node, place.offset) >= 0) {
      range.setStart(anchor.node, anchor.offset);
      range.setEnd(place.node, place.offset);
    } else {
      range.setStart(place.node, place.offset);
      range.setEnd(anchor.node, anchor.offset);
    }
  } catch {
    return undefined;
  }
  if (range.collapsed) return undefined;
  snapToWords(range);
  return range.toString().trim() ? range : undefined;
}

/** The end of a range kept while the other end is dragged. */
export const fixedEnd = (range: Range, dragged: 'start' | 'end'): Place =>
  dragged === 'start'
    ? { node: range.endContainer, offset: range.endOffset }
    : { node: range.startContainer, offset: range.startOffset };
