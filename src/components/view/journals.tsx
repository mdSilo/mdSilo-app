import MsEditor from "mdsmirror";
import { useCurrentViewContext } from 'context/useCurrentView';
import { useStore } from 'lib/store';
import { Note } from 'types/model';
import ErrorBoundary from 'components/misc/ErrorBoundary';
import FindOrCreateInput from 'components/note/NoteNewInput';
import { realDateCompare, strToDate } from 'utils/helper';
import { openFilePath } from "file/open";

export default function Journals() {
  const currentDir = useStore((state) => state.currentDir);
  const notes = useStore((state) => state.notes);
  const notesArr = Object.values(notes);
  const dailyNotes = notesArr.filter(n => n.is_daily);
  dailyNotes.sort((n1, n2) => realDateCompare(strToDate(n2.title), strToDate(n1.title)));

  return (
    <>
      <ErrorBoundary>
        <div className="flex flex-1 flex-col flex-shrink-0 md:flex-shrink p-6 w-full mx-auto md:w-128 lg:w-160 xl:w-192 bg-white dark:bg-gray-800 dark:text-gray-200 overlfow-y-auto">
          <div className="flex justify-center my-6">
          {currentDir ? (
            <FindOrCreateInput
              className="w-full bg-white rounded shadow-popover dark:bg-gray-800"
            />) : null
          }
          </div>
          <div className="overlfow-y-auto">
            {dailyNotes.map((n) => (
              <NoteItem key={n.id} note={n} />
            ))}
          </div>
        </div>
      </ErrorBoundary>
    </>
  );
}

type NoteItemProps = {
  note: Note;
};

function NoteItem(props: NoteItemProps) {
  const { note } = props;
  const currentView = useCurrentViewContext();
  const dispatch = currentView.dispatch;
  const darkMode = useStore((state) => state.darkMode);

  return (
    <div className="flex flex-col w-full mx-auto overlfow-y-auto">
      <button 
        onClick={async () => {
          await openFilePath(note.id, true);
          dispatch({view: 'md', params: { noteId: note.id }});
        }}
        className="flex items-center link text-lg py-2 pl-4"
      >
        <span className="title text-2xl text-yellow-500 font-semibold mt-4">
          {note.title}
        </span>
      </button>
      <MsEditor value={note.content} dark={darkMode} disables={['sub']} />
    </div>
  );
}
