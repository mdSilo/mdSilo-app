import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  TbArrowBackUp, TbArrowForwardUp, TbArrowLeft, TbBookmark, TbBookmarkFilled, TbChevronLeft, TbBrandWikipedia,
  TbChevronRight, TbChevronsLeft, TbChevronsRight, TbLanguage, TbLayoutSidebar, TbLink, TbSearch,
  TbTypography, TbVocabulary, TbVolume, 
} from 'react-icons/tb';
import ErrorBoundary from 'components/misc/ErrorBoundary';
import ResizeHandle, { useResizableWidth } from 'components/misc/ResizeHandle';
import Spinner from 'components/misc/Spinner';
import { useCurrentViewContext } from 'context/useCurrentView';
import { openFilePath } from 'file/open';
import { store, useStore } from 'lib/store';
import { READER_SIDEBAR_WIDTH } from 'lib/userSettings';
import { isMobile } from 'utils/helper';
import { annotationsPathOf } from '../annotations';
import { useReaderStore } from '../readerStore';
import { bookmarkAt, copyLink, toggleBookmark } from '../actions';
import { usePopups, type TextSelection } from '../popups';
import { resetReaderChrome, useReaderChrome } from '../chrome';
import { formatMinutes, formatProgress, turn } from '../pagination';
import { withDefaults } from '../settings';
import { themeColors } from '../styles';
import { stopTTS } from '../tts';
import { getView } from '../view';
import FoliateViewer from './FoliateViewer';
import TocView from './TocView';
import NotesView from './NotesView';
import BookPopups, { type Tool } from './BookPopups';
import ReaderSettingsMenu from './ReaderSettingsMenu';
import SearchView from './SearchView';
import LookupPopup from './LookupPopup';
import TTSBar, { canReadAloud, readAloud } from './TTSBar';

export type SidebarTab = { id: string; label: string; render: () => ReactNode };

type Props = {
  /** more tabs in the sidebar, e.g. search */
  extraTabs?: SidebarTab[];
  /** more tools on the text selected */
  tools?: (selection: TextSelection) => Tool[];
  /** more buttons in the header */
  headerButtons?: ReactNode;
  /** over the book, e.g. the panel of text-to-speech */
  overlay?: (rootRef: RefObject<HTMLDivElement | null>) => ReactNode;
};

const setSidebar = (showSidebar: boolean) => {
  const settings = withDefaults(store.getState().readerSettings);
  store.getState().setReaderSettings({ ...settings, showSidebar });
};

