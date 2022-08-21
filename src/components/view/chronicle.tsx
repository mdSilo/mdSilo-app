import { useState } from 'react';
import { useCurrentViewContext } from 'context/useCurrentView';
import { useStore, store } from 'lib/store';
import ErrorBoundary from 'components/misc/ErrorBoundary';
import NoteSumList from 'components/note/NoteSumList';
import FindOrCreateInput from 'components/note/NoteNewInput';
import HeatMap from 'components/HeatMap';
import { openFileAndGetNoteId } from 'editor/hooks/useOnNoteLinkClick';
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
    const genNoteId = await joinPaths(currentDir, ['daily', `${date}.md`]);
    const noteId = await openFileAndGetNoteId(genNoteId);
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
      const newDailyDir = {
        ...defaultNote,
        id: dailyDir, 
        title: 'daily', 
        file_path: dailyDir,
        is_dir: true, 
      };
      store.getState().upsertTree(newDailyDir, currentDir, true); 
      store.getState().upsertTree(newNote, dailyDir); 
    }
    dispatch({view: 'md', params: {noteId}});
  };

  const [firstDay, setFirstDay] = useState<string>('');
  const showDailyNote = (date: string) => {
    setFirstDay(date);
  };

  const first = firstDay ? [firstDay] : [];
  const dateList = [...first, ...dates];

  return (
    <ErrorBoundary>
      <div className="flex flex-1 flex-col flex-shrink-0 py-6 px-12 w-full mx-auto bg-white dark:bg-black dark:text-gray-200 overlfow-y-auto">
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
        <HeatMap onClickCell={showDailyNote} />
        <div className="overlfow-auto">
          {dateList.slice(0,42).map((d, idx) => (
            <NoteSumList
              key={`${d}-${idx}`}
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
