import { memo, useState } from 'react';
import { TbBookmark, TbCopy, TbEdit, TbTrash } from 'react-icons/tb';
import type { BookNote } from '../annotations';
import { HIGHLIGHT_CSS } from '../styles';
import { useReaderStore } from '../readerStore';
import { copyQuote } from '../actions';
import { getView } from '../view';

/** The annotations and bookmarks of the book, in the order of the book. */
function NotesView({ onOpenFile }: { onOpenFile?: () => void }) {
  const notes = useReaderStore((state) => state.notes);
  const [filter, setFilter] = useState('');
  const term = filter.trim().toLowerCase();
  const shown = term
    ? notes.filter((n) => `${n.text ?? ''} ${n.note} ${n.chapter ?? ''}`.toLowerCase().includes(term))
    : notes;

  return (
    <div className="flex flex-col h-full" data-testid="reader-notes">
      <div className="flex items-center gap-2 p-2">
        <input
          className="input input-xs flex-1"
          placeholder="Filter notes"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {onOpenFile && notes.length > 0 ? (
          <button className="btn btn-xs btn-ghost" onClick={onOpenFile} title="Open the notes as a note">
            .md
          </button>
        ) : null}
      </div>
      {notes.length === 0 ? (
        <p className="p-4 text-sm text-base-content/60">
          Select text to highlight it or to write a note on it.
        </p>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {shown.map((note) => <NoteItem key={note.id} note={note} />)}
        </ul>
      )}
    </div>
  );
}

function NoteItem({ note }: { note: BookNote }) {
  const updateNote = useReaderStore((state) => state.updateNote);
  const removeNote = useReaderStore((state) => state.removeNote);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.note);

  const save = () => {
    setEditing(false);
    if (draft !== note.note) updateNote(note.id, { note: draft });
  };

  return (
    <li className="px-3 py-2 border-b border-base-300 group">
      <button className="block w-full text-left" onClick={() => void getView()?.goTo(note.cfi)}>
        {note.chapter ? <div className="text-xs text-base-content/50 truncate">{note.chapter}</div> : null}
        {note.type === 'bookmark' ? (
          <div className="flex items-center gap-1 text-sm">
            <TbBookmark className="text-primary" /> Bookmark
          </div>
        ) : (
          <blockquote
            className="pl-2 text-sm border-l-4 line-clamp-4"
            style={{ borderColor: HIGHLIGHT_CSS[note.color ?? 'yellow'] }}
          >
            {note.text}
          </blockquote>
        )}
      </button>
      {editing ? (
        <textarea
          className="w-full mt-1 textarea textarea-xs"
          rows={4}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setDraft(note.note);
              setEditing(false);
            } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              save();
            }
          }}
        />
      ) : note.note ? (
        <p className="mt-1 text-sm whitespace-pre-wrap">{note.note}</p>
      ) : null}
      <div className="flex justify-end gap-1 mt-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
        <button className="btn btn-ghost btn-xs" title="Edit the note" onClick={() => { setDraft(note.note); setEditing(true); }}>
          <TbEdit />
        </button>
        {note.text ? (
          <button className="btn btn-ghost btn-xs" title="Copy as a quote with a link" onClick={() => copyQuote(note.text!, note.cfi)}>
            <TbCopy />
          </button>
        ) : null}
        <button className="btn btn-ghost btn-xs" title="Delete" onClick={() => removeNote(note.id)}>
          <TbTrash />
        </button>
      </div>
    </li>
  );
}

export default memo(NotesView);
