import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { sectionOf, type BookNote } from '../annotations';
import { defaultHighlight } from '../actions';
import { cornerAt, cornerTurner, type TurnHint } from '../pagination';
import { boxOfRange, usePopups, type Box } from '../popups';
import { storeOf } from '../readerStore';
import { fixedEnd, handlePoints, rangeTo, type Place, type Point } from '../rangeEdit';
import { HIGHLIGHT_CSS } from '../styles';
import type { FoliateView, Pane } from '../view';

const SIZE = 24;
const RADIUS = 8;
const STEM = 12;

type End = 'start' | 'end';

/**
 * A handle at an end of a range, as readup draws it: a stem along the line
 * and a dot past it; above the start, below the end (on the right of the
 * start and the left of the end, written down the page).
 */
function Handle({ end, at, vertical, color, hidden, onDown, onMove, onUp }: {
  end: End; at: Point; vertical: boolean; color: string; hidden?: boolean;
  onDown: (e: ReactPointerEvent) => void; onMove: (point: Point) => void; onUp: () => void;
}) {
  const start = end === 'start';
  const left = vertical && start ? at.x - SIZE / 2 + STEM / 4 : at.x - SIZE / 2;
  const top = vertical
    ? start ? at.y - SIZE + STEM / 2 : at.y - SIZE / 2 - STEM / 2
    : start ? at.y - SIZE : at.y - SIZE / 2 - STEM / 8;
  const rotate = vertical ? (start ? 270 : 90) : start ? 180 : 0;
  return (
    <div
      className={`fixed z-40 cursor-grab touch-none active:cursor-grabbing ${hidden ? 'hidden' : ''}`}
      style={{ left, top, width: SIZE, height: SIZE + STEM }}
      data-testid={`range-handle-${end}`}
      aria-label={start ? 'Move the start' : 'Move the end'}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        (e.target as Element).setPointerCapture?.(e.pointerId);
        onDown(e);
      }}
      onPointerMove={(e) => {
        if (!(e.buttons & 1)) return;
        e.preventDefault();
        onMove({ x: e.clientX, y: e.clientY });
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        onUp();
      }}
      onPointerCancel={onUp}
    >
      <svg width={SIZE} height={SIZE + STEM} viewBox={`0 0 ${SIZE} ${SIZE + STEM}`} style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}>
        <line x1={SIZE / 2} y1={0} x2={SIZE / 2} y2={STEM} stroke={color} strokeWidth={2} strokeLinecap="round" />
        <circle cx={SIZE / 2} cy={STEM + RADIUS} r={RADIUS} fill={color} />
      </svg>
    </div>
  );
}

/** What the handles change: the text selected, or a highlight. */
type Target =
  | { kind: 'selection'; range: Range; index: number }
  | { kind: 'annotation'; range: Range; index: number; note: BookNote };

type Drag = { end: End; anchor: Place; range: Range; point: Point; changed: boolean };

const inside = (p: Point, area: Box) => p.x >= area.left - 2 && p.x <= area.right + 2 && p.y >= area.top - 2 && p.y <= area.bottom + 2;

/**
 * The handles at the ends of the text selected and of a highlight clicked,
 * to change their range by dragging one: the other end
 * stays, the end dragged snaps to words; dragged to a corner, the page
 * turns and the range goes on in the next one. A highlight changed is
 * drawn as it goes and saved once the handle is let go.
 */
