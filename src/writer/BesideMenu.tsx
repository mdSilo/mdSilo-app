import { useCallback, useState } from "react";
import { useCurrentViewContext } from "@/state/useCurrentView";
import { useStore } from "@/state/store";
import { BookChoices } from "@/reader/components/ParallelPane";
import { findBookPath, type BookEntry } from "@/reader/library/library";
import { useT } from "@/i18n";
import DrawingChoices from "@/draw/DrawingChoices";
import { newDrawing, openDrawing } from "@/draw/open";
import FindOrCreateInput from "./NoteNewInput";
import { isBookNotes, openBeside } from "./beside";

type Props = {
  /** the note shown */
  noteId: string;
  onDone: () => void;
};

/**
 * What to open beside the note shown: a note to write (parallel writing),
 * a book to read, the note then beside the book, or a drawing.
 */
export default function BesideMenu({ noteId, onDone }: Props) {
  const t = useT();
  const { dispatch } = useCurrentViewContext();
  const ws = useStore((s) => s.initDir);
  const [tab, setTab] = useState<"notes" | "books" | "draw">("notes");
  const [missing, setMissing] = useState(false);
  const exclude = useCallback(
    (id: string) => id === noteId || isBookNotes(id),
    [noteId],
  );

  const readBeside = async (book: BookEntry) => {
    const path = ws ? await findBookPath(ws, book.hash) : undefined;
    if (!path) {
      setMissing(true);
      return;
    }
    onDone();
    // the book shown, this note beside it
    dispatch({ view: "book", path });
    await openBeside(noteId);
  };

  return (
    <div className="w-80" data-testid="beside-menu">
      <div role="tablist" className="tabs tabs-border tabs-sm px-1 flex-nowrap">
        <button
          role="tab"
          className={`tab ${tab === "notes" ? "tab-active" : ""}`}
          onClick={() => setTab("notes")}
        >
          {t("Write beside")}
        </button>
        <button
          role="tab"
          className={`tab ${tab === "books" ? "tab-active" : ""}`}
          onClick={() => setTab("books")}
        >
          {t("Read beside")}
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
            onDone();
            void openDrawing(path, dispatch, "beside");
          }}
          onNew={() => {
            onDone();
            void newDrawing(dispatch, "beside");
          }}
        />
      ) : tab === "notes" ? (
        <FindOrCreateInput
          compact
          className="pt-1"
          exclude={exclude}
          onPick={(id) => {
            onDone();
            void openBeside(id);
          }}
        />
      ) : (
        <>
          {missing ? (
            <p className="px-3 pt-2 text-xs text-error">
              {t("The book file is not on this device")}
            </p>
          ) : null}
          <BookChoices ws={ws} onPick={(book) => void readBeside(book)} />
        </>
      )}
    </div>
  );
}
