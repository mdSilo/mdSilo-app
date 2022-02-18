import { useMemo } from 'react';
import useHotkeys from 'editor/hooks/useHotkeys';
import useDeleteNote from 'editor/hooks/useDeleteNote';

type Props = {
  noteId: string;
  setIsOpen: (isOpen: boolean) => void;
};

export default function NoteDelModal(props: Props) {
  const { noteId, setIsOpen } = props;

  const hotkeys = useMemo(
    () => [
      {
        hotkey: 'esc',
        callback: () => setIsOpen(false),
      },
    ],
    [setIsOpen]
  );
  useHotkeys(hotkeys);

  const onDeleteClick = useDeleteNote(noteId);

  return (
    <div className="fixed inset-0 z-20 overflow-y-auto">
      <div className="flex justify-center px-6 max-h-screen-80 my-screen-10">
        <button className="mt-2 text-red-600 pop-btn" onClick={onDeleteClick}>Confirm Delete</button>
        <button className="mt-2 pop-btn" onClick={() => setIsOpen(false)}>Cancel Delete</button>
      </div>
    </div>
  );
}