function BarButton({ title, onClick, disabled, active, children }: {
  title: string; onClick: () => void; disabled?: boolean; active?: boolean; children: ReactNode;
}) {
  return (
    <button
      className={`btn btn-ghost btn-sm btn-square ${active ? 'btn-active' : ''}`}
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

/** A book read, with its table of contents and annotations. */
export function Reader({ extraTabs = [], tools, headerButtons, overlay }: Props) {
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
  const settings = withDefaults(useStore((s) => s.readerSettings));
  const darkMode = useStore((s) => s.darkMode);
  const barsVisible = useReaderChrome((s) => s.barsVisible);
  const menuOpen = useReaderChrome((s) => s.menuOpen);
  const tab = useReaderChrome((s) => s.tab);
  const searchRequest = useReaderChrome((s) => s.searchRequest);
  const rootRef = useRef<HTMLDivElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // on mobile the sidebar covers the book: hidden at first, and not kept
  const [mobile] = useState(() => isMobile(768));
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const showSidebar = mobile ? mobileSidebar : settings.showSidebar;
  const toggleSidebar = mobile ? setMobileSidebar : setSidebar;
  const sidebarCol = useResizableWidth(
    useStore((s) => s.readerSidebarWidth),
    useStore((s) => s.setReaderSidebarWidth),
    READER_SIDEBAR_WIDTH,
  );

  useEffect(() => {
    if (path) void useReaderStore.getState().open(path, cfi);
  }, [path, cfi]);

  // the book is closed when another view shows
  useEffect(() => () => {
    stopTTS();
    resetReaderChrome();
    void useReaderStore.getState().close();
  }, []);

  // a search of the text selected: in the sidebar
  useEffect(() => {
    if (searchRequest) toggleSidebar(true);
  }, [searchRequest, toggleSidebar]);

  useEffect(() => {
    useReaderChrome.getState().setMenuOpen(settingsOpen);
  }, [settingsOpen]);

  // a press outside the menu closes it, e.g. on the bars above the backdrop;
  // the backdrop closes it on its click, not to let that click reach the book
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!settingsOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (menuRef.current?.contains(target) || target.dataset?.testid === 'reader-menu-backdrop') return;
      setSettingsOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [settingsOpen]);

  const tabs: SidebarTab[] = [
    { id: 'toc', label: 'Contents', render: () => <TocView toc={book?.toc ?? []} current={location?.tocHref} /> },
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
  const fixedLayout = book?.rendition?.layout === 'pre-paginated';
  const progress = formatProgress(location, fixedLayout);
  const paper = settings.pageTheme === 'auto' ? undefined : themeColors(darkMode, settings.pageTheme);
  const title = entry?.title ?? path?.split('/').pop();
  const showBars = barsVisible || menuOpen;
  const setBars = (visible: boolean) => useReaderChrome.getState().setBarsVisible(visible);
  // hidden on leaving, but not to a menu of it
  const leaveBars = () => {
    if (!useReaderChrome.getState().menuOpen) setBars(false);
  };

  return (
    <ErrorBoundary>
      {/* min-h-0: shrinks to the room left by the status bar, no scrollbar around the pages */}
      <div className="flex w-full h-full min-h-0 bg-base-100" data-testid="reader">
        {/* a click outside the menu closes it, also over the book (an iframe).
            Not in the header: its transform would make fixed = the header */}
        {settingsOpen ? (
          <div className="fixed inset-0 z-20" data-testid="reader-menu-backdrop" onClick={() => setSettingsOpen(false)} />
        ) : null}
        {showSidebar ? (
          <div
            className="relative flex flex-col border-r shrink-0 border-base-300 bg-base-200/50"
            style={{ width: sidebarCol.width }}
            data-testid="reader-sidebar"
          >
            <div className="flex items-center gap-1 px-1 pt-1">
              <div role="tablist" className="flex-1 tabs tabs-border tabs-sm">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    className={`tab ${t.id === activeTab.id ? 'tab-active' : ''}`}
                    onClick={() => useReaderChrome.getState().setTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">{activeTab.render()}</div>
            <ResizeHandle
              width={sidebarCol.width}
              bounds={READER_SIDEBAR_WIDTH}
              label="Resize contents"
              onResize={sidebarCol.onResize}
              onResizeEnd={sidebarCol.onResizeEnd}
            />
          </div>
        ) : null}

        <div
          ref={rootRef}
          className="relative flex-1 min-w-0 overflow-hidden"
          style={paper ? { background: paper.bg, color: paper.fg } : undefined}
          onPointerDown={() => usePopups.getState().clear()}
        >
          {status === 'ready' && book ? (
            <FoliateViewer book={book} initialCfi={initialCfi} />
          ) : status === 'error' ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 p-8 text-center">
              <p className="text-error">Could not open the book</p>
              <p className="text-sm opacity-60">{error}</p>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full"><Spinner className="w-8 h-8" /></div>
          )}

          {/* in the margins: the chapter above, the progress below */}
          {settings.showHeader && !showBars ? (
            <div
              className="absolute inset-x-0 top-0 flex items-center justify-center px-16 text-xs pointer-events-none opacity-60"
              style={{ height: settings.margin }}
              data-testid="reader-section"
            >
              <span className="truncate">{location?.tocLabel?.trim() || title}</span>
            </div>
          ) : null}
          {settings.showFooter && location ? (
            <div
              className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-4 px-8 text-xs pointer-events-none opacity-60"
              style={{ height: settings.margin }}
              data-testid="reader-progress-info"
            >
              <span className="truncate">{progress.left}</span>
              <span className="truncate">{progress.right}</span>
            </div>
          ) : null}
          {bookmarked && !showBars ? (
            <svg
              className="absolute top-0 z-10 w-5 h-10 pointer-events-none right-8"
              viewBox="0 0 100 200"
              preserveAspectRatio="none"
              data-testid="reader-ribbon"
              aria-hidden
            >
              <polygon fill="#ef4444" points="0 0, 100 0, 100 200, 50 160, 0 200" />
            </svg>
          ) : null}

          {/* the bars: shown on hover, on a click in the middle */}
          <div className="absolute inset-x-0 top-0 z-10 h-6" onMouseEnter={() => setBars(true)} onClick={() => setBars(true)} />
          <div className="absolute inset-x-0 bottom-0 z-10 h-6" onMouseEnter={() => setBars(true)} onClick={() => setBars(true)} />
          <div
            className={`absolute inset-x-0 top-0 z-30 flex items-center gap-1 px-2 h-11 border-b shadow-sm bg-base-100 text-base-content border-base-300 transition-[opacity,transform] duration-200 ${showBars ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'}`}
            onMouseLeave={leaveBars}
            data-testid="reader-header"
          >
            <BarButton title="Library" onClick={() => dispatch({ view: 'library' })}>
              <TbArrowLeft size={18} />
            </BarButton>
            <BarButton title="Contents and notes" active={showSidebar} onClick={() => toggleSidebar(!showSidebar)}>
              <TbLayoutSidebar size={18} />
            </BarButton>
            <BarButton title="Bookmark this page" onClick={toggleBookmark} disabled={!location}>
              {bookmarked ? <TbBookmarkFilled size={18} className="text-error" /> : <TbBookmark size={18} />}
            </BarButton>
            <div className="flex-1 min-w-0 px-2 text-sm text-center truncate">
              <span className="font-semibold">{title}</span>
              {entry?.author ? <span className="opacity-60"> · {entry.author}</span> : null}
            </div>
            {headerButtons}
            <BarButton title="Copy a link to this page" disabled={!location} onClick={() => location && copyLink(location.cfi)}>
              <TbLink size={18} />
            </BarButton>
            <div className="relative" ref={menuRef}>
              <BarButton title="Font and layout" active={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}>
                <TbTypography size={18} />
              </BarButton>
              {settingsOpen ? (
                <div className="absolute right-0 z-40 mt-1 overflow-y-auto border rounded-md shadow-lg bg-base-100 border-base-300 max-h-[75vh]">
                  <ReaderSettingsMenu fixedLayout={fixedLayout} />
                </div>
              ) : null}
            </div>
          </div>

          <FooterBar visible={showBars} onLeave={leaveBars} fixedLayout={fixedLayout} />

          {showBars ? (
            <>
              <button
                className="absolute z-20 flex items-center justify-center w-12 h-12 -translate-y-1/2 rounded-full shadow-lg left-3 top-1/2 bg-base-100/90 text-base-content active:scale-95"
                title="Previous page"
                aria-label="Previous page"
                onClick={() => void turn(getView(), 'left')}
              >
                <TbChevronLeft size={24} />
              </button>
              <button
                className="absolute z-20 flex items-center justify-center w-12 h-12 -translate-y-1/2 rounded-full shadow-lg right-3 top-1/2 bg-base-100/90 text-base-content active:scale-95"
                title="Next page"
                aria-label="Next page"
                onClick={() => void turn(getView(), 'right')}
              >
                <TbChevronRight size={24} />
              </button>
            </>
          ) : null}

          <BookPopups rootRef={rootRef} tools={tools} />
          {overlay?.(rootRef)}
        </div>
      </div>
    </ErrorBoundary>
  );
}

/** The bar below the book: back and forward, the chapters, the pages, the progress. */
function FooterBar({ visible, onLeave, fixedLayout }: { visible: boolean; onLeave: () => void; fixedLayout: boolean }) {
  const location = useReaderStore((s) => s.location);
  const fraction = location?.fraction ?? 0;
  // the place dragged to, before the book goes there
  const [dragged, setDragged] = useState<number | undefined>();
  const goTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const view = getView();
  const shown = dragged ?? fraction;
  const left = location?.time && !fixedLayout ? `${formatMinutes(location.time.total)} left in the book` : '';

  useEffect(() => () => clearTimeout(goTimer.current), []);

  return (
    <div
      className={`absolute inset-x-0 bottom-0 z-30 flex items-center gap-1 px-2 border-t shadow-sm h-12 bg-base-100 text-base-content border-base-300 transition-[opacity,transform] duration-200 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full pointer-events-none'}`}
      onMouseLeave={onLeave}
      data-testid="reader-footer"
    >
      <BarButton title="Go back" disabled={!view?.history?.canGoBack} onClick={() => view?.history.back()}>
        <TbArrowBackUp size={18} />
      </BarButton>
      <BarButton title="Go forward" disabled={!view?.history?.canGoForward} onClick={() => view?.history.forward()}>
        <TbArrowForwardUp size={18} />
      </BarButton>
      <BarButton title="Previous chapter" onClick={() => void turn(getView(), 'left', 'section')}>
        <TbChevronsLeft size={18} />
      </BarButton>
      <div className="relative flex-1 mx-1">
        <input
          type="range"
          min={0}
          max={1000}
          className="w-full range range-xs range-primary"
          value={Math.round(shown * 1000)}
          onChange={(e) => {
            const value = Number(e.target.value) / 1000;
            setDragged(value);
            clearTimeout(goTimer.current);
            goTimer.current = setTimeout(() => {
              void getView()?.goToFraction(value);
              setDragged(undefined);
            }, 150);
          }}
          aria-label="Progress"
          title={left}
          disabled={!location}
        />
        {dragged !== undefined ? (
          <span
            className="absolute px-1.5 py-0.5 text-xs -translate-x-1/2 rounded shadow -top-7 bg-base-300"
            style={{ left: `${dragged * 100}%` }}
          >
            {Math.round(dragged * 100)}%
          </span>
        ) : null}
      </div>
      <BarButton title="Next chapter" onClick={() => void turn(getView(), 'right', 'section')}>
        <TbChevronsRight size={18} />
      </BarButton>
      <span className="w-28 text-xs text-right truncate opacity-70" data-testid="reader-progress" title={left}>
        {location?.pageLabel ? `p. ${location.pageLabel} · ` : ''}
        {Math.round(fraction * 100)}%
      </span>
    </div>
  );
}

const LOOKUPS = [
  { kind: 'dictionary', icon: <TbVocabulary size={18} />, title: 'Dictionary' },
  { kind: 'wikipedia', icon: <TbBrandWikipedia size={18} />, title: 'Wikipedia' },
  { kind: 'translate', icon: <TbLanguage size={18} />, title: 'Translate' },
] as const;

/** The tools on the text selected: search, look up, translate, read aloud. */
function lookupTools(selection: TextSelection): Tool[] {
  // a word or a few: a dictionary entry
  const words = selection.text.trim().split(/\s+/).length;
  return [
    {
      id: 'search',
      title: 'Search it in the book',
      icon: <TbSearch size={18} />,
      onClick: () => {
        usePopups.getState().clear();
        useReaderChrome.getState().requestSearch(selection.text.trim());
      },
    },
    ...LOOKUPS.map((l) => ({
      id: l.kind,
      title: l.title,
      icon: l.icon,
      hidden: l.kind === 'dictionary' && words > 3,
      onClick: () => usePopups.getState().setLookup({ kind: l.kind, selection }),
    })),
    {
      id: 'tts',
      title: 'Read aloud from here',
      icon: <TbVolume size={18} />,
      hidden: !canReadAloud() || !selection.range,
      onClick: () => {
        usePopups.getState().clear();
        void readAloud(selection.range);
      },
    },
  ];
}

export default function ReaderView() {
  return (
    <Reader
      extraTabs={[{ id: 'search', label: 'Search', render: () => <SearchView /> }]}
      tools={lookupTools}
      headerButtons={canReadAloud() ? (
        <BarButton title="Read aloud" onClick={() => void readAloud()}>
          <TbVolume size={18} />
        </BarButton>
      ) : null}
      overlay={(rootRef) => (
        <>
          <LookupPopup rootRef={rootRef} />
          <TTSBar />
        </>
      )}
    />
  );
}
