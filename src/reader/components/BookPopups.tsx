import { memo, useEffect, useState, type ReactNode, type RefObject } from 'react';
import {
  TbCheck, TbCopy, TbHighlight, TbHighlightOff, TbLink, TbPencil, TbQuote,
} from 'react-icons/tb';
import copy from 'copy-to-clipboard';
import { useStore } from 'lib/store';
import {
  HIGHLIGHT_COLORS, sectionOf, type BookNote, type HighlightStyle,
} from '../annotations';
import { HIGHLIGHT_CSS } from '../styles';
import { withDefaults } from '../settings';
import { useReaderStore } from '../readerStore';
import { usePopups, type Box, type TextSelection } from '../popups';
import {
  annotateSelection, copyLink, copyQuote, rememberHighlight,
} from '../actions';

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

/** px between the text and a popup, room for its arrow */
const GAP = 12;

export type Anchor = {
  /** the popup is above the text ('up') or under it */
  dir: 'up' | 'down';
  left: number;
  /** from the top of the root, if down; from its bottom, if up */
  offset: number;
  /** the arrow, from the left of the popup */
  arrow: number;
};

/**
 * Where a popup goes for a box of text, in the root: on the side with the
 * more room (as readup does), unless the popup fits under it; centered on
 * the text, kept in the root.
 */
export function anchorOf(box: Box, root: DOMRect, width: number, height: number): Anchor {
  const above = box.top - root.top;
  const below = root.bottom - box.bottom;
  const dir = below >= height + GAP || below >= above ? 'down' : 'up';
  const mid = (Math.max(box.left, root.left) + Math.min(box.right, root.right)) / 2 - root.left;
  const left = Math.min(Math.max(8, mid - width / 2), Math.max(8, root.width - width - 8));
  const offset = dir === 'down'
    ? Math.min(Math.max(8, box.bottom - root.top + GAP), Math.max(8, root.height - height - 8))
    : Math.min(Math.max(8, root.bottom - box.top + GAP), Math.max(8, root.height - height - 8));
  return { dir, left, offset, arrow: Math.min(Math.max(14, mid - left), width - 14) };
}

/** A popup over the book, at a box of text, with an arrow to it. */
export function Popup({ box, rootRef, children, testId, height = 140, width = 288, className = '' }: {
  box: Box; rootRef: RefObject<HTMLDivElement | null>; children: ReactNode; testId: string;
  /** about: to choose the side */
  height?: number; width?: number; className?: string;
}) {
  const root = rootRef.current?.getBoundingClientRect();
  if (!root) return null;
  const anchor = anchorOf(box, root, Math.min(width, root.width - 16), height);
  return (
    <AnchoredBox anchor={anchor} width={Math.min(width, root.width - 16)} testId={testId}>
      <div className={`p-2 border rounded-lg shadow-xl bg-base-100 border-base-300 ${className}`}>{children}</div>
    </AnchoredBox>
  );
}

function AnchoredBox({ anchor, width, testId, children }: {
  anchor: Anchor; width: number; testId: string; children: ReactNode;
}) {
  const { dir, left, offset, arrow } = anchor;
  return (
    <div
      className={`absolute z-40 flex gap-2 ${dir === 'down' ? 'flex-col' : 'flex-col-reverse'}`}
      style={{ left, width, ...(dir === 'down' ? { top: offset } : { bottom: offset }) }}
      data-testid={testId}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span
        className={`absolute w-3 h-3 rotate-45 bg-base-300 ${dir === 'down' ? '-top-1.5' : '-bottom-1.5'}`}
        style={{ left: arrow - 6 }}
        aria-hidden
      />
      {children}
    </div>
  );
}

export type Tool = {
  id: string;
  title: string;
  icon: ReactNode;
  onClick: () => void;
  hidden?: boolean;
};

/** A button of the toolbar: an icon, its name on hover. */
function ToolButton({ tool }: { tool: Tool }) {
  return (
    <button
      className="flex items-center justify-center w-8 h-8 rounded-md shrink-0 hover:bg-base-content/15"
      title={tool.title}
      aria-label={tool.title}
      onClick={tool.onClick}
    >
      {tool.icon}
    </button>
  );
}

function Toolbar({ tools }: { tools: Tool[] }) {
  return (
    <div
      className="relative flex items-center justify-between h-11 gap-0.5 px-1.5 overflow-x-auto rounded-lg shadow-xl bg-base-300 text-base-content"
      style={{ scrollbarWidth: 'none' }}
      data-testid="annotation-toolbar"
    >
      {tools.filter((t) => !t.hidden).map((t) => <ToolButton key={t.id} tool={t} />)}
    </div>
  );
}

