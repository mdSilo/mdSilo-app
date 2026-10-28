import { useStore } from '@/state/store';
import { fmtDatetime, countWords } from '@/lib/helper';

type Props = {
  noteId: string;
};

export default function NoteMetadata(props: Props) {
  const { noteId } = props;
  const note = useStore((state) => state.notes.get(noteId));

  if (!note) {
    return null;
  }

  const mdContent = note.content || '';
  const wordCount = countWords(mdContent);
  const ctnLen = mdContent.length;
  return (
    <div className="p-2 text-xs text-base-content/70 border-t border-base-300">
      {ctnLen > 0 ? (<p>~{wordCount} words, {ctnLen} characters </p>) : null}
      <p>Created: {fmtDatetime(note.created_at)}</p>
      <p>Modified: {fmtDatetime(note.updated_at)}</p>
    </div>
  );
}
