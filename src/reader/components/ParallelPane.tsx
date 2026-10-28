import { useEffect, useState } from 'react';
import { TbBookmark, TbBookmarkFilled, TbX } from 'react-icons/tb';
import Spinner from 'components/misc/Spinner';
import { useStore } from 'lib/store';
import { findBookPath, readLibrary, titleOfFile, type BookEntry } from '../library';
import { useReaderStore, useSideStore } from '../readerStore';
import { bookmarkAt, toggleBookmark } from '../actions';
import { withDefaults } from '../settings';
import { themeColors } from '../styles';
import { setActivePane } from '../view';
import FoliateViewer from './FoliateViewer';

/** The books to read beside the one read: any other of the library. */
export function ParallelBooks({ onPick }: { onPick: () => void }) {
  const ws = useReaderStore((s) => s.ws);
  const hash = useReaderStore((s) => s.hash);
  const current = useSideStore((s) => s.hash);
  const [books, setBooks] = useState<BookEntry[]>();

  useEffect(() => {
    if (!ws) return;
    let cancelled = false;
    readLibrary(ws)
      .then((lib) => Object.values(lib.books)
        // not the book read: its annotations written by one store only
        .filter((b) => b.hash !== hash)
        .sort((a, b) => (a.title || a.file).localeCompare(b.title || b.file)))
      .catch(() => [])
      .then((list) => {
        if (!cancelled) setBooks(list);
      });
    return () => {
      cancelled = true;
    };
  }, [ws, hash]);

  const pick = async (book: BookEntry) => {
    onPick();
    if (!ws) return;
    const path = await findBookPath(ws, book.hash);
    if (path) {
      await useSideStore.getState().open(path);
    } else {
      await useSideStore.getState().close();
      useSideStore.setState({ status: 'error', entry: book, error: 'The book file is not on this device' });
    }
  };

  return (
    <div className="w-72" data-testid="parallel-books">
      <p className="px-3 pt-2 pb-1 text-xs opacity-60">Read beside</p>
      {!books ? (
        <div className="flex justify-center p-3"><Spinner className="w-5 h-5" /></div>
      ) : books.length === 0 ? (
        <p className="px-3 pb-3 text-sm opacity-60">No other book in the library</p>
      ) : (
        <ul className="w-full p-1 overflow-y-auto menu menu-sm max-h-80">
          {books.map((book) => (
            <li key={book.hash}>
              <button className={book.hash === current ? 'menu-active' : ''} onClick={() => void pick(book)}>
                <span className="flex flex-col min-w-0 text-left">
                  <span className="truncate">{book.title || titleOfFile(book.file)}</span>
                  {book.author ? <span className="text-xs truncate opacity-60">{book.author}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The book beside the one read, if any: read and annotated as it is. */
export default function ParallelPane() {
  const status = useSideStore((s) => s.status);
  const book = useSideStore((s) => s.book);
  const entry = useSideStore((s) => s.entry);
  const path = useSideStore((s) => s.path);
  const error = useSideStore((s) => s.error);
  const initialCfi = useSideStore((s) => s.initialCfi);
  const location = useSideStore((s) => s.location);
  const notes = useSideStore((s) => s.notes);
  const settings = withDefaults(useStore((s) => s.readerSettings));
  const darkMode = useStore((s) => s.darkMode);
  if (status === 'idle') return null;
  const paper = settings.pageTheme === 'auto' ? undefined : themeColors(darkMode, settings.pageTheme);
  const title = entry?.title || (path ? titleOfFile(path) : '');
  const bookmarked = location ? Boolean(bookmarkAt(notes, location.cfi)) : false;

  return (
    <div
      className="flex flex-col flex-1 min-w-0 border-l border-base-300"
      style={paper ? { background: paper.bg, color: paper.fg } : undefined}
      data-testid="parallel-pane"
      onPointerDown={() => setActivePane('side')}
    >
      <div className="flex items-center gap-1 px-2 border-b h-9 shrink-0 border-base-300">
        <span className="flex-1 min-w-0 text-xs truncate" title={title}>
          {`${title} § ${location?.tocLabel?.trim() || ''}`}
        </span>
        {location 
          ? <span className="text-xs opacity-50">{Math.round(location.fraction * 100)}%</span> 
          : null
        }
        <button
          className="btn btn-ghost btn-xs btn-square"
          title="Bookmark this page of the book beside"
          aria-label="Bookmark this page of the book beside"
          disabled={!location}
          onClick={() => toggleBookmark('side')}
        >
          {bookmarked 
            ? <TbBookmarkFilled size={16} className="text-error" /> 
            : <TbBookmark size={16} />
          }
        </button>
        <button
          className="btn btn-ghost btn-xs btn-square"
          title="Close the book beside"
          aria-label="Close the book beside"
          onClick={() => void useSideStore.getState().close()}
        >
          <TbX size={16} />
        </button>
      </div>
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {status === 'ready' && book ? (
          <FoliateViewer book={book} initialCfi={initialCfi} pane="side" />
        ) : status === 'error' ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 p-8 text-center">
            <p className="text-error">Could not open the book</p>
            <p className="text-sm opacity-60">{error}</p>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full"><Spinner className="w-8 h-8" /></div>
        )}
      </div>
    </div>
  );
}
