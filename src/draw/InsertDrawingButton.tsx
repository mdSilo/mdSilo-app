import { TbPhotoPlus } from "react-icons/tb";
import { useStore } from "@/state/store";
import { useCurrentViewContext } from "@/state/useCurrentView";
import { editorOf } from "@/writer/editors";
import { useT } from "@/i18n";
import { dirOfPath, drawingMarkdown } from "./drawing";

/**
 * Insert the picture of the drawing into the note shown, at its cursor: in
 * the WYSIWYG mode (hidden otherwise, and beside a book).
 */
export default function InsertDrawingButton({
  path,
  className,
}: {
  path: string;
  className?: string;
}) {
  const t = useT();
  const { state } = useCurrentViewContext();
  const noteId = useStore((s) => s.currentNoteId);
  if (state.view !== "md" || !noteId) return null;
  return (
    <button
      className={className}
      title={t("Insert into the note")}
      aria-label={t("Insert into the note")}
      onClick={() => {
        const editor = editorOf(noteId);
        editor?.insertMarkdown(drawingMarkdown(path, dirOfPath(noteId)));
      }}
    >
      <TbPhotoPlus size={16} />
    </button>
  );
}
