import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  TbArrowBackUp,
  TbArrowForwardUp,
  TbArrowLeft,
  TbBookmark,
  TbBookmarkFilled,
  TbChevronLeft,
  TbChevronRight,
  TbChevronsLeft,
  TbChevronsRight,
  TbLanguage,
  TbLayoutSidebar,
  TbSearch,
  TbColumns2,
  TbTypography,
  TbVocabulary,
  TbVolume,
  TbPuzzle,
} from "react-icons/tb";
import { FaList, FaSearch } from "react-icons/fa";
import { CgNotes } from "react-icons/cg";
import { VscReferences } from "react-icons/vsc";
import ViewMenu from "@/shell/ViewMenu";
import ErrorBoundary from "@/ui/ErrorBoundary";
import ResizeHandle, { useResizableWidth } from "@/ui/ResizeHandle";
import { IconButton, Spinner } from "@/ui/ui";
import { useCurrentViewContext } from "@/state/useCurrentView";
import { openFilePath } from "@/workspace/open";
import { store, useStore } from "@/state/store";
import { READER_SIDEBAR_WIDTH } from "@/state/userSettings";
import useIsMobile from "@/lib/hooks/useIsMobile";
import { selectionActionsIn } from "@/plugins/selection";
import OverlayScroll, { useScroller } from "@/ui/OverlayScroll";
import { PluginIcon } from "@/plugins/PluginIcon";
import { ReaderPanelHost, ReaderPanelsButton } from "@/plugins/ReaderPanels";
import { t, tk, useT } from "@/i18n";
import { annotationsPathOf } from "../annotations/annotations";
import { useActiveStore, useReaderStore, useSideStore } from "../readerStore";
import { bookmarkAt, toggleBookmark } from "../actions";
import { usePopups, type TextSelection } from "../popups";
import { resetReaderChrome, useReaderChrome } from "../chrome";
import { formatMinutes, formatProgress, turn } from "../pagination";
import { withDefaults } from "../settings";
import { FRAME_BAND, FRAME_INNER, themeColors } from "../styles";
import { stopTTS } from "../tts/tts";
import { getView, usePane } from "../view";
import { canReadAloud, readAloud, useCanReadAloud } from "../tts/readAloud";
import NotesView from "../annotations/NotesView";
import LinksView from "../annotations/LinksView";
import TranslatedBookDialog from "../translation/TranslatedBookDialog";
import LookupPopup from "../lookup/LookupPopup";
import PluginActionPopup from "../lookup/PluginActionPopup";
import { isLookupText } from "../dictionary/dictionary";
import FoliateViewer from "./FoliateViewer";
import TocView from "./TocView";
import BookPopups, { type Tool } from "./BookPopups";
import ReaderSettingsMenu from "./ReaderSettingsMenu";
import SearchView from "./SearchView";
import ParallelPane, { ParallelBooks } from "./ParallelPane";

export type SidebarTab = {
  id: string;
  label: string;
  icon: ReactNode;
  render: () => ReactNode;
};

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

