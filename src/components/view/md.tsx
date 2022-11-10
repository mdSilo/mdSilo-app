import { useCurrentViewContext } from 'context/useCurrentView';
import Note from 'components/note/Note';

export default function NotePage() {
  const currentView = useCurrentViewContext();
  const params = currentView.state.params;
  const noteId = params?.noteId || '';
  // const hlHash = params?.hash || '';

  if (!noteId || typeof noteId !== 'string') {
    return (
      <div className="flex flex-col items-center justify-center flex-1 h-screen p-4">
        <p className="text-2xl text-center">
          This note does not exists!
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-x-auto">
      <Note key={noteId} noteId={noteId} />
    </div>
  );
}
