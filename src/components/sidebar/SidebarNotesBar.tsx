import { Dispatch, SetStateAction, useCallback, memo } from 'react';
import { IconFeather } from '@tabler/icons';
import { useStore } from 'lib/store';
import { Sort } from 'lib/userSettingsSlice';
import Tooltip from 'components/misc/Tooltip';
import { isMobile } from 'utils/helper';
import SidebarExport from './SidebarExport';
import SidebarNotesSortDropdown from './SidebarNotesSortDropdown';

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
      <Tooltip content="Export, Import...">
        <div className="flex mx-2 my-1">
          <SidebarExport numOfNotes={numOfNotes} />
        </div>
      </Tooltip>
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
