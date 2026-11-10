import { useStore } from "@/state/store";
import { fmtDatetime, countWords } from "@/lib/helper";
import { useT } from "@/i18n";

type Props = {
  noteId: string;
};

export default function NoteMetadata(props: Props) {
  const t = useT();
  const { noteId } = props;
  const note = useStore((state) => state.notes.get(noteId));

  if (!note) {
    return null;
  }

  const mdContent = note.content || "";
  const wordCount = countWords(mdContent);
  const ctnLen = mdContent.length;
  return (
    <div className="p-2 text-xs text-base-content/70 border-t border-base-300">
      {ctnLen > 0 ? (
        <p>
          {t("~{words} words, {chars} characters", {
            words: wordCount,
            chars: ctnLen,
          })}
        </p>
      ) : null}
      <p>{t("Created: {date}", { date: fmtDatetime(note.created_at) })}</p>
      <p>{t("Modified: {date}", { date: fmtDatetime(note.updated_at) })}</p>
    </div>
  );
}
