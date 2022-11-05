import { useStore } from 'lib/store';
import { getReadableDatetime } from 'utils/helper';

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
      <p>Created: {getReadableDatetime(note.created_at)}</p>
      <p>Modified: {getReadableDatetime(note.updated_at)}</p>
    </div>
  );
}

const countWords = (str: string) => {
  // special characters such as middle-dot, etc.   
  const str0 = str.replace(/[\u007F-\u00FE]/g,' ');
  // remove all not ASCII
  // https://en.wikipedia.org/wiki/List_of_Unicode_characters
  const str1 = str0.replace(/[^!-~\d\s]+/gi,' ')
  // remove characters, number
  const str2 = str0.replace(/[!-~\d\s]+/gi, '')

  const matches1 = str1.match(/[\u00FF-\uFFFF]|\S+/g);
  const matches2 = str2.match(/[\u00FF-\uFFFF]|\S+/g);
  const count1 = matches1 ? matches1.length : 0;
  const count2 = matches2 ? matches2.length : 0;

  const count = count1 + count2;
  return count;
}
