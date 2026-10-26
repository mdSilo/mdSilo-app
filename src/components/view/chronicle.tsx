import { useCallback, useMemo, useState } from 'react';
import { useCurrentViewContext } from 'context/useCurrentView';
import { useStore, store, Notes } from 'lib/store';
import ErrorBoundary from 'components/misc/ErrorBoundary';
import NoteSumList from 'components/note/NoteSumList';
import FindOrCreateInput from 'components/note/NoteNewInput';
import HeatMap from 'components/view/HeatMap';
import { dateCompare, getStrDate, regDateStr } from 'utils/helper';
import { joinPaths } from 'file/util';
import { defaultNote, Note } from 'types/model';
import { openFilePath } from 'file/open';
import useLoadNotes from 'editor/hooks/useLoadNotes';
import { checkFileIsMd } from 'file/process';
import { useWritingRoot } from 'workspace/useWorkspace';

export default function Chronicle() {
  useLoadNotes();
  const initDir = useStore((state) => state.initDir);
  // daily notes are in writing/daily in the workspace layout
  const notesRoot = useWritingRoot();

  const currentView = useCurrentViewContext();
  const dispatch = currentView.dispatch;

  const onNewDailyNote = useCallback(async (date: string) => {
    if (!notesRoot || !regDateStr.test(date)) return;
    const noteId = await joinPaths(notesRoot, ['daily', `${date}.md`]);
    const note = await openFilePath(noteId, true);
    if (!note) {
      const newNote: Note = {
        ...defaultNote,
        id: noteId,
        title: date,
        file_path: noteId,
        is_daily: true,
      };
      store.getState().upsertNote(newNote);
      const dailyDir = await joinPaths(notesRoot, ['daily']);
      const newDailyDir: Note = {
        ...defaultNote,
        id: dailyDir,
        title: 'daily',
        file_path: dailyDir,
        is_dir: true,
      };
      store.getState().upsertTree(notesRoot, [newDailyDir]);
      store.getState().upsertTree(dailyDir, [newNote]);
      const cNote: Notes = {};
      cNote[noteId] = newNote;
      store.getState().setCurrentNote(cNote);
    }
    dispatch({view: 'md', params: { noteId }});
  }, [dispatch, notesRoot]);

  const today = getStrDate((new Date()).toString());

  return (
    <ErrorBoundary>
      <div className="flex flex-1 flex-col shrink-0 py-6 px-12 w-full mx-auto bg-base-100 overlfow-y-auto">
        <div className="flex justify-center my-6">
          {initDir ? (
            <FindOrCreateInput
              className="w-full bg-base-200 rounded-sm shadow-popover"
            />
          ) : null}
        </div>
        <div className="my-1 p-1 rounded-sm text-center">
          <button onClick={() => dispatch({view: 'journal'})} className="ms-link text-2xl">
            Journals
          </button>
          <button className="ms-link w-full mt-2" onClick={() => onNewDailyNote(today)}>
            Today : {today}
          </button>
        </div>
        <HeatMapAndList onNewDailyNote={onNewDailyNote} />
      </div>
    </ErrorBoundary>
  );
}

type Props = {
  onNewDailyNote: (date: string) => void;
  className?: string;
};

function HeatMapAndList(props: Props) {
  const { onNewDailyNote } = props
  // console.log("heat loaded?");

  const notes = useStore((state) => state.notes);

  const noteList: readonly Note[] = notes.values();

  const sortedNotes = useMemo(() => {
    const myNotes = noteList.filter(n => !n.is_daily && !n.is_dir && checkFileIsMd(n.id));
    myNotes.sort((n1, n2) => dateCompare(n2.updated_at, n1.updated_at));
    return myNotes;
  }, [noteList])

  const [firstDay, setFirstDay] = useState<string>('');
  const showDailyNote = useCallback((date: string) => {
    setFirstDay(date);
  }, []);

  const dateArr = useMemo(() => {
    const upDates = sortedNotes.map(n => getStrDate(n.updated_at));
    const dateSet = new Set(upDates);
    const dates = Array.from(dateSet);
    const first = firstDay ? [firstDay] : [];
    const dateList = [...first, ...dates];
    return dateList;
  }, [firstDay, sortedNotes])

  // get notes on a date
  const getDayNotes = useCallback(
    (date: string) => sortedNotes.filter(n => getStrDate(n.updated_at) === date),
    [sortedNotes]
  );

  return (
    <>
      <div className="flex items-center justify-center overlfow-auto">
        <HeatMap noteList={noteList} onClickCell={showDailyNote} />
      </div>
      <div className="overlfow-auto">
        {dateArr.slice(0,42).map((d, idx) => (
          <NoteSumList
            key={`${d}-${idx}`}
            anchor={d}
            notes={getDayNotes(d)}
            isDate={true}
            onClick={onNewDailyNote}
          />
        ))}
      </div>
    </>
  );
}
