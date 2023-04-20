import { useStore } from 'lib/store';
import { fmtDatetime, countWords } from 'utils/helper';

type Props = {
  noteId: string;
};

export default function NoteMetadata(props: Props) {
  const { noteId } = props;
  const note = useStore((state) => state.notes[noteId]);

  if (!note) {
    return null;
  }

  const mdContent = note.content || '';
  const wordCount = countWords(mdContent);
  const ctnLen = mdContent.length;
  return (
    <div className="p-2 text-xs text-gray-600 border-t dark:border-gray-700 dark:text-gray-400">
      {ctnLen > 0 ? (<p>~{wordCount} words, {ctnLen} characters </p>) : null}
      <p>Created: {fmtDatetime(note.created_at)}</p>
      <p>Modified: {fmtDatetime(note.updated_at)}</p>
    </div>
  );
}
