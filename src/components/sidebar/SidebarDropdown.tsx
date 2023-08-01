import { memo, useCallback, useRef, useState } from 'react';
import { Menu } from '@headlessui/react';
import { 
  IconCornerDownRight, IconDots, IconDotsDiagonal, IconId, IconPlus, IconTrash 
} from '@tabler/icons-react';
import { usePopper } from 'react-popper';
import { DropdownItem } from 'components/misc/Dropdown';
import Portal from 'components/misc/Portal';
import MoveToModal from 'components/note/NoteMoveModal';
import NoteMetadata from 'components/note/NoteMetadata';
import DirNewModal from 'components/dir/DirNewModal';
import DirRenameModal from 'components/dir/DirRenameModal';
import DirDelModal from 'components/dir/DirDelModal';

type NoteProps = {
  noteId: string;
  className?: string;
};

const SidebarNoteLinkDropdown = (props: NoteProps) => {
  const { noteId, className } = props;

  const containerRef = useRef<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(
    null
  );
  const { styles, attributes } = usePopper(
    containerRef.current,
    popperElement,
    { placement: 'right-start' }
  );

  const [isMoveToModalOpen, setIsMoveToModalOpen] = useState(false);
  const onMoveToClick = useCallback(() => setIsMoveToModalOpen(true), []);

  return (
    <>
      <Menu>
        {({ open }) => (
          <>
            <Menu.Button
              ref={containerRef}
              className={`rounded hover:bg-gray-300 active:bg-gray-400 dark:hover:bg-gray-600 dark:active:bg-gray-500 ${className}`}
            >
              <span className="flex items-center justify-center w-8 h-8">
                <IconDots className="text-gray-600 dark:text-gray-200" />
              </span>
            </Menu.Button>
            {open && (
              <Portal>
                <Menu.Items
                  ref={setPopperElement}
                  className="z-20 w-56 overflow-hidden bg-white rounded shadow-popover dark:bg-gray-800 focus:outline-none"
                  static
                  style={styles.popper}
                  {...attributes.popper}
                >
                  <DropdownItem onClick={onMoveToClick}>
                    <IconCornerDownRight size={18} className="mr-1" />
                    <span>Move to</span>
                  </DropdownItem>
                  <NoteMetadata noteId={noteId} />
                </Menu.Items>
              </Portal>
            )}
          </>
        )}
      </Menu>
      {isMoveToModalOpen ? (
        <Portal>
          <MoveToModal noteId={noteId} setIsOpen={setIsMoveToModalOpen} />
        </Portal>
      ) : null}
    </>
  );
};

export const SidebarNoteDropdown = memo(SidebarNoteLinkDropdown);


type DirProps = {
  dirPath: string;
  className?: string;
  isOnBar?: boolean;
  menuBtn?: string;
};

const SidebarDirLinkDropdown = (props: DirProps) => {
  const { dirPath, className = '', isOnBar = false, menuBtn } = props;

  const containerRef = useRef<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(
    null
  );
  const { styles, attributes } = usePopper(
    containerRef.current,
    popperElement,
    { placement: 'right-start' }
  );

  const [isNewDirModalOpen, setIsNewDirModalOpen] = useState(false);
  const [isRenameDirModalOpen, setIsRenameDirModalOpen] = useState(false);
  const [isDelDirModalOpen, setIsDelDirModalOpen] = useState(false);

  const onNewDirClick = useCallback(() => {
    setIsNewDirModalOpen(true);
    setIsDelDirModalOpen(false);
    setIsRenameDirModalOpen(false);
  }, []);

  
  const onRenameDirClick = useCallback(() => {
    setIsDelDirModalOpen(false);
    setIsRenameDirModalOpen(true);
    setIsNewDirModalOpen(false);
  }, []);

  
  const onDelDirClick = useCallback(() => {
    setIsDelDirModalOpen(true);
    setIsRenameDirModalOpen(false);
    setIsNewDirModalOpen(false);
  }, []);

  return (
    <>
      <Menu>
        {({ open }) => (
          <>
            <Menu.Button
              ref={containerRef}
              className={`rounded hover:bg-gray-300 dark:hover:bg-gray-600 ${className}`}
            >
              {menuBtn ? (
                <span className="px-2 text-sm bg-blue-500 text-white rounded overflow-hidden">
                  {menuBtn}
                </span>
              ) : (
                <span className="flex items-center justify-center w-8 h-8">
                  <IconDotsDiagonal className="text-gray-600 dark:text-gray-200" />
                </span>
              )}
            </Menu.Button>
            {open && (
              <Portal>
                <Menu.Items
                  ref={setPopperElement}
                  className="z-20 w-56 overflow-hidden bg-white rounded shadow-popover dark:bg-gray-800 focus:outline-none"
                  static
                  style={styles.popper}
                  {...attributes.popper}
                >
                  <DropdownItem onClick={onNewDirClick}>
                    <IconPlus size={18} className="mr-1" />
                    <span>New Subfolder</span>
                  </DropdownItem>
                  {isOnBar ? null : (
                    <>
                      <DropdownItem onClick={onRenameDirClick}>
                        <IconId size={18} className="mr-1" />
                        <span>Rename</span>
                      </DropdownItem>
                      <DropdownItem onClick={onDelDirClick}>
                        <IconTrash size={18} className="mr-1" />
                        <span>Delete</span>
                      </DropdownItem>
                    </>
                  )}
                </Menu.Items>
              </Portal>
            )}
          </>
        )}
      </Menu>
      {isNewDirModalOpen ? (
        <Portal>
          <DirNewModal 
            dirPath={dirPath}
            isOpen={isNewDirModalOpen}
            handleClose={() => setIsNewDirModalOpen(false)} 
          />
        </Portal>
      ) : null}
      {isRenameDirModalOpen ? (
        <Portal>
          <DirRenameModal 
            dirPath={dirPath}
            isOpen={isRenameDirModalOpen}
            handleClose={() => setIsRenameDirModalOpen(false)} 
          />
        </Portal>
      ) : null}
      {isDelDirModalOpen ? (
        <Portal>
          <DirDelModal 
            dirPath={dirPath}
            isOpen={isDelDirModalOpen}
            handleClose={() => setIsDelDirModalOpen(false)} 
          />
        </Portal>
      ) : null}
    </>
  );
};

export const SidebarDirDropdown = memo(SidebarDirLinkDropdown);
