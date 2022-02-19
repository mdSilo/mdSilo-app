import { useMemo, useState } from 'react';
import { IconBrightnessHalf, IconPencil } from '@tabler/icons';
import useHotkeys from 'editor/hooks/useHotkeys';
import SidebarItem from '../sidebar/SidebarItem';
import General from './General';
import EditorSettings from './EditorSettings';

enum SettingsTab {
  General = 'general',
  Editor = 'editor',
}

type Props = {
  setIsOpen: (isOpen: boolean) => void;
};

export default function SettingsModal(props: Props) {
  const { setIsOpen } = props;
  const [currentTab, setCurrentTab] = useState<SettingsTab>(
    SettingsTab.General
  );

  const hotkeys = useMemo(
    () => [
      {
        hotkey: 'esc',
        callback: () => setIsOpen(false),
      },
    ],
    [setIsOpen]
  );
  useHotkeys(hotkeys);

  return (
    <div className="fixed inset-0 z-20 overflow-y-auto">
      <div
        className="fixed inset-0 bg-gray-500 opacity-70"
        onClick={() => setIsOpen(false)}
      />
      <div className="flex items-center justify-center h-screen px-6">
        <div className="z-30 flex flex-col w-full h-full max-w-full overflow-hidden bg-white rounded sm:flex-row sm:max-h-176 sm:w-240 shadow-popover">
          <SettingsModalSidebar
            currentTab={currentTab}
            setCurrentTab={setCurrentTab}
          />
          {currentTab === SettingsTab.General ? <General /> : null}
          {currentTab === SettingsTab.Editor ? <EditorSettings /> : null}
        </div>
      </div>
    </div>
  );
}

type SettingsModalSidebarProps = {
  currentTab: SettingsTab;
  setCurrentTab: (tab: SettingsTab) => void;
};

const SettingsModalSidebar = (props: SettingsModalSidebarProps) => {
  const { currentTab, setCurrentTab } = props;
  return (
    <div className="flex flex-col flex-none w-full py-4 border-b sm:border-b-0 sm:border-r sm:w-48 sm:h-full bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
      <div className="px-4 pb-2 text-sm text-gray-600 dark:text-gray-400">
        Settings
      </div>
      <SidebarItem
        className="flex"
        isHighlighted={currentTab === SettingsTab.General}
      >
        <button
          className="flex items-center flex-1 px-4 py-1 overflow-hidden overflow-ellipsis whitespace-nowrap"
          onClick={() => setCurrentTab(SettingsTab.General)}
        >
          <IconBrightnessHalf
            size={18}
            className="mr-1 text-gray-800 dark:text-gray-200"
          />
          <span>General</span>
        </button>
      </SidebarItem>
      <SidebarItem
        className="flex"
        isHighlighted={currentTab === SettingsTab.Editor}
      >
        <button
          className="flex items-center flex-1 px-4 py-1 overflow-hidden overflow-ellipsis whitespace-nowrap"
          onClick={() => setCurrentTab(SettingsTab.Editor)}
        >
          <IconPencil
            size={18}
            className="mr-1 text-gray-800 dark:text-gray-200"
          />
          <span>Editor</span>
        </button>
      </SidebarItem>
    </div>
  );
};
