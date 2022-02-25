import { useCallback, useRef, useState } from 'react';
import { Menu } from '@headlessui/react';
import { IconDots, IconX, IconTrash, IconCornerDownRight } from '@tabler/icons';
import { usePopper } from 'react-popper';
import { useCurrentMdContext } from 'context/useCurrentMd';
import { store, useStore } from 'lib/store';
import Tooltip from 'components/misc/Tooltip';
import Portal from 'components/misc/Portal';
import Toggle from 'components/misc/Toggle';
import { DropdownItem } from 'components/misc/Dropdown';
import NoteMetadata from 'components/note/NoteMetadata';
import MoveToModal from 'components/note/NoteMoveModal';
import NoteDelModal from 'components/note/NoteDelModal';

type Props = {
  isWiki: boolean;
  isPub: boolean;
};

export default function NoteHeader(props: Props) {
  const { isWiki, isPub } = props;
  const currentNote = useCurrentMdContext();
  const viewState = currentNote.state;
  const dispatch = currentNote.dispatch;

  const isCloseButtonVisible = useStore(
    (state) => state.openNoteIds?.[0] !== currentNote.id
  );
  const note = useStore((state) => state.notes[currentNote.id]);

  const onClosePane = useCallback(() => {
    const currentNoteIndex = store
      .getState()
      .openNoteIds.findIndex((openNoteId) => openNoteId === currentNote.id);

    if (currentNoteIndex < 0) {
      return;
    }

    // Remove from stacked notes and shallowly route
    const stackedNoteIds = viewState.params?.stackIds || [];
    stackedNoteIds.splice(
      currentNoteIndex - 1, // Stacked notes don't include the main note
      1
    );

    dispatch({
      view: 'md', 
      params: {noteId: currentNote.id, stackIds: stackedNoteIds}
    });
  }, [currentNote.id, dispatch, viewState.params?.stackIds]);

  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(
    null
  );
  const { styles, attributes } = usePopper(
    menuButtonRef.current,
    popperElement,
    { placement: 'bottom-start' }
  );

  const readMode = useStore((state) => state.readMode);
  const setReadMode = useStore((state) => state.setReadMode);
  const wikiReadMode = useStore((state) => state.wikiReadMode);
  const setWikiReadMode = useStore((state) => state.setWikiReadMode);


  const [isMoveToModalOpen, setIsMoveToModalOpen] = useState(false);
  const onMoveToClick = useCallback(() => setIsMoveToModalOpen(true), []);

  const [isNoteDelModalOpen, setIsNoteDelModalOpen] = useState(false);
  const onDelClick = useCallback(() => setIsNoteDelModalOpen(true), []);

  const buttonClassName =
    'rounded hover:bg-gray-300 active:bg-gray-400 dark:hover:bg-gray-700 dark:active:bg-gray-600';
  const iconClassName = 'text-gray-600 dark:text-gray-300';

  return (
    <div className={`flex items-center justify-between w-full px-4 text-right ${isWiki ? 'border-b-2 border-blue-400 py-2 mb-2' : 'py-1'}`}>
      <div className="flex items-center">
        <span className="text-sm text-gray-300 dark:text-gray-500">Read/Write</span>
        <Toggle
          id={isWiki ? 'wikiReadMode' : 'readMode'}
          className="mx-2"
          isChecked={isWiki ? wikiReadMode : readMode}
          setIsChecked={isWiki ? setWikiReadMode : setReadMode}
        />
        <span className="text-sm text-gray-300 dark:text-gray-500">Read</span>
      </div>
      <div>
        {isCloseButtonVisible ? (
          <Tooltip content="Close pane">
            <button className={buttonClassName} onClick={onClosePane}>
              <span className="flex items-center justify-center w-8 h-8">
                <IconX className={iconClassName} />
              </span>
            </button>
          </Tooltip>
        ) : null}
        {!(isWiki || isPub) ? (
          <Menu>
            {({ open }) => (
              <>
                <Menu.Button ref={menuButtonRef} className={buttonClassName}>
                  <Tooltip content="Options (export, import, delete, etc.)">
                    <span className="flex items-center justify-center w-8 h-8">
                      <IconDots className={iconClassName} />
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
                        <IconTrash size={18} className="mr-1" />
                        <span>Delete Permanently</span>
                      </DropdownItem>
                      <DropdownItem onClick={onMoveToClick}>
                        <IconCornerDownRight size={18} className="mr-1" />
                        <span>Move to</span>
                      </DropdownItem>
                      <NoteMetadata note={note} />
                    </Menu.Items>
                  </Portal>
                )}
              </>
            )}
          </Menu>
        ) : null}
      </div>
      {isMoveToModalOpen ? (
        <Portal>
          <MoveToModal
            noteId={currentNote.id}
            setIsOpen={setIsMoveToModalOpen}
          />
        </Portal>
      ) : isNoteDelModalOpen ? (
        <Portal>
          <NoteDelModal
            noteId={currentNote.id}
            noteTitle={note?.title}
            setIsOpen={setIsNoteDelModalOpen}
          />
        </Portal>
      ) : null}
    </div>
  );
}
