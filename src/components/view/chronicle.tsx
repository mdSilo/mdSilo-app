import { useCurrentViewContext } from 'context/useCurrentView';
import { useStore, store } from 'lib/store';
import ErrorBoundary from 'components/misc/ErrorBoundary';
import NoteSumList from 'components/note/NoteSumList';
import FindOrCreateInput from 'components/note/NoteNewInput';
import HeatMap from 'components/HeatMap';
import { dateCompare, getStrDate, regDateStr } from 'utils/helper';
import { joinPaths } from 'file/util';
import { defaultNote } from 'types/model';

export default function Chronicle() {
  const notes = useStore((state) => state.notes);
  const notesArr = Object.values(notes);
  const myNotes = notesArr.filter(n => !n.is_wiki && !n.is_daily && !n.is_dir);
  myNotes.sort((n1, n2) => dateCompare(n2.created_at, n1.created_at));
  const upDates = myNotes.map(n => getStrDate(n.created_at));
  const dateSet = new Set(upDates);
  const dates = Array.from(dateSet);

  const today = getStrDate((new Date()).toString());
  // get notes on a date
  const getDayNotes = (date: string) => myNotes.filter(n => getStrDate(n.created_at) === date);
  
  const currentView = useCurrentViewContext();
  const dispatch = currentView.dispatch;
  const currentDir = useStore(state => state.currentDir);

  const onNewDailyNote = async (date: string) => {
    if (!currentDir || !regDateStr.test(date)) return;
    const noteId = await joinPaths(currentDir, ['daily', `${date}.md`]);
    const note = store.getState().notes[noteId];
    if (!note) {
      const newNote = {
        ...defaultNote,
        id: noteId, 
        title: date, 
        file_path: noteId,
        is_daily: true, 
      };
      store.getState().upsertNote(newNote);
      const dailyDir = await joinPaths(currentDir, ['daily']);
      store.getState().upsertTree(newNote, dailyDir); 
    }
    dispatch({view: 'md', params: {noteId}});
  };

  return (
    <ErrorBoundary>
      <div className="flex flex-1 flex-col flex-shrink-0 md:flex-shrink p-6 w-full mx-auto md:w-128 lg:w-160 xl:w-192 bg-white dark:bg-gray-800 dark:text-gray-200 overlfow-y-auto">
        <div className="flex justify-center my-6">
          {currentDir ? (
            <FindOrCreateInput
              className="w-full bg-white rounded shadow-popover dark:bg-gray-800"
            />) : null
          }
        </div>
        <div className="my-1 p-1 rounded text-center">
          <button onClick={() => dispatch({view: 'journal'})} className="link text-2xl">
            Journals
          </button>
          <button className="link w-full mt-2" onClick={() => onNewDailyNote(today)}>
            Today : {today}
          </button>
        </div>
        <HeatMap onClick={onNewDailyNote} />
        <div className="overlfow-y-auto">
          {dates.map((d) => (
            <NoteSumList
              key={d}
              anchor={d}
              notes={getDayNotes(d)}
              isDate={true}
              onClick={onNewDailyNote}
            />
          ))}
        </div>
      </div>
    </ErrorBoundary>
  );
}