const STYLES: HighlightStyle[] = ['highlight', 'underline', 'squiggly'];

/** The style of a highlight, as a T: on color, underlined, or waved. */
function StyleSample({ style, color }: { style: HighlightStyle; color: string }) {
  return (
    <span
      className="w-4 text-sm font-semibold leading-none text-center"
      style={style === 'highlight'
        ? { backgroundColor: color, color: '#1f2937' }
        : { textDecoration: 'underline', textDecorationColor: color, textDecorationThickness: 2, ...(style === 'squiggly' ? { textDecorationStyle: 'wavy' } : {}) }}
    >
      T
    </span>
  );
}

/** The style and color of a highlight: the toolbar uses them from then on. */
export function HighlightOptions({ note, onDone }: { note: BookNote; onDone: () => void }) {
  const updateNote = useReaderStore((state) => state.updateNote);
  const colors = withDefaults(useStore((state) => state.readerSettings)).highlightColors;
  const style = note.style ?? 'highlight';
  const color = note.color ?? 'yellow';
  return (
    <div className="flex items-center justify-between" data-testid="highlight-options">
      <div className="flex gap-1.5">
        {STYLES.map((s) => (
          <button
            key={s}
            className={`flex items-center justify-center rounded-full w-7 h-7 bg-base-300 shadow ${s === style ? 'ring-2 ring-base-content/50' : ''}`}
            title={`Style: ${s}`}
            aria-label={`Style ${s}`}
            aria-pressed={s === style}
            onClick={() => {
              const next = s === style ? color : colors[s];
              updateNote(note.id, { style: s, color: next });
              rememberHighlight(s, next);
            }}
          >
            <StyleSample style={s} color={HIGHLIGHT_CSS[s === style ? color : colors[s]]} />
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 px-2 rounded-full shadow h-7 bg-base-300">
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c}
            className="flex items-center justify-center w-4 h-4 rounded-full"
            style={{ backgroundColor: HIGHLIGHT_CSS[c] }}
            title={`Highlight ${c}`}
            aria-label={`Highlight ${c}`}
            aria-pressed={c === color}
            onClick={() => {
              updateNote(note.id, { color: c });
              rememberHighlight(style, c);
              onDone();
            }}
          >
            {c === color ? <TbCheck size={12} className="text-gray-800" /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The note of an annotation, written: markdown, [[links]] work. */
function NoteEditor({ value, onSave, onCancel }: {
  value: string; onSave: (note: string) => void; onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <div className="flex flex-col gap-2 p-2 border rounded-lg shadow-xl bg-base-100 border-base-300" data-testid="note-editor">
      <textarea
        className="w-full textarea textarea-sm"
        rows={4}
        placeholder="A note, [[links]] to notes work"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            onSave(draft);
          }
        }}
      />
      <div className="flex justify-end gap-1">
        <button className="btn btn-ghost btn-xs" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary btn-xs" onClick={() => onSave(draft)}>Save</button>
      </div>
    </div>
  );
}

/** The note of an annotation, shown with the toolbar. */
function NoteCard({ note, onEdit }: { note: BookNote; onEdit: () => void }) {
  return (
    <div className="flex gap-2 p-2 text-sm border rounded-lg shadow-xl bg-base-100 border-base-300" data-testid="note-card">
      <p className="flex-1 overflow-y-auto whitespace-pre-wrap max-h-40">{note.note}</p>
      <button className="self-start btn btn-ghost btn-xs btn-square" title="Edit the note" onClick={onEdit}>
        <TbPencil />
      </button>
    </div>
  );
}

const TOOLBAR_WIDTH = 380;
// the toolbar and the highlight options, to choose the side
const TOOLBAR_HEIGHT = 44 + 8 + 28;

/**
 * The popups over the book, as in readup: the toolbar of the text selected
 * (copy, highlight, note, look up...); on a highlight, its style, color, note.
 */
function BookPopups({ rootRef, tools }: {
  rootRef: RefObject<HTMLDivElement | null>;
  /** more tools on the text selected, e.g. look up, translate */
  tools?: (selection: TextSelection) => Tool[];
}) {
  const selection = usePopups((state) => state.selection);
  const annotation = usePopups((state) => state.annotation);
  const notes = useReaderStore((state) => state.notes);
  const note = annotation ? notes.find((n) => n.id === annotation.id) : undefined;
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setEditing(Boolean(annotation?.edit));
  }, [annotation]);

  // close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') usePopups.getState().clear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const root = rootRef.current?.getBoundingClientRect();
  if (!root || (!selection && !(annotation && note))) return null;
  const width = Math.min(TOOLBAR_WIDTH, root.width - 16);
  const clear = () => usePopups.getState().clear();

  if (selection) {
    const { text, cfi } = selection;
    const highlighted = notes.find((n) => n.cfi === cfi && n.type === 'annotation');
    const highlight = () => {
      if (highlighted) {
        useReaderStore.getState().removeNote(highlighted.id);
        clear();
        return;
      }
      const created = annotateSelection(selection);
      usePopups.getState().setAnnotation({ id: created.id, box: selection.box });
    };
    const list: Tool[] = [
      { id: 'copy', title: 'Copy', icon: <TbCopy size={18} />, onClick: () => { copy(text, { format: 'text/plain' }); clear(); } },
      {
        id: 'highlight',
        title: highlighted ? 'Delete the highlight' : 'Highlight',
        icon: highlighted ? <TbHighlightOff size={18} /> : <TbHighlight size={18} />,
        onClick: highlight,
      },
      {
        id: 'note',
        title: 'Write a note',
        icon: <TbPencil size={18} />,
        onClick: () => {
          const created = annotateSelection(selection);
          usePopups.getState().setAnnotation({ id: created.id, box: selection.box, edit: highlighted ? 'existing' : 'new' });
        },
      },
      ...(tools?.(selection) ?? []),
      { id: 'quote', title: 'Copy as a quote with a link to here, to paste in a note', icon: <TbQuote size={18} />, onClick: () => copyQuote(text, cfi) },
      { id: 'link', title: 'Copy a link to here', icon: <TbLink size={18} />, onClick: () => copyLink(cfi) },
    ];
    return (
      <AnchoredBox anchor={anchorOf(selection.box, root, width, TOOLBAR_HEIGHT)} width={width} testId="selection-popup">
        <Toolbar tools={list} />
      </AnchoredBox>
    );
  }

  if (!annotation || !note) return null;
  const anchor = anchorOf(annotation.box, root, width, TOOLBAR_HEIGHT + (note.note ? 80 : 0));
  if (editing) {
    const cancel = () => {
      // a highlight made to write a note on: not wanted
      if (annotation.edit === 'new' && !note.note) useReaderStore.getState().removeNote(note.id);
      clear();
    };
    return (
      <AnchoredBox anchor={anchor} width={width} testId="annotation-popup">
        <NoteEditor
          value={note.note}
          onCancel={cancel}
          onSave={(draft) => {
            if (draft !== note.note) useReaderStore.getState().updateNote(note.id, { note: draft });
            clear();
          }}
        />
      </AnchoredBox>
    );
  }
  // the text of the highlight, to look it up as if selected
  const asSelection: TextSelection | undefined = note.text
    ? { text: note.text, cfi: note.cfi, index: sectionOf(note.cfi), box: annotation.box }
    : undefined;
  const list: Tool[] = [
    {
      id: 'copy', title: 'Copy', icon: <TbCopy size={18} />, hidden: !note.text,
      onClick: () => { copy(note.text ?? '', { format: 'text/plain' }); clear(); },
    },
    {
      id: 'highlight', title: 'Delete the highlight', icon: <TbHighlightOff size={18} />,
      onClick: () => { useReaderStore.getState().removeNote(note.id); clear(); },
    },
    { id: 'note', title: note.note ? 'Edit the note' : 'Write a note', icon: <TbPencil size={18} />, onClick: () => setEditing(true) },
    ...(asSelection ? tools?.(asSelection) ?? [] : []),
    { id: 'quote', title: 'Copy as a quote with a link to here', icon: <TbQuote size={18} />, hidden: !note.text, onClick: () => copyQuote(note.text ?? '', note.cfi) },
    { id: 'link', title: 'Copy a link to here', icon: <TbLink size={18} />, onClick: () => copyLink(note.cfi) },
  ];
  return (
    <AnchoredBox anchor={anchor} width={width} testId="annotation-popup">
      <Toolbar tools={list} />
      <HighlightOptions note={note} onDone={clear} />
      {note.note ? <NoteCard note={note} onEdit={() => setEditing(true)} /> : null}
    </AnchoredBox>
  );
}

export default memo(BookPopups);
