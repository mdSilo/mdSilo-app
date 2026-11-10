import { useMemo } from "react";
import useHotkeys from "@/lib/hooks/useHotkeys";
import useDeleteNote from "@/writer/hooks/useDeleteNote";
import { BaseModal } from "@/ui/BaseModal";
import { useT } from "@/i18n";

type Props = {
  noteId: string;
  noteTitle: string;
  isOpen: boolean;
  handleClose: () => void;
};

export default function NoteDelModal(props: Props) {
  const t = useT();
  const { noteId, noteTitle, isOpen, handleClose } = props;

  const hotkeys = useMemo(
    () => [
      {
        hotkey: "esc",
        callback: handleClose,
      },
    ],
    [handleClose],
  );
  useHotkeys(hotkeys);

  const onDeleteClick = useDeleteNote(noteId, noteTitle);

  return (
    <BaseModal
      title={t("Delete This Work?")}
      isOpen={isOpen}
      handleClose={handleClose}
    >
      <div className="flex flex-col justify-center px-6">
        <p className="text-sm text-center">{noteId}</p>
        <button
          className="mt-2 font-bold text-error pop-btn"
          onClick={onDeleteClick}
        >
          {t("Confirm Delete")}
        </button>
        <button className="mt-4 font-bold pop-btn" onClick={handleClose}>
          {t("Cancel Delete")}
        </button>
      </div>
    </BaseModal>
  );
}
