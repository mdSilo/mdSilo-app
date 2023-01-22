import { useCallback, useRef, useState } from 'react';
import { Menu } from '@headlessui/react';
import { IconDots, IconFileText, IconLayout, IconMarkdown, IconPrinter, IconTournament, IconTrash } from '@tabler/icons';
import { usePopper } from 'react-popper';
import { useCurrentMdContext } from 'context/useCurrentMd';
import { useStore } from 'lib/store';
import { openFilePath } from 'file/open';
import Tooltip from 'components/misc/Tooltip';
import Portal from 'components/misc/Portal';
import { DropdownItem } from 'components/misc/Dropdown';
import NoteMetadata from 'components/note/NoteMetadata';
import NoteDelModal from 'components/note/NoteDelModal';

type Props = {
  onPrint?: () => void;
};

export default function NoteHeader({ onPrint } : Props) {
  const currentNote = useCurrentMdContext();
  const note = useStore((state) => state.notes[currentNote.id]);

  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(
    null
  );
  const { styles, attributes } = usePopper(
    menuButtonRef.current,
    popperElement,
    { placement: 'bottom-start' }
  );

  const rawMode = useStore((state) => state.rawMode);
  const setRawMode = useStore((state) => state.setRawMode);
  const setRaw = useCallback(
    async (mode: string) => {
      await openFilePath(note.id, true);
      setRawMode(mode);
    }, 
    [note, setRawMode]
  );

  const [isNoteDelModalOpen, setIsNoteDelModalOpen] = useState(false);
  const onDelClick = useCallback(() => setIsNoteDelModalOpen(true), []);

  const buttonClassName =
    'rounded hover:bg-gray-300 active:bg-gray-400 dark:hover:bg-gray-700 dark:active:bg-gray-600';
  const iconClass = 'text-gray-600 dark:text-gray-300';
  const switchClass = `px-1 ${buttonClassName}`; 

  return (
    <div className={`flex items-center justify-between w-full px-2 py-1 mb-2 text-right`}>
      <div className="flex items-center">
        <Tooltip content="Split View(beta)">
          <button className={switchClass} onClick={() => setRaw('split')}>
            <IconLayout className={`${rawMode === 'split' ? 'text-green-500' :iconClass}`} />
          </button>
        </Tooltip>
        <Tooltip content="WYSIWYG">
          <button className={switchClass} onClick={() => setRaw('wysiwyg')}>
            <IconFileText className={`${rawMode === 'wysiwyg' ? 'text-green-500' :iconClass}`} />
          </button>
        </Tooltip>
        <Tooltip content="Markdown">
          <button className={switchClass} onClick={() => setRaw('raw')}>
            <IconMarkdown className={`${rawMode === 'raw' ? 'text-green-500' : iconClass}`} />
          </button>
        </Tooltip>
        <Tooltip content="Mindmap">
          <button className={switchClass} onClick={() => setRaw('mindmap')}>
            <IconTournament className={`rotate-180 ${rawMode === 'mindmap' ? 'text-green-500' : iconClass}`} />
          </button>
        </Tooltip>
      </div>
      <div>
        <Menu>
          {({ open }) => (
            <>
              <Menu.Button ref={menuButtonRef} className={buttonClassName}>
                <Tooltip content="Options (Delete...)">
                  <span className="flex items-center justify-center w-8 h-8">
                    <IconDots size={18} className={iconClass} />
                  </span>
                </Tooltip>
              </Menu.Button>
              {open && (
                <Portal>
                  <Menu.Items
                    ref={setPopperElement}
                    className="z-10 w-56 overflow-hidden bg-white rounded shadow-popover dark:bg-gray-800 focus:outline-none"
                    static
                    style={styles.popper}
                    {...attributes.popper}
                  >
                    <DropdownItem
                      onClick={onDelClick}
                      className="border-t dark:border-gray-700"
                    >
                      <IconTrash className="mr-1" />
                      <span>Delete Permanently</span>
                    </DropdownItem>
                    <NoteMetadata noteId={note.id} />
                  </Menu.Items>
                </Portal>
              )}
            </>
          )}
        </Menu>
        <Tooltip content="Print(alpha)" className="hidden">
          <button className={`hidden ${switchClass}`} onClick={onPrint}>
            <IconPrinter size={15} className="ml-1" />
          </button>
        </Tooltip>
      </div>
      {isNoteDelModalOpen ? (
        <Portal>
          <NoteDelModal
            noteId={currentNote.id}
            noteTitle={note?.title}
            isOpen={isNoteDelModalOpen}
            handleClose={() => setIsNoteDelModalOpen(false)}
          />
        </Portal>
      ) : null}
    </div>
  );
}