/** A book read, with its table of contents and annotations. */
export function Reader({
  extraTabs = [],
  tools,
  headerButtons,
  overlay,
}: Props) {
  const t = useT();
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
  const vertical = useReaderStore((s) => s.vertical);
  const settings = withDefaults(useStore((s) => s.readerSettings));
  const darkMode = useStore((s) => s.darkMode);
  const barsVisible = useReaderChrome((s) => s.barsVisible);
  const menuOpen = useReaderChrome((s) => s.menuOpen);
  const tab = useReaderChrome((s) => s.tab);
  const translatedBook = useReaderChrome((s) => s.translatedBook);
  const searchRequest = useReaderChrome((s) => s.searchRequest);
  const rootRef = useRef<HTMLDivElement>(null);
  // the book read and the book beside it: the popups over either
  const booksRef = useRef<HTMLDivElement>(null);
  // the menu open in the header, if any
  const [menu, setMenu] = useState<"settings" | "parallel">();
  const settingsOpen = menu === "settings";
  const closeMenu = () => setMenu(undefined);
  const parallelOpen = useSideStore((s) => s.status !== "idle");
  // the sidebar: of the book last used, of the two read side by side
  const activePane = usePane((s) => s.active);
  const panelBook = useActiveStore((s) => s.book);
  const panelPath = useActiveStore((s) => s.path);
  const panelLocation = useActiveStore((s) => s.location);
  const panelNotes = useActiveStore((s) => s.notes);
  const panelTitle = useActiveStore(
    (s) => s.entry?.title ?? s.path?.split("/").pop(),
  );
  const format = useReaderStore((s) => s.format);
  // on mobile the sidebar covers the book: hidden at first, and not kept
  const mobile = useIsMobile();
  const [mobileSidebar, setMobileSidebar] = useState(false);
  // ... and closed once the book goes somewhere: a chapter, a search result
  const cfiNow = useReaderStore((s) => s.location?.cfi);
  useEffect(() => {
    setMobileSidebar(false);
  }, [cfiNow]);
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
  useEffect(
    () => () => {
      stopTTS();
      resetReaderChrome();
      void useSideStore.getState().close();
      void useReaderStore.getState().close();
    },
    [],
  );

  // a search of the text selected: in the sidebar
  useEffect(() => {
    if (searchRequest) toggleSidebar(true);
  }, [searchRequest, toggleSidebar]);

  useEffect(() => {
    useReaderChrome.getState().setMenuOpen(Boolean(menu));
  }, [menu]);

  // a press outside the menu closes it, e.g. on the bars above the backdrop;
  // the backdrop closes it on its click, not to let that click reach the book
  const menuRef = useRef<HTMLDivElement>(null);
  // the panel of the tabs, scrolled: a long table of contents drawn in part in it
  const [panelScroller, panelScrollerRef] = useScroller();
  useEffect(() => {
    if (!menu) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (
        menuRef.current?.contains(target) ||
        target.dataset?.testid === "reader-menu-backdrop"
      )
        return;
      setMenu(undefined);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, [menu]);

  const tabs: SidebarTab[] = [
    {
      id: "toc",
      label: t("Table of Contents"),
      icon: <FaList size={18} />,
      render: () => (
        <TocView
          toc={panelBook?.toc ?? []}
          current={panelLocation?.tocHref}
          scroller={panelScroller}
        />
      ),
    },
    {
      id: "notes",
      label: panelNotes.length
        ? t("Notes {count}", { count: panelNotes.length })
        : t("Notes"),
      icon: <CgNotes size={18} />,
      render: () => (
        <NotesView
          onOpenFile={
            panelPath
              ? async () => {
                  const mdPath = annotationsPathOf(panelPath);
                  await (activePane === "side" ? useSideStore : useReaderStore)
                    .getState()
                    .flush();
                  await openFilePath(mdPath, true);
                  dispatch({ view: "md", params: { noteId: mdPath } });
                }
              : undefined
          }
        />
      ),
    },
    {
      id: "links",
      label: t("Links"),
      icon: <VscReferences size={18} />,
      render: () => (
        <LinksView
          flush={() =>
            (activePane === "side" ? useSideStore : useReaderStore)
              .getState()
              .flush()
          }
        />
      ),
    },
    {
      id: "search",
      label: t("Search"),
      icon: <FaSearch size={18} />,
      render: () => <SearchView />,
    },
    ...extraTabs,
  ];
  const activeTab = tabs.find((t) => t.id === tab) ?? tabs[0];
  const bookmarked = location
    ? Boolean(bookmarkAt(notes, location.cfi))
    : false;
  const fixedLayout = book?.rendition?.layout === "pre-paginated";
  const progress = formatProgress(location, fixedLayout);
  const paper =
    settings.pageTheme === "auto"
      ? undefined
      : themeColors(darkMode, settings.pageTheme);
  const title = entry?.title ?? path?.split("/").pop();
  const sideTitle = parallelOpen ? panelTitle : title;
  const showBars = barsVisible || menuOpen;
  // written down the page: the chapter on the right, the progress on the left, written down too
  // (their px- padding is inline, so above and below)
  const band = (side: "left" | "right") => ({
    writingMode: "vertical-rl" as const,
    ...(settings.doubleBorder
      ? {
          [side]: FRAME_INNER,
          top: FRAME_INNER,
          bottom: FRAME_INNER,
          width: FRAME_BAND,
        }
      : { [side]: 0, top: 0, bottom: 0, width: settings.margin }),
  });
  const setBars = (visible: boolean) =>
    useReaderChrome.getState().setBarsVisible(visible);
  // hidden on leaving, but not to a menu of it
  const leaveBars = () => {
    if (!useReaderChrome.getState().menuOpen) setBars(false);
  };

  return (
    <ErrorBoundary>
      {/* min-h-0: shrinks to the room left by the status bar, no scrollbar around the pages */}
      <div
        className="relative flex w-full h-full min-h-0 bg-base-100"
        data-testid="reader"
      >
        {/* a click outside the menu closes it, also over the book (an iframe).
            Not in the header: its transform would make fixed = the header */}
        {menu ? (
          <div
            className="fixed inset-0 z-20"
            data-testid="reader-menu-backdrop"
            onClick={closeMenu}
          />
        ) : null}
        {showSidebar && mobile ? (
          <div
            className="absolute inset-0 z-30 bg-base-content/25"
            data-testid="reader-sidebar-backdrop"
            onClick={() => toggleSidebar(false)}
          />
        ) : null}
        {showSidebar ? (
          <div
            className={
              mobile
                ? "absolute inset-y-0 left-0 z-40 flex flex-col border-r shadow-popover border-base-300 bg-base-200"
                : "relative flex flex-col border-r shrink-0 border-base-300 bg-base-200/50"
            }
            style={{
              width: sidebarCol.width,
              maxWidth: mobile ? "85vw" : undefined,
            }}
            data-testid="reader-sidebar"
          >
            {sideTitle ? (
              <div
                className="px-2 pt-2 text-xs truncate font-bold"
                data-testid="reader-sidebar-book"
                title={sideTitle}
              >
                {sideTitle}
              </div>
            ) : null}
            <div className="flex items-center gap-1 px-1 pt-1">
              <div
                role="tablist"
                className="flex-1 justify-between tabs tabs-border"
              >
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    title={t.label}
                    className={`tab ${t.id === activeTab.id ? "text-primary" : ""}`}
                    onClick={() => useReaderChrome.getState().setTab(t.id)}
                  >
                    {t.icon}
                  </button>
                ))}
              </div>
            </div>
            <OverlayScroll scroller={panelScroller} className="flex-1 min-h-0">
              <div ref={panelScrollerRef} className="h-full overflow-y-auto">
                {activeTab.render()}
              </div>
            </OverlayScroll>
            {mobile ? null : (
              <ResizeHandle
                width={sidebarCol.width}
                bounds={READER_SIDEBAR_WIDTH}
                label={t("Resize contents")}
                onResize={sidebarCol.onResize}
                onResizeEnd={sidebarCol.onResizeEnd}
              />
            )}
          </div>
        ) : null}

        <div
          ref={booksRef}
          className="relative flex flex-1 min-w-0"
          onPointerDown={() => usePopups.getState().clear()}
        >
          <div
            ref={rootRef}
            className="relative flex-1 min-w-0 overflow-hidden"
            style={
              paper ? { background: paper.bg, color: paper.fg } : undefined
            }
          >
            {status === "ready" && book ? (
              <FoliateViewer book={book} initialCfi={initialCfi} />
            ) : status === "error" ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 p-8 text-center">
                <p className="text-error">{t("Could not open the book")}</p>
                <p className="text-sm opacity-60">{error}</p>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <Spinner />
              </div>
            )}

            {/* in the margins: the chapter above, the progress below */}
            {settings.showHeader && !showBars ? (
              <div
                className={`absolute flex items-center justify-center text-xs pointer-events-none opacity-60 ${vertical ? "" : "inset-x-0 top-0"} px-16`}
                style={vertical ? band("right") : { height: settings.margin }}
                data-testid="reader-section"
              >
                <span className="truncate">
                  {location?.tocLabel?.trim() || title}
                </span>
              </div>
            ) : null}
            {settings.showFooter && location ? (
              <div
                className={`absolute flex items-center justify-between gap-4 text-xs pointer-events-none opacity-60 ${vertical ? "" : "inset-x-0 bottom-0"} px-8`}
                style={vertical ? band("left") : { height: settings.margin }}
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
                <polygon
                  fill="#ef4444"
                  points="0 0, 100 0, 100 200, 50 160, 0 200"
                />
              </svg>
            ) : null}

            {/* the bars: shown on hover, on a click in the middle */}
            <div
              className="absolute inset-x-0 top-0 z-10 h-6"
              onMouseEnter={() => setBars(true)}
              onClick={() => setBars(true)}
            />
            <div
              className="absolute inset-x-0 bottom-0 z-10 h-6"
              onMouseEnter={() => setBars(true)}
              onClick={() => setBars(true)}
            />
            <div
              className={`absolute inset-x-0 top-0 z-30 flex items-center gap-1 px-2 h-11 border-b shadow-sm bg-base-100 text-base-content border-base-300 transition-[opacity,transform] duration-200 ${showBars ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-full pointer-events-none"}`}
              onMouseLeave={leaveBars}
              data-testid="reader-header"
            >
              <ViewMenu />
              <IconButton
                title={t("Library")}
                onClick={() => dispatch({ view: "library" })}
              >
                <TbArrowLeft size={18} />
              </IconButton>
              <IconButton
                title={t("Contents and notes")}
                active={showSidebar}
                onClick={() => toggleSidebar(!showSidebar)}
              >
                <TbLayoutSidebar size={18} />
              </IconButton>
              <IconButton
                title={t("Bookmark this page")}
                onClick={() => toggleBookmark("main")}
                disabled={!location}
              >
                {bookmarked ? (
                  <TbBookmarkFilled size={18} className="text-error" />
                ) : (
                  <TbBookmark size={18} />
                )}
              </IconButton>
              <div className="flex-1 min-w-0 px-2 text-sm text-center truncate">
                <span className="font-semibold">{title}</span>
              </div>
              {headerButtons}
              <div className="relative flex items-center gap-1" ref={menuRef}>
                {/* a book beside, e.g. its translation: not on a phone */}
                {!mobile && format ? (
                  <IconButton
                    title={t("Parallel reading")}
                    active={menu === "parallel" || parallelOpen}
                    onClick={() =>
                      setMenu(menu === "parallel" ? undefined : "parallel")
                    }
                  >
                    <TbColumns2 size={18} />
                  </IconButton>
                ) : null}
                <IconButton
                  title={t("Font and layout")}
                  active={settingsOpen}
                  onClick={() => setMenu(settingsOpen ? undefined : "settings")}
                >
                  <TbTypography size={18} />
                </IconButton>
                {menu ? (
                  <div className="absolute right-0 z-40 overflow-y-auto border rounded-md shadow-lg top-full mt-1 bg-base-100 border-base-300 max-h-[75vh]">
                    {settingsOpen ? (
                      <ReaderSettingsMenu fixedLayout={fixedLayout} />
                    ) : (
                      <ParallelBooks onPick={closeMenu} />
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            <FooterBar
              visible={showBars}
              onLeave={leaveBars}
              fixedLayout={fixedLayout}
            />

            {showBars ? (
              <>
                <button
                  className="absolute z-20 flex items-center justify-center w-12 h-12 -translate-y-1/2 rounded-full shadow-lg left-3 top-1/2 bg-base-100/90 text-base-content active:scale-95"
                  title={t("Previous page")}
                  aria-label={t("Previous page")}
                  onClick={() => void turn(getView("main"), "left")}
                >
                  <TbChevronLeft size={20} />
                </button>
                <button
                  className="absolute z-20 flex items-center justify-center w-12 h-12 -translate-y-1/2 rounded-full shadow-lg right-3 top-1/2 bg-base-100/90 text-base-content active:scale-95"
                  title={t("Next page")}
                  aria-label={t("Next page")}
                  onClick={() => void turn(getView("main"), "right")}
                >
                  <TbChevronRight size={20} />
                </button>
              </>
            ) : null}
          </div>
          <ParallelPane />
          <BookPopups rootRef={booksRef} tools={tools} />
          {overlay?.(booksRef)}
          {translatedBook ? <TranslatedBookDialog /> : null}
        </div>
      </div>
    </ErrorBoundary>
  );
}

type FooterBarProps = {
  visible: boolean;
  onLeave: () => void;
  fixedLayout: boolean;
};

/** The bar below the book: back and forward, the chapters, the pages, the progress. */
function FooterBar({ visible, onLeave, fixedLayout }: FooterBarProps) {
  const t = useT();
  const location = useReaderStore((s) => s.location);
  const fraction = location?.fraction ?? 0;
  // the place dragged to, before the book goes there
  const [dragged, setDragged] = useState<number | undefined>();
  const goTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const view = getView("main");
  const shown = dragged ?? fraction;
  const left =
    location?.time && !fixedLayout
      ? `${formatMinutes(location.time.total)} left in the book`
      : "";

  useEffect(() => () => clearTimeout(goTimer.current), []);

  return (
    <div
      className={`absolute inset-x-0 bottom-0 z-30 flex items-center gap-1 px-2 border-t shadow-sm h-12 bg-base-100 text-base-content border-base-300 transition-[opacity,transform] duration-200 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-full pointer-events-none"}`}
      onMouseLeave={onLeave}
      data-testid="reader-footer"
    >
      <IconButton
        title={t("Go back")}
        disabled={!view?.history?.canGoBack}
        onClick={() => view?.history.back()}
      >
        <TbArrowBackUp size={18} />
      </IconButton>
      <IconButton
        title={t("Go forward")}
        disabled={!view?.history?.canGoForward}
        onClick={() => view?.history.forward()}
      >
        <TbArrowForwardUp size={18} />
      </IconButton>
      <IconButton
        title={t("Previous chapter")}
        onClick={() => void turn(getView("main"), "left", "section")}
      >
        <TbChevronsLeft size={18} />
      </IconButton>
      <div className="relative flex-1 mx-1">
        <input
          type="range"
          min={0}
          max={1000}
          className="w-full range range-xs range-primary h-4"
          value={Math.round(shown * 1000)}
          onChange={(e) => {
            const value = Number(e.target.value) / 1000;
            setDragged(value);
            clearTimeout(goTimer.current);
            goTimer.current = setTimeout(() => {
              void getView("main")?.goToFraction(value);
              setDragged(undefined);
            }, 150);
          }}
          aria-label={t("Progress")}
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
      <IconButton
        title={t("Next chapter")}
        onClick={() => void turn(getView("main"), "right", "section")}
      >
        <TbChevronsRight size={18} />
      </IconButton>
      <span
        className="w-28 text-xs text-right truncate opacity-70"
        data-testid="reader-progress"
        title={left}
      >
        {location?.pageLabel
          ? `${t("p. {page}", { page: location.pageLabel })} · `
          : ""}
        {Math.round(fraction * 100)}%
      </span>
    </div>
  );
}

const LOOKUPS = [
  { kind: "translate", icon: <TbLanguage size={18} />, title: tk("Translate") },
  {
    kind: "dictionary",
    icon: <TbVocabulary size={18} />,
    title: tk("Dictionary"),
  },
] as const;

/** The tools on the text selected: search, look up, translate, read aloud. */
function lookupTools(selection: TextSelection): Tool[] {
  const pluginActions = selectionActionsIn("reader");
  return [
    {
      id: "search",
      title: t("Search it in the book"),
      icon: <TbSearch size={18} />,
      onClick: () => {
        usePopups.getState().clear();
        useReaderChrome.getState().requestSearch(selection.text.trim());
      },
    },
    ...LOOKUPS.map((l) => ({
      id: l.kind,
      title: t(l.title),
      icon: l.icon,
      hidden: l.kind === "dictionary" && !isLookupText(selection.text),
      onClick: () =>
        usePopups.getState().setLookup({ kind: l.kind, selection }),
    })),
    // the actions of plugins: in a menu under one button
    {
      id: "plugins",
      title: t("Plugins"),
      icon: <TbPuzzle size={18} />,
      hidden: !pluginActions.length,
      menu: pluginActions.map(({ plugin, action }) => ({
        id: `${plugin.id}:${action.id}`,
        title: action.title,
        group: plugin.manifest?.name,
        icon: <PluginIcon plugin={plugin} size={16} />,
        onClick: () =>
          usePopups.getState().setPluginAction({
            plugin: plugin.id,
            action: action.id,
            title: action.title,
            selection,
          }),
      })),
    },
    {
      id: "tts",
      title: t("Read aloud from here"),
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
  const t = useT();
  const canRead = useCanReadAloud();
  return (
    <Reader
      tools={lookupTools}
      headerButtons={
        <>
          <ReaderPanelsButton />
          {canRead ? (
            <IconButton
              title={t("Read aloud")}
              onClick={() => void readAloud(undefined, "main")}
            >
              <TbVolume size={18} />
            </IconButton>
          ) : null}
        </>
      }
      overlay={(rootRef) => (
        <>
          <LookupPopup rootRef={rootRef} />
          <PluginActionPopup rootRef={rootRef} />
          <ReaderPanelHost />
        </>
      )}
    />
  );
}
