import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  TbArrowLeft, TbBookmark, TbBookmarkFilled, TbChevronLeft, TbChevronRight, TbLayoutSidebar,
  TbLink, TbTypography,
} from 'react-icons/tb';
import ErrorBoundary from 'components/misc/ErrorBoundary';
import Spinner from 'components/misc/Spinner';
import { useCurrentViewContext } from 'context/useCurrentView';
import { openFilePath } from 'file/open';
import { annotationsPathOf } from '../annotations';
import { useReaderStore } from '../readerStore';
import { bookmarkAt, copyLink, toggleBookmark } from '../actions';
import { usePopups } from '../popups';
import { getView } from '../view';
import FoliateViewer from './FoliateViewer';
import TocView from './TocView';
import NotesView from './NotesView';
import BookPopups from './BookPopups';
import ReaderSettingsMenu from './ReaderSettingsMenu';

export type SidebarTab = { id: string; label: string; render: () => ReactNode };

type Props = {
  /** more tabs in the sidebar, e.g. search */
  extraTabs?: SidebarTab[];
  /** more actions on the text selected */
  selectionActions?: (text: string, cfi: string) => ReactNode;
  /** more buttons in the header */
  headerButtons?: ReactNode;
  /** over the book, e.g. the panel of text-to-speech */
  overlay?: ReactNode;
};

/** A book read, with its table of contents and annotations. */
export function Reader({ extraTabs = [], selectionActions, headerButtons, overlay }: Props) {
  const { state, dispatch } = useCurrentViewContext();
  const path = state.bookPath;
  const cfi = state.bookCfi;
  const status = useReaderStore((s) => s.status);
  const error = useReaderStore((s) => s.error);
  const book = useReaderStore((s) => s.book);
  const entry = useReaderStore((s) => s.entry);
  const initialCfi = useReaderStore((s) => s.initialCfi);
  const location = useReaderStore((s) => s.location);
  const notes = useReaderStore((s) => s.notes);
  const rootRef = useRef<HTMLDivElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tab, setTab] = useState('toc');
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (path) void useReaderStore.getState().open(path, cfi);
  }, [path, cfi]);

  // the book is closed when another view shows
  useEffect(() => () => { void useReaderStore.getState().close(); }, []);

  const tabs: SidebarTab[] = [
    { id: 'toc', label: 'Contents', render: () => <TocView toc={book?.toc ?? []} current={location?.tocLabel} /> },
    {
      id: 'notes',
      label: `Notes${notes.length ? ` ${notes.length}` : ''}`,
      render: () => (
        <NotesView onOpenFile={path ? async () => {
          const mdPath = annotationsPathOf(path);
          await useReaderStore.getState().flush();
          await openFilePath(mdPath, true);
          dispatch({ view: 'md', params: { noteId: mdPath } });
        } : undefined} />
      ),
    },
    ...extraTabs,
  ];
  const activeTab = tabs.find((t) => t.id === tab) ?? tabs[0];
  const bookmarked = location ? Boolean(bookmarkAt(notes, location.cfi)) : false;
  const fraction = location?.fraction ?? 0;

  return (
    <ErrorBoundary>
      <div className="flex flex-col w-full h-full bg-base-100" data-testid="reader">
        <div className="flex items-center gap-1 px-2 py-1 border-b border-base-300">
          <button className="btn btn-ghost btn-xs" title="Library" onClick={() => dispatch({ view: 'library' })}>
            <TbArrowLeft size={16} />
          </button>
          <button
            className={`btn btn-ghost btn-xs ${sidebarOpen ? 'btn-active' : ''}`}
            title="Contents and notes"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <TbLayoutSidebar size={16} />
          </button>
          <div className="flex-1 min-w-0 px-2 text-sm truncate">
            <span className="font-semibold">{entry?.title ?? path?.split('/').pop()}</span>
            {location?.tocLabel ? (
              <span className="text-base-content/60"> · {location.tocLabel.trim()}</span>
            ) : null}
          </div>
          {headerButtons}
          <button className="btn btn-ghost btn-xs" title="Bookmark this page" onClick={toggleBookmark} disabled={!location}>
            {bookmarked ? <TbBookmarkFilled size={16} className="text-primary" /> : <TbBookmark size={16} />}
          </button>
          <button
            className="btn btn-ghost btn-xs"
            title="Copy a link to this page"
            disabled={!location}
            onClick={() => location && copyLink(location.cfi)}
          >
            <TbLink size={16} />
          </button>
          <div className="relative">
            <button
              className={`btn btn-ghost btn-xs ${settingsOpen ? 'btn-active' : ''}`}
              title="Font and layout"
              onClick={() => setSettingsOpen(!settingsOpen)}
            >
              <TbTypography size={16} />
            </button>
            {settingsOpen ? (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setSettingsOpen(false)} />
                <div className="absolute right-0 z-40 mt-1 border rounded-md shadow-lg bg-base-100 border-base-300">
                  <ReaderSettingsMenu fixedLayout={book?.rendition?.layout === 'pre-paginated'} />
                </div>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {sidebarOpen ? (
            <div className="flex flex-col border-r w-72 shrink-0 border-base-300 bg-base-200/50">
              <div role="tablist" className="tabs tabs-border tabs-sm">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    className={`tab ${t.id === activeTab.id ? 'tab-active' : ''}`}
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">{activeTab.render()}</div>
            </div>
          ) : null}

          <div ref={rootRef} className="relative flex-1 min-w-0" onPointerDown={() => usePopups.getState().clear()}>
            {status === 'ready' && book ? (
              <FoliateViewer book={book} initialCfi={initialCfi} />
            ) : status === 'error' ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 p-8 text-center">
                <p className="text-error">Could not open the book</p>
                <p className="text-sm text-base-content/60">{error}</p>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full"><Spinner className="w-8 h-8" /></div>
            )}
            <BookPopups rootRef={rootRef} actions={selectionActions} />
            {overlay}
          </div>
        </div>

        <div className="flex items-center gap-2 px-2 py-1 text-xs border-t border-base-300 text-base-content/70">
          <button className="btn btn-ghost btn-xs" title="Previous page" onClick={() => void getView()?.goLeft()}>
            <TbChevronLeft size={16} />
          </button>
          <input
            type="range"
            min={0}
            max={1000}
            className="flex-1 range range-xs"
            value={Math.round(fraction * 1000)}
            onChange={(e) => void getView()?.goToFraction(Number(e.target.value) / 1000)}
            aria-label="Progress"
            disabled={!location}
          />
          <span className="w-24 text-right" data-testid="reader-progress">
            {location?.pageLabel ? `p. ${location.pageLabel} · ` : ''}
            {Math.round(fraction * 100)}%
          </span>
          <button className="btn btn-ghost btn-xs" title="Next page" onClick={() => void getView()?.goRight()}>
            <TbChevronRight size={16} />
          </button>
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default function ReaderView() {
  return <Reader />;
}
