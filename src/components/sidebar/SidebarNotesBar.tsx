import { memo } from 'react';
import { Menu } from '@headlessui/react';
import { IconArrowBarToUp } from '@tabler/icons';
import { useStore } from 'lib/store';
import { Sort } from 'lib/userSettingsSlice';
import Tooltip from 'components/misc/Tooltip';
import { normalizeSlash, getParentDir } from 'file/util';
import { listDirPath } from 'editor/hooks/useOpen';
import SidebarNotesSortDropdown from './SidebarNotesSortDropdown';
import { FileDrop } from './SideMenu';

type Props = {
  noteSort: Sort;
  numOfNotes: number;
};

function SidebarNotesBar(props: Props) {
  const { noteSort, numOfNotes} = props;
  const setNoteSort = useStore((state) => state.setNoteSort);

  const currentDir = useStore((state) => state.currentDir);
  
  return (
    <div className="flex items-center justify-between border-t dark:border-gray-700">
      <div className="flex mx-2 my-1">
        <SidebarNotesSortDropdown
          currentSort={noteSort}
          setCurrentSort={setNoteSort}
        />
      </div>
      <NoteBarDrop numOfNotes={numOfNotes} />
      <Tooltip content="Go Upper Folder">
        <button
          className="p-1 mx-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          onClick={async (e) => {
            e.preventDefault();
            if (!currentDir) return;
            const parentDir = await getParentDir(currentDir);
            await listDirPath(parentDir);
          }}
        >
          <IconArrowBarToUp size={16} className="text-gray-600 dark:text-gray-300" />
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
  const barClass = `px-2 text-sm bg-blue-500 text-white rounded overflow-hidden`; 

  return (
    <Tooltip content={currentDir ? currentDir : 'md'}>
      <div className="flex mx-2 my-1">
        <div className="relative">
          <Menu>
            <Menu.Button className="px-2 hover:bg-blue-500">
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
