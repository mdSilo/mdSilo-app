import { memo, useEffect, useState, type ReactNode, type RefObject } from 'react';
import { TbCopy, TbLink, TbNote, TbTrash } from 'react-icons/tb';
import copy from 'copy-to-clipboard';
import {
  HIGHLIGHT_COLORS, type HighlightColor, type HighlightStyle,
} from '../annotations';
import { HIGHLIGHT_CSS } from '../styles';
import { useReaderStore } from '../readerStore';
import { usePopups, type Box } from '../popups';
import { annotateSelection, copyLink, copyQuote } from '../actions';

const POPUP_WIDTH = 288;

/** Where to show a popup for a box: under it, or above if no room. */
export function placeOf(box: Box, root: DOMRect, height: number, width: number) {
  const left = Math.min(
    Math.max(8, (box.left + box.right) / 2 - root.left - width / 2),
    Math.max(8, root.width - width - 8),
  );
  const below = box.bottom - root.top + 8;
  const top = below + height > root.height ? Math.max(8, box.top - root.top - height - 8) : below;
  return { left, top };
}

/** A popup over the book, at a box: under it, or above if no room. */
export function Popup({ box, rootRef, children, testId, height = 140, width = POPUP_WIDTH }: {
  box: Box; rootRef: RefObject<HTMLDivElement | null>; children: ReactNode; testId: string;
  height?: number; width?: number;
}) {
  const root = rootRef.current?.getBoundingClientRect();
  if (!root) return null;
  const { left, top } = placeOf(box, root, height, width);
  return (
    <div
      className="absolute z-30 p-2 border rounded-md shadow-lg bg-base-100 border-base-300"
      style={{ left, top, width }}
      data-testid={testId}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

export function ColorButtons({ current, onPick }: { current?: HighlightColor; onPick: (c: HighlightColor) => void }) {
  return (
    <div className="flex gap-1">
      {HIGHLIGHT_COLORS.map((color) => (
        <button
          key={color}
          className={`w-6 h-6 rounded-full border-2 ${current === color ? 'border-base-content' : 'border-transparent'}`}
          style={{ backgroundColor: HIGHLIGHT_CSS[color] }}
          title={`Highlight ${color}`}
          aria-label={`Highlight ${color}`}
          onClick={() => onPick(color)}
        />
      ))}
    </div>
  );
}

const STYLES: HighlightStyle[] = ['highlight', 'underline', 'squiggly'];

/** The popups over the book: on the text selected, on an annotation clicked. */
function BookPopups({ rootRef, actions }: {
  rootRef: RefObject<HTMLDivElement | null>;
  /** more actions on the text selected, e.g. look up, translate */
  actions?: (text: string, cfi: string) => ReactNode;
}) {
  const selection = usePopups((state) => state.selection);
  const annotation = usePopups((state) => state.annotation);

  const notes = useReaderStore((state) => state.notes);
  const updateNote = useReaderStore((state) => state.updateNote);
  const removeNote = useReaderStore((state) => state.removeNote);
  const note = annotation ? notes.find((n) => n.id === annotation.id) : undefined;
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setDraft(note?.note ?? '');
    setEditing(false);
    // a new annotation shown
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotation?.id]);

  // close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') usePopups.getState().clear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (selection) {
    const { text, cfi } = selection;
    return (
      <Popup box={selection.box} rootRef={rootRef} testId="selection-popup">
        <div className="flex items-center justify-between">
          <ColorButtons onPick={(color) => {
            annotateSelection(selection, color);
            usePopups.getState().clear();
          }} />
          <button
            className="btn btn-ghost btn-xs"
            title="Highlight and write a note"
            onClick={() => {
              const created = annotateSelection(selection);
              const box = selection.box;
              usePopups.getState().setAnnotation({ id: created.id, box });
              setEditing(true);
            }}
          >
            <TbNote /> Note
          </button>
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          <button className="btn btn-ghost btn-xs" onClick={() => { copy(text, { format: 'text/plain' }); usePopups.getState().clear(); }}>
            <TbCopy /> Copy
          </button>
          <button className="btn btn-ghost btn-xs" title="Copy as a quote with a link to here, to paste in a note" onClick={() => copyQuote(text, cfi)}>
            <TbCopy /> Quote
          </button>
          <button className="btn btn-ghost btn-xs" title="Copy a link to here" onClick={() => copyLink(cfi)}>
            <TbLink /> Link
          </button>
          {actions?.(text, cfi)}
        </div>
      </Popup>
    );
  }

  if (annotation && note) {
    const save = () => {
      if (draft !== note.note) updateNote(note.id, { note: draft });
      setEditing(false);
    };
    return (
      <Popup box={annotation.box} rootRef={rootRef} testId="annotation-popup">
        <div className="flex items-center justify-between">
          <ColorButtons current={note.color} onPick={(color) => updateNote(note.id, { color })} />
          <select
            className="select select-xs w-24"
            value={note.style ?? 'highlight'}
            onChange={(e) => updateNote(note.id, { style: e.target.value as HighlightStyle })}
            aria-label="Style"
          >
            {STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {editing || note.note ? (
          <textarea
            className="w-full mt-2 textarea textarea-xs"
            rows={3}
            placeholder="A note, [[links]] to notes work"
            autoFocus={editing}
            value={draft}
            onFocus={() => setEditing(true)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
          />
        ) : null}
        <div className="flex flex-wrap gap-1 mt-2">
          {!editing && !note.note ? (
            <button className="btn btn-ghost btn-xs" onClick={() => setEditing(true)}>
              <TbNote /> Note
            </button>
          ) : null}
          {note.text ? (
            <button className="btn btn-ghost btn-xs" onClick={() => copyQuote(note.text!, note.cfi)}>
              <TbCopy /> Quote
            </button>
          ) : null}
          <button className="btn btn-ghost btn-xs" onClick={() => copyLink(note.cfi)}>
            <TbLink /> Link
          </button>
          <button
            className="ml-auto btn btn-ghost btn-xs text-error"
            onClick={() => {
              removeNote(note.id);
              usePopups.getState().clear();
            }}
          >
            <TbTrash /> Delete
          </button>
        </div>
      </Popup>
    );
  }
  return null;
}

export default memo(BookPopups);
