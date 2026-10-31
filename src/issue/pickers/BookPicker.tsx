import { useMemo, useState } from 'react';
import { TbBook } from 'react-icons/tb';
import { store } from '@/state/store';
import { useCurrentViewContext } from '@/state/useCurrentView';
import { useLibraryBooks } from '@/reader/library/books';
import { linkedBookIds } from '@/reader/annotations/bookLinks';
import { bookHref } from '@/reader/annotations/annotations';
import { findBookPath, type BookEntry } from '@/reader/library/library';
import { useIssueStore } from '../issueStore';
import { updateIssue } from '../issueOps';
import { inputClass } from '../common';
import { issueTexts } from '../refs';
import type { Issue } from '../types';
import Picker, { menuItemClass } from './Picker';

/** The markdown linking a book, to add to the body. */
const bookLink = (book: BookEntry) => `[${book.title.replace(/[[\]]/g, '')}](${bookHref(book.hash)})`;

/**
 * The books linked in the body or comments, `{{` or `book:` links; linking
 * one here adds its link to the body.
 */
export default function BookPicker({ issue }: { issue: Issue }) {
  const apply = useIssueStore((s) => s.apply);
  const books = useLibraryBooks();
  const { dispatch } = useCurrentViewContext();
  const [query, setQuery] = useState('');

  const linked = useMemo(
    () => [...new Set(issueTexts(issue).flatMap((t) => linkedBookIds(books, t)))].map((id) => books[id]),
    [issue, books]
  );
  const term = query.trim().toLowerCase();
  const results = term
    ? Object.values(books).filter((b) => `${b.title} ${b.author}`.toLowerCase().includes(term)).slice(0, 8)
    : [];

  const open = async (book: BookEntry) => {
    const ws = store.getState().initDir;
    const path = ws ? await findBookPath(ws, book.hash) : undefined;
    if (path) dispatch({ view: 'book', path });
  };

  return (
    <Picker
      title="Books"
      summary={
        linked.length ? (
          <ul className="space-y-1" data-testid="issue-books">
            {linked.map((book) => (
              <li key={book.hash} className="flex items-center gap-1">
                <TbBook size={14} className="shrink-0 text-base-content/60" />
                <button type="button" className="flex-1 text-left truncate ms-link" title={book.author} onClick={() => void open(book)}>
                  {book.title}
                </button>
              </li>
            ))}
          </ul>
        ) : (<span className="text-base-content/60">None yet, type {'{{'} in the text to link one</span>)
      }
    >
      {(close) => (
        <div className="p-2">
          <input
            autoFocus
            className={`${inputClass} w-full`}
            placeholder="Search books"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {results.map((book) => (
            <button
              type="button"
              key={book.hash}
              className={menuItemClass}
              disabled={linked.includes(book)}
              onClick={() => {
                const body = issue.body.trimEnd();
                apply((d) => updateIssue(d, issue.number, { body: `${body}${body ? '\n\n' : ''}${bookLink(book)}\n` }));
                setQuery('');
                close();
              }}
            >
              {book.title}
              {book.author ? <span className="ml-1 text-xs text-base-content/60">{book.author}</span> : null}
            </button>
          ))}
        </div>
      )}
    </Picker>
  );
}
