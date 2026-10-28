import { useMemo, useState } from 'react';
import { TbX as IconX } from 'react-icons/tb';
import { useStore } from '@/lib/store';
import useNoteSearch from '@/editor/hooks/useNoteSearch';
import useOnNoteLinkClick from '@/editor/hooks/useOnNoteLinkClick';
import { useIssueStore } from '../issueStore';
import { linkNote, unlinkNote } from '../issueOps';
import { inputClass } from '../common';
import { issueTexts, linkedNoteTitles } from '../refs';
import type { Issue } from '../types';
import Picker, { menuItemClass } from './Picker';

const titleOfPath = (p: string) => (p.split(/[\\/]/).pop() || p).replace(/\.md$/i, '');

/**
 * Explicitly linked notes (deleted ones stay listed, greyed out), then the
 * notes linked with [[title]] in the body or comments.
 */
export default function NotePicker({ issue }: { issue: Issue }) {
  const apply = useIssueStore((s) => s.apply);
  const notes = useStore((state) => state.notes);
  const { onClick: openNote } = useOnNoteLinkClick();
  const search = useNoteSearch({ numOfResults: 8 });
  const [query, setQuery] = useState('');
  const results = query.trim() ? search(query) : [];

  // notes linked with [[title]] in the body or comments, not already listed
  const mentioned = useMemo(() => {
    const byTitle = new Map(notes.values().filter((n) => !n.is_dir).map((n) => [n.title, n.id]));
    const titles = new Set(issueTexts(issue).flatMap((t) => [...linkedNoteTitles(t)]));
    return [...titles]
      .map((title) => ({ title, id: byTitle.get(title) }))
      .filter(({ id }) => !id || !issue.notes.includes(id));
  }, [issue, notes]);

  return (
    <Picker
      title="Linked notes"
      summary={
        issue.notes.length || mentioned.length ? (
          <ul className="space-y-1">
            {issue.notes.map((p) => {
              const note = notes.get(p);
              return (
                <li key={p} className="flex items-center gap-1">
                  {note ? (
                    <button type="button" className="flex-1 text-left truncate ms-link" title={p} onClick={() => openNote(p)}>
                      {note.title}
                    </button>
                  ) : (
                    <span className="flex-1 text-base-content/50 line-through truncate" title={`Missing: ${p}`}>
                      {titleOfPath(p)}
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label={`Unlink ${titleOfPath(p)}`}
                    className="text-base-content/50 hover:text-error/80"
                    onClick={() => apply((d) => unlinkNote(d, issue.number, p))}
                  >
                    <IconX size={14} />
                  </button>
                </li>
              );
            })}
            {mentioned.map(({ title, id }) => (
              <li key={`m-${title}`} className="flex items-center gap-1" data-testid="mentioned-note">
                {id ? (
                  <button type="button" className="flex-1 text-left truncate ms-link" title={id} onClick={() => openNote(id)}>
                    {title}
                  </button>
                ) : (
                  <span className="flex-1 text-base-content/50 truncate" title="No note with this title">{title}</span>
                )}
                <span className="text-xs text-base-content/60" title="Linked with [[ ]] in the text">mentioned</span>
              </li>
            ))}
          </ul>
        ) : (<span className="text-base-content/60">None yet</span>)
      }
    >
      {(close) => (
        <div className="p-2">
          <input
            autoFocus
            className={`${inputClass} w-full`}
            placeholder="Search notes"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {results.map((r) => (
            <button
              type="button"
              key={r.item.id}
              className={menuItemClass}
              disabled={issue.notes.includes(r.item.id)}
              onClick={() => {
                apply((d) => linkNote(d, issue.number, r.item.id));
                setQuery('');
                close();
              }}
            >
              {r.item.title}
            </button>
          ))}
        </div>
      )}
    </Picker>
  );
}
