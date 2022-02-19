import type { Dispatch, SetStateAction } from 'react';
import { Menu } from '@headlessui/react';
import { IconChevronsDown, IconX, IconSettings, IconPizza } from '@tabler/icons';
import { useStore } from 'lib/store';
import Tooltip from 'components/misc/Tooltip';
import { DropdownItem } from 'components/misc/Dropdown';
import { isMobile } from 'utils/helper';

type Props = {
  setIsSettingsOpen: Dispatch<SetStateAction<boolean>>;
};

export default function SidebarHeader(props: Props) {
  const { setIsSettingsOpen } = props;
  const setIsSidebarOpen = useStore((state) => state.setIsSidebarOpen);

  return (
    <div className="relative">
      <Menu>
        <Menu.Button className="flex items-center justify-between w-full py-2 pl-6 overflow-x-hidden text-left text-gray-800 hover:bg-gray-200 active:bg-gray-300 dark:text-gray-200 dark:hover:bg-gray-700 dark:active:bg-gray-600 overflow-ellipsis whitespace-nowrap focus:outline-none">
          <div className="flex items-center flex-1">
            <span className="mr-1 px-1 font-semibold select-none">mdSilo</span>
            <IconChevronsDown size={18} className="text-gray-500 dark:text-gray-400" />
          </div>
          <Tooltip content="Collapse sidebar (Alt+X)" placement="right">
            <span
              className="p-1 mr-2 rounded hover:bg-gray-300 active:bg-gray-400 dark:hover:bg-gray-600 dark:active:bg-gray-500"
              onClick={(e) => {
                e.stopPropagation();
                setIsSidebarOpen(false);
              }}
            >
              <IconX className="text-gray-500 dark:text-gray-400" />
            </span>
          </Tooltip>
        </Menu.Button>
        <Menu.Items className="absolute z-20 w-56 overflow-hidden bg-white rounded left-6 top-full shadow-popover dark:bg-gray-800 focus:outline-none">
          <DropdownItem
            onClick={() => {
              if (isMobile()) {
                setIsSidebarOpen(false);
              }
              setIsSettingsOpen(true);
            }}
          >
            <IconSettings size={18} className="mr-1" />
            <span>Settings</span>
          </DropdownItem>
          <DropdownItem
            className="border-t dark:border-gray-700 hover:bg-green-400"
            as='link'
            href='/sponsors'
          >
            <IconPizza size={18} className="mr-1" />
            <span>Sponsor</span>
          </DropdownItem>
        </Menu.Items>
      </Menu>
    </div>
  );
}
