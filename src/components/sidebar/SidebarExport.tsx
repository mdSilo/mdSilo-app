import { useCallback } from 'react';
import { Menu } from '@headlessui/react';
import { IconFileDownload } from '@tabler/icons';
import { DropdownItem } from 'components/misc/Dropdown';
import Tooltip from 'components/misc/Tooltip';
import { exportNotesJson } from 'components/note/NoteExport';

type Props = {
  numOfNotes: number;
};

export default function SidebarExport(props: Props) {
  const { numOfNotes } = props;

  const onExportJson = useCallback(exportNotesJson, []);
  const barClass = `px-2 text-sm overflow-hidden overflow-ellipsis whitespace-nowrap`; 

  return (
    <div className="relative">
      <Menu>
        <Menu.Button className="px-2 text-gray-800 hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-700 focus:outline-none">
          <span className={barClass}>
            md: {numOfNotes}
          </span>
        </Menu.Button>
        <Menu.Items className="absolute z-20 w-auto overflow-hidden bg-white rounded top-full shadow-popover dark:bg-gray-800 focus:outline-none">
          <DropdownItem onClick={onExportJson}>
            <IconFileDownload size={18} className="mr-1" />
            <Tooltip content="Export JSON"><span>Export</span></Tooltip>
          </DropdownItem>
        </Menu.Items>
      </Menu>
    </div>
  );
}
