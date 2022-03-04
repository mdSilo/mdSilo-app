import { Dispatch, SetStateAction, useCallback, memo } from 'react';
import { Menu } from '@headlessui/react';
import { IconFeather } from '@tabler/icons';
import { useStore } from 'lib/store';
import { Sort } from 'lib/userSettingsSlice';
import Tooltip from 'components/misc/Tooltip';
import { isMobile } from 'utils/helper';
import { normalizeSlash } from 'file/util';
import SidebarNotesSortDropdown from './SidebarNotesSortDropdown';
import { FileDrop } from './SideMenu';

type Props = {
  noteSort: Sort;
  numOfNotes: number;
  setIsFindOrCreateModalOpen: Dispatch<SetStateAction<boolean>>;
};

function SidebarNotesBar(props: Props) {
  const { noteSort, numOfNotes, setIsFindOrCreateModalOpen} = props;

  const setNoteSort = useStore((state) => state.setNoteSort);
  const setIsSidebarOpen = useStore((state) => state.setIsSidebarOpen);
  const onCreateNoteClick = useCallback(() => {
    if (isMobile()) {
      setIsSidebarOpen(false);
    }
    setIsFindOrCreateModalOpen((isOpen) => !isOpen);
  }, [setIsSidebarOpen, setIsFindOrCreateModalOpen]);

  return (
    <div className="flex items-center justify-between border-t dark:border-gray-700">
      <div className="flex mx-2 my-1">
        <SidebarNotesSortDropdown
          currentSort={noteSort}
          setCurrentSort={setNoteSort}
        />
      </div>
      <NoteBarDrop numOfNotes={numOfNotes} />
      <Tooltip content="New (Alt+N)">
        <button
          className="p-1 mx-2 my-1 rounded hover:bg-gray-200 active:bg-gray-300 dark:hover:bg-gray-700 dark:active:bg-gray-600"
          onClick={onCreateNoteClick}
        >
          <IconFeather size={16} className="text-gray-600 dark:text-gray-300" />
        </button>
      </Tooltip>
    </div>
  );
}

export default memo(SidebarNotesBar);

type DropProps = {
  numOfNotes: number;
};

function NoteBarDrop(props: DropProps) {
  const { numOfNotes } = props;
  
  const currentDir = useStore((state) => state.currentDir);
  const currentFolder = currentDir 
    ? normalizeSlash(currentDir).split('/').pop() || '/'
    : 'md';
  const barClass = `px-2 text-sm bg-blue-500 text-gray-200 rounded overflow-hidden overflow-ellipsis whitespace-nowrap`; 

  return (
    <Tooltip content={currentDir ? currentDir : 'md'}>
      <div className="flex mx-2 my-1">
        <div className="relative">
          <Menu>
            <Menu.Button className="px-2 text-gray-800 hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-700 focus:outline-none">
              <span className={barClass}>
                {currentFolder}: {numOfNotes}
              </span>
            </Menu.Button>
            <Menu.Items className="absolute z-20 w-auto overflow-hidden bg-white rounded top-full shadow-popover dark:bg-gray-800 focus:outline-none">
              <FileDrop />
            </Menu.Items>
          </Menu>
        </div>
      </div>
    </Tooltip>
  );
}
