import { TbCircleDot } from 'react-icons/tb';
import { useCurrentViewContext } from '@/state/useCurrentView';
import { issueLinks } from '@/lib/parseNote';
import type { BookNote } from '../annotations';
import { activeStore } from '../readerStore';

/** The issues an annotation links to, [#12](issue:12): to open them. */
export default function NoteIssues({ note, className = '' }: { note: BookNote; className?: string }) {
  const { dispatch } = useCurrentViewContext();
  const issues = issueLinks(note.note);
  if (!issues.length) return null;
  const open = async (number: number) => {
    await activeStore().getState().flush();
    dispatch({ view: 'issue', number });
  };
  return (
    <div className={`flex flex-wrap gap-1 ${className}`} data-testid="note-issues">
      {issues.map((num) => (
        <button key={num} className="badge badge-sm badge-ghost gap-1" title="Open the issue" onClick={() => void open(num)}>
          <TbCircleDot /> #{num}
        </button>
      ))}
    </div>
  );
}