export default function RangeHandles({ pane, view, area, vertical, onTurnHint, preview }: {
  pane: Pane;
  view: () => FoliateView | null;
  /** the text of the pages, in the window */
  area: () => Box | undefined;
  vertical: boolean;
  onTurnHint: (hint?: TurnHint) => void;
  /** the highlight drawn over a range, while dragged; drawn as saved again, without one */
  preview: (note: BookNote, range?: Range) => void;
}) {
  const bookStore = storeOf(pane);
  const selection = usePopups((state) => state.selection);
  const annotation = usePopups((state) => state.annotation);
  const notes = bookStore((state) => state.notes);
  const dragRef = useRef<Drag | undefined>(undefined);
  const [, setMoved] = useState(0);
  const rerender = () => setMoved((n) => n + 1);

  // its note written, a highlight is not changed meanwhile
  const note = annotation && !annotation.edit ? notes.find((n) => n.id === annotation.id) : undefined;
  const target: Target | undefined = selection?.range
    ? { kind: 'selection', range: selection.range, index: selection.index }
    : note?.text && annotation?.range
      ? { kind: 'annotation', range: annotation.range, index: sectionOf(note.cfi), note }
      : undefined;
  // of the pages of this pane
  const doc = target?.range.startContainer.ownerDocument;
  const ours = Boolean(doc && view()?.renderer.getContents().some((c) => c.doc === doc));

  const latest = useRef({ target, view, area, onTurnHint, preview, move: (_point: Point) => {} });
  Object.assign(latest.current, { target, view, area, onTurnHint, preview });

  const turner = useMemo(() => cornerTurner(async (corner) => {
    const v = latest.current.view();
    await (corner === 'end' ? v?.next() : v?.prev());
    // the range goes on to the handle held, in the page turned to
    const drag = dragRef.current;
    if (drag) latest.current.move(drag.point);
  }, (hint) => latest.current.onTurnHint(hint)), []);
  useEffect(() => () => turner.cancel(), [turner]);

  // the handles follow the text, the window resized
  const shown = Boolean(target && ours);
  useEffect(() => {
    if (!shown) return;
    window.addEventListener('resize', rerender);
    return () => window.removeEventListener('resize', rerender);
  }, [shown]);

  if (!target || !ours) return null;

  const show = (range: Range) => {
    const { target: t, preview: draw } = latest.current;
    if (t?.kind === 'annotation') {
      draw(t.note, range);
      return;
    }
    const sel = range.startContainer.ownerDocument?.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range.cloneRange());
  };

  function move(point: Point) {
    const drag = dragRef.current;
    const v = latest.current.view();
    if (!drag || !v) return;
    drag.point = point;
    const range = rangeTo(drag.anchor, point);
    if (range) {
      drag.range = range;
      drag.changed = true;
      show(range);
    }
    // the pages of a chapter only: scrolled, the handle is dragged in view
    const box = latest.current.area();
    if (box && !v.isFixedLayout && !v.renderer.scrolled) turner.note(cornerAt(point, box, v.book?.dir === 'rtl'));
    rerender();
  }

  latest.current.move = move;

  const down = (end: End) => (e: ReactPointerEvent) => {
    dragRef.current = { end, anchor: fixedEnd(target.range, end), range: target.range, point: { x: e.clientX, y: e.clientY }, changed: false };
    usePopups.getState().setAdjusting(true);
    if (target.kind === 'annotation') preview(target.note, target.range);
    rerender();
  };

  const up = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = undefined;
    turner.cancel();
    const v = view();
    const { range, changed } = drag;
    const box = boxOfRange(range, area());
    const text = range.toString().trim();
    const cfi = v && changed ? v.getCFI(target.index, range) : undefined;
    if (target.kind === 'selection') {
      const { selection: now } = usePopups.getState();
      usePopups.getState().setSelection(cfi && now ? { ...now, text, cfi, box, range } : now && { ...now, box });
      return;
    }
    const { note: edited } = target;
    if (cfi && cfi !== edited.cfi) bookStore.getState().updateNote(edited.id, { cfi, text });
    preview(edited);
    usePopups.getState().setAnnotation({ id: edited.id, box, range });
  };

  const drag = dragRef.current;
  const points = handlePoints(drag?.range ?? target.range, vertical);
  if (!points) return null;
  // the end dragged at the pointer, until it is let go
  if (drag) points[drag.end] = drag.point;
  const box = area();
  const color = HIGHLIGHT_CSS[target.kind === 'annotation' ? target.note.color ?? 'yellow' : defaultHighlight().color];
  return (
    <>
      {(['start', 'end'] as const).map((end) => (
        <Handle
          key={end}
          end={end}
          at={points[end]}
          vertical={vertical}
          color={color}
          // one end at a time; an end on another page not shown
          hidden={(drag && drag.end !== end) || (!drag && box && !inside(points[end], box))}
          onDown={down(end)}
          onMove={move}
          onUp={up}
        />
      ))}
    </>
  );
}
