import { useEffect, useState } from "react";
import {
  TbArrowsLeftRight,
  TbBookmark,
  TbBookmarkFilled,
  TbX,
} from "react-icons/tb";
import { IconButton, Spinner } from "@/ui/ui";
import { besideStyle, useBesideWidth } from "@/ui/SplitHandle";
import { useStore } from "@/state/store";
import { t, useT } from "@/i18n";
import FindOrCreateInput from "@/writer/NoteNewInput";
import { useCurrentViewContext } from "@/state/useCurrentView";
import DrawingChoices from "@/draw/DrawingChoices";
import { newDrawing, openDrawing } from "@/draw/open";
import {
  closeBeside,
  isBookNotes,
  openBeside,
  swapBeside,
} from "@/writer/beside";
import {
  findBookPath,
  readLibrary,
  titleOfFile,
  type BookEntry,
} from "../library/library";
import { useReaderStore, useSideStore } from "../readerStore";
import { bookmarkAt, toggleBookmark } from "../actions";
import { withDefaults } from "../settings";
import { themeColors } from "../styles";
import { setActivePane } from "../view";
import FoliateViewer from "./FoliateViewer";

type BookChoicesProps = {
  ws?: string;
  /** a book not to offer: the book read */
  exclude?: string;
  /** the book open beside, marked */
  current?: string;
  onPick: (book: BookEntry) => void;
};

/** The books of the library, to pick one. */
export function BookChoices({
  ws,
  exclude,
  current,
  onPick,
}: BookChoicesProps) {
  const t = useT();
  const [books, setBooks] = useState<BookEntry[]>();

  useEffect(() => {
    if (!ws) return;
    let cancelled = false;
    readLibrary(ws)
      .then((lib) =>
        Object.values(lib.books)
          // not the book read: its annotations written by one store only
          .filter((b) => b.hash !== exclude)
          .sort((a, b) => (a.title || a.file).localeCompare(b.title || b.file)),
      )
      .catch(() => [])
      .then((list) => {
        if (!cancelled) setBooks(list);
      });
    return () => {
      cancelled = true;
    };
  }, [ws, exclude]);

  return !books ? (
    <div className="flex justify-center p-3">
      <Spinner size="sm" />
    </div>
  ) : books.length === 0 ? (
    <p className="px-3 pb-3 text-sm opacity-60">
      {t("No other book in the library")}
    </p>
  ) : (
    <ul className="w-full p-1 overflow-y-auto menu menu-sm max-h-80">
      {books.map((book) => (
        <li key={book.hash}>
          <button
            className={book.hash === current ? "menu-active" : ""}
            onClick={() => onPick(book)}
          >
            <span className="flex flex-col min-w-0 text-left">
              <span className="truncate">
                {book.title || titleOfFile(book.file)}
              </span>
              {book.author ? (
                <span className="text-xs truncate opacity-60">
                  {book.author}
                </span>
              ) : null}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * What to open beside the book read: another book, a note to write, or a
 * drawing.
 */
export function ParallelBooks({ onPick }: { onPick: () => void }) {
  const t = useT();
  const ws = useReaderStore((s) => s.ws);
  const hash = useReaderStore((s) => s.hash);
  const current = useSideStore((s) => s.hash);
  const besideNote = useStore((s) => s.besideNoteId);
  const besideDrawing = useStore((s) => s.besideDrawing);
  const { dispatch } = useCurrentViewContext();
  const [tab, setTab] = useState<"books" | "notes" | "draw">(
    besideDrawing ? "draw" : besideNote ? "notes" : "books",
  );

  const pick = async (book: BookEntry) => {
    onPick();
    closeBeside();
    if (!ws) return;
    const path = await findBookPath(ws, book.hash);
    if (path) {
      await useSideStore.getState().open(path);
    } else {
      await useSideStore.getState().close();
      useSideStore.setState({
        status: "error",
        entry: book,
        error: t("The book file is not on this device"),
      });
    }
  };

  return (
    <div className="w-80" data-testid="parallel-books">
      <div role="tablist" className="tabs tabs-border tabs-sm px-1 flex-nowrap">
        <button
          role="tab"
          className={`tab ${tab === "books" ? "tab-active" : ""}`}
          onClick={() => setTab("books")}
        >
          {t("Read beside")}
        </button>
        <button
          role="tab"
          className={`tab ${tab === "notes" ? "tab-active" : ""}`}
          onClick={() => setTab("notes")}
        >
          {t("Write beside")}
        </button>
        <button
          role="tab"
          className={`tab ${tab === "draw" ? "tab-active" : ""}`}
          onClick={() => setTab("draw")}
        >
          {t("Draw beside")}
        </button>
      </div>
      {tab === "draw" ? (
        <DrawingChoices
          onPick={(path) => {
            onPick();
            void openDrawing(path, dispatch, "beside");
          }}
          onNew={() => {
            onPick();
            void newDrawing(dispatch, "beside");
          }}
        />
      ) : tab === "books" ? (
        <BookChoices
          ws={ws}
          exclude={hash}
          current={current}
          onPick={(book) => void pick(book)}
        />
      ) : (
        <FindOrCreateInput
          compact
          className="pt-1"
          exclude={isBookNotes}
          onPick={(noteId) => {
            onPick();
            void openBeside(noteId);
          }}
        />
      )}
    </div>
  );
}

/** The book beside the one read, if any: read and annotated as it is. */
export default function ParallelPane() {
  const t = useT();
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
  const width = useBesideWidth();
  if (status === "idle") return null;
  const paper =
    settings.pageTheme === "auto"
      ? undefined
      : themeColors(darkMode, settings.pageTheme);
  const title = entry?.title || (path ? titleOfFile(path) : "");
  const bookmarked = location
    ? Boolean(bookmarkAt(notes, location.cfi))
    : false;

  return (
    <div
      className="flex flex-col min-w-0"
      style={{
        ...besideStyle(width),
        ...(paper ? { background: paper.bg, color: paper.fg } : null),
      }}
      data-testid="parallel-pane"
      onPointerDown={() => setActivePane("side")}
    >
      <div className="flex items-center gap-1 px-2 border-b h-9 shrink-0 border-base-300">
        <span className="flex-1 min-w-0 text-xs truncate" title={title}>
          {`${title} § ${location?.tocLabel?.trim() || ""}`}
        </span>
        {location ? (
          <span className="text-xs opacity-50">
            {Math.round(location.fraction * 100)}%
          </span>
        ) : null}
        <IconButton
          size="xs"
          title={t("Bookmark this page of the book beside")}
          disabled={!location}
          onClick={() => toggleBookmark("side")}
        >
          {bookmarked ? (
            <TbBookmarkFilled size={16} className="text-error" />
          ) : (
            <TbBookmark size={16} />
          )}
        </IconButton>
        <IconButton size="xs" title={t("Swap sides")} onClick={swapBeside}>
          <TbArrowsLeftRight size={16} />
        </IconButton>
        <IconButton
          size="xs"
          title={t("Close the book beside")}
          onClick={() => void useSideStore.getState().close()}
        >
          <TbX size={16} />
        </IconButton>
      </div>
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {status === "ready" && book ? (
          <FoliateViewer book={book} initialCfi={initialCfi} pane="side" />
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
      </div>
    </div>
  );
}
