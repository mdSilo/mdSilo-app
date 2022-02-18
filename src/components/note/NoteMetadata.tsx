import { Note } from 'types/model';
import { getSerializedNote } from './NoteExport';

type Props = {
  note: Note;
};

export default function NoteMetadata(props: Props) {
  const { note } = props;
  const serNoteCtn = getSerializedNote(note);
  const wordCount = countWords(serNoteCtn);
  const ctnLen = serNoteCtn.length;
  return (
    <div className="px-4 py-2 space-y-1 text-xs text-gray-600 border-t dark:border-gray-700 dark:text-gray-400">
      <p>~{wordCount} words, {ctnLen} characters </p>
      <p>Created: {getReadableDatetime(note.created_at)}</p>
      <p>Modified: {getReadableDatetime(note.updated_at)}</p>
    </div>
  );
}

const getReadableDatetime = (dateStr: string) => {
  return new Date(dateStr).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    hourCycle: 'h24',
  });
};

const countWords = (str: string) => {
  // special characters such as middle-dot, etc.   
  const str0 = str.replace(/[\u007F-\u00FE]/g,' ');
  // remove all not ASCII
  // https://en.wikipedia.org/wiki/List_of_Unicode_characters
  const str1 = str0.replace(/[^!-~\d\s]+/gi,' ')
  /// remove characters, number
  const str2 = str0.replace(/[!-~\d\s]+/gi, '')

  const matches1 = str1.match(/[\u00FF-\uFFFF]|\S+/g);
  const matches2 = str2.match(/[\u00FF-\uFFFF]|\S+/g);
  const count1 = matches1 ? matches1.length : 0;
  const count2 = matches2 ? matches2.length : 0;

  const count = count1 + count2;
  return count;
}
