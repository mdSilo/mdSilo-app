import { useMemo } from 'react';
import useHotkeys from 'editor/hooks/useHotkeys';
import useDeleteNote from 'editor/hooks/useDeleteNote';
import { BaseModal } from 'components/settings/BaseModal';

type Props = {
  noteId: string;
  noteTitle: string;
  isOpen: boolean;
  handleClose: () => void;
};

export default function NoteDelModal(props: Props) {
  const { noteId, noteTitle, isOpen, handleClose } = props;

  const hotkeys = useMemo(
    () => [
      {
        hotkey: 'esc',
        callback: handleClose,
      },
    ],
    [handleClose]
  );
  useHotkeys(hotkeys);

  const onDeleteClick = useDeleteNote(noteId, noteTitle);

  return (
    <BaseModal title="Delete This Work?" isOpen={isOpen} handleClose={handleClose}>
      <div className="flex flex-col justify-center px-6">
        <p className="text-sm text-center">{noteId}</p>
        <button className="mt-2 font-bold text-red-600 pop-btn" onClick={onDeleteClick}>
          Confirm Delete
        </button>
        <button className="mt-4 font-bold pop-btn" onClick={handleClose}>
          Cancel Delete
        </button>
      </div>
    </BaseModal>
  );
}
