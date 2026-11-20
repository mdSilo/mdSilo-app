import { useEffect } from "react";
import { useCurrentViewContext } from "@/state/useCurrentView";
import { useStore } from "@/state/store";
import Note from "@/writer/Note";
import BesideNote from "@/writer/BesideNote";
import { closeBeside, setNotePane } from "@/writer/beside";
import { useNoteReloads } from "@/workspace/noteReloads";
import useIsMobile from "@/lib/hooks/useIsMobile";
import { useT } from "@/i18n";

export default function NotePage() {
  const t = useT();
  const currentView = useCurrentViewContext();
  const params = currentView.state.params;
  const noteId = params?.noteId || "";
  // mounted again when the note changed on disk, e.g. by a sync
  const reloads = useNoteReloads((s) => s.seq);
  // const hlHash = params?.hash || '';
  // a note beside it (parallel writing): not on a phone
  const beside = useStore((s) => s.besideNoteId);
  const onLeft = useStore((s) => s.besideOnLeft);
  const mobile = useIsMobile();
  // the note beside opened here: one editor of it only, this one
  useEffect(() => {
    if (beside && beside === noteId) closeBeside();
  }, [beside, noteId]);
  const showBeside = Boolean(beside) && beside !== noteId && !mobile;

  if (!noteId || typeof noteId !== "string") {
    return (
      <div className="flex flex-col items-center justify-center flex-1 h-screen p-4">
        <p className="text-2xl text-center">
          {t("This note does not exists!")}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-1 min-w-0 overflow-x-auto ${showBeside && onLeft ? "flex-row-reverse" : ""}`}
    >
      <div
        className="flex flex-1 min-w-0"
        onPointerDownCapture={() => setNotePane("main")}
        onFocusCapture={() => setNotePane("main")}
      >
        <Note key={`${noteId}#${reloads}`} noteId={noteId} />
      </div>
      {showBeside ? <BesideNote /> : null}
    </div>
  );
}
