import MsEditor from "mdsmirror";
import { EDITOR_THEME } from '@/lib/themes';
import { useCurrentViewContext } from '@/state/useCurrentView';
import { useStore } from '@/state/store';
import { Note } from '@/types/model';
import ErrorBoundary from '@/components/misc/ErrorBoundary';
import FindOrCreateInput from '@/components/note/NoteNewInput';
import { dateCompare, regDateStr, strToDate } from '@/lib/helper';
import { openFilePath } from "@/file/open";
import { useNoteContent } from '@/lib/contentCache';

export default function Journals() {
  const initDir = useStore((state) => state.initDir);
  const notes = useStore((state) => state.notes);
  const notesArr = notes.values();
  const dailyNotes = notesArr.filter(n => regDateStr.test(n.title));
  dailyNotes.sort(
    (n1, n2) => dateCompare(strToDate(n2.title), strToDate(n1.title))
  );

  return (
    <ErrorBoundary>
      <div className="flex flex-1 flex-col shrink-0 md:shrink p-6 w-full mx-auto md:w-128 lg:w-160 xl:w-192 bg-base-100 overlfow-y-auto">
        <div className="flex justify-center my-6">
        {initDir ? (
          <FindOrCreateInput
            className="w-full bg-base-200 rounded-sm shadow-popover"
          />
        ) : null}
        </div>
        <div className="overlfow-y-auto">
          {dailyNotes.map((n) => (<NoteItem key={n.id} note={n} />))}
        </div>
      </div>
    </ErrorBoundary>
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
  const isRTL = useStore((state) => state.isRTL);
  // read on use, if not loaded
  const content = useNoteContent(note);

  return (
    <div className="flex flex-col w-full mx-auto overlfow-y-auto">
      <button 
        onClick={async () => {
          await openFilePath(note.id, true);
          dispatch({view: 'md', params: { noteId: note.id }});
        }}
        className="flex items-center ms-link text-lg py-2 pl-4"
      >
        <span className="title text-2xl text-warning font-semibold mt-4">
          {note.title}
        </span>
      </button>
      {content !== undefined ? (
        <MsEditor key={note.id} value={content} dark={darkMode} theme={EDITOR_THEME} dir={isRTL ? 'rtl' : 'ltr'} />
      ) : null}
    </div>
  );
}
