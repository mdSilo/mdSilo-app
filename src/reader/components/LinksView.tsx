import { memo, useMemo } from 'react';
import { TbCircleDot, TbFileText } from 'react-icons/tb';
import { useStore } from '@/state/store';
import { useCurrentViewContext } from '@/state/useCurrentView';
import { openFilePath } from '@/workspace/open';
import { useIssueData } from '@/issue/issueStore';
import { annotationsPathOf } from '../annotations';
import { useActiveStore } from '../readerStore';
import { useLibraryBooks } from '../books';
import { issuesLinkingBook, notesLinkingBook } from '../bookLinks';

const itemClass = 'flex items-center w-full gap-2 px-3 py-1.5 text-sm text-left hover:bg-base-300';

/** The notes and the issues linking to the book: its backlinks. */
function LinksView({ flush }: { flush: () => Promise<void> }) {
  const hash = useActiveStore((s) => s.hash);
  const path = useActiveStore((s) => s.path);
  const notes = useStore((state) => state.notes);
  const books = useLibraryBooks();
  const { data } = useIssueData();
  const { dispatch } = useCurrentViewContext();

  const own = path ? annotationsPathOf(path) : undefined;
  const linkingNotes = useMemo(
    // notes changed: linked anew maybe
    () => (hash && notes ? notesLinkingBook(books, hash).filter((n) => n.id !== own) : []),
    [hash, books, notes, own]
  );
  const linkingIssues = useMemo(
    () => (hash ? issuesLinkingBook(books, data.issues, hash) : []),
    [hash, books, data.issues]
  );

  if (!linkingNotes.length && !linkingIssues.length) {
    return (
      <p className="p-4 text-sm text-base-content/60" data-testid="reader-links">
        No note or issue links to this book yet. Type {'{{'} in a note or an issue to link it, or make an issue of an annotation.
      </p>
    );
  }

  return (
    <div className="h-full overflow-y-auto" data-testid="reader-links">
      {linkingNotes.length ? (
        <section>
          <h3 className="px-3 pt-2 text-xs font-semibold text-base-content/60">Notes</h3>
          {linkingNotes.map((note) => (
            <button
              key={note.id}
              className={itemClass}
              title={note.id}
              onClick={async () => {
                await flush();
                await openFilePath(note.id, true);
                dispatch({ view: 'md', params: { noteId: note.id } });
              }}
            >
              <TbFileText className="shrink-0" /> <span className="truncate">{note.title}</span>
            </button>
          ))}
        </section>
      ) : null}
      {linkingIssues.length ? (
        <section>
          <h3 className="px-3 pt-2 text-xs font-semibold text-base-content/60">Issues</h3>
          {linkingIssues.map((issue) => (
            <button
              key={issue.number}
              className={itemClass}
              onClick={async () => {
                await flush();
                dispatch({ view: 'issue', number: issue.number });
              }}
            >
              <TbCircleDot className={`shrink-0 ${issue.state === 'open' ? 'text-success' : 'text-base-content/50'}`} />
              <span className="truncate">#{issue.number} {issue.title}</span>
            </button>
          ))}
        </section>
      ) : null}
    </div>
  );
}

export default memo(LinksView);
