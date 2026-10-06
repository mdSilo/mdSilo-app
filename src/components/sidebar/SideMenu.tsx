import { useMemo, useCallback, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { 
  TbMenu2 as IconMenu2, TbDna as IconDna, TbCalendar as IconCalendar, TbFile as IconFile, TbFeather as IconFeather,
  TbFolderPlus as IconFolderPlus, TbFileText as IconFileText, TbDeviceFloppy as IconDeviceFloppy, TbClearAll as IconClearAll,
  TbFileImport as IconFileImport, TbRss as IconRss, TbSettings as IconSettings, TbLayoutKanban as IconLayoutKanban,
  TbCircleDot as IconCircleDot, TbBrowser as IconBrowser,
  TbPizza as IconPizza, TbInfoCircle as IconInfoCircle, TbCurrentLocation as IconCurrentLocation,
  TbDatabaseExport as IconDatabaseExport,
} from 'react-icons/tb';
import { Menu } from '@headlessui/react';
import { usePopper } from 'react-popper';
import { useCurrentViewContext } from 'context/useCurrentView';
import useHotkeys from 'editor/hooks/useHotkeys';
import { onOpenFile, onListDir, onSave, openJsonFile } from 'editor/hooks/useOpen';
import { isWeb } from 'file/util';
import { store, useStore } from 'lib/store';
import { isMobile } from 'utils/helper';
import { ViewAction } from 'context/viewReducer';
import Dropdown, { DropdownItem } from 'components/misc/Dropdown';
import Tooltip from 'components/misc/Tooltip';
import Portal from 'components/misc/Portal';
import Logo from '../Logo';
import SidebarItem from './SidebarItem';

export default function SideMenu() {
  const currentView = useCurrentViewContext();
  const viewTy = currentView.state.view;
  const dispatch = currentView.dispatch;

  const dispatchView = useCallback(
    (view: ViewAction) => dispatch(view), [dispatch]
  );

  const hotkeys = useMemo(
    () => [
      {
        hotkey: 'mod+shift+r',
        callback: () => dispatchView({view: 'feed'}),
      },
      {
        hotkey: 'mod+shift+g',
        callback: () => dispatchView({view: 'graph'}),
      },
      {
        hotkey: 'mod+shift+c',
        callback: () => dispatchView({view: 'chronicle'}),
      },
      {
        hotkey: 'mod+shift+t',
        // the Task view became the Tasks tab of Issues
        callback: () => dispatchView({view: 'issues', tab: 'tasks'}),
      },
      // Projects replaced the Kanban board and keep its hotkey
      {
        hotkey: 'mod+shift+k',
        callback: () => dispatchView({view: 'project'}),
      },
      {
        hotkey: 'mod+shift+i',
        callback: () => dispatchView({view: 'issues'}),
      },
    ],
    [dispatchView]
  );
  useHotkeys(hotkeys);

  const currentDir = useStore((state) => state.currentDir);
  return (    
    <div className='flex flex-col h-full pb-3 bg-gray-100 dark:bg-gray-800'>
      <div className="flex flex-col h-full" id="side-menu-btns">
        <LogoMenu />
        <OpenButton />
        <FeedButton viewTy={viewTy} onDispatch={() => dispatchView({view: 'feed'})} />
        {currentDir ? (
        <>
          <NewButton />
          <IssuesButton viewTy={viewTy} onDispatch={() => dispatchView({view: 'issues'})} />
          <ProjectButton viewTy={viewTy} onDispatch={() => dispatchView({view: 'project'})} />
          <ChronButton viewTy={viewTy} onDispatch={() => dispatchView({view: 'chronicle'})} />
          <GraphButton viewTy={viewTy} onDispatch={() => dispatchView({view: 'graph'})} />
        </>) : null}
        <FileButton />
      </div>
      <BottomSection />
    </div>
  );
}

const LogoMenu = () => {
  const setIsSidebarOpen = useStore((state) => state.setIsSidebarOpen);
  const setIsSettingsOpen = useStore((state) => state.setIsSettingsOpen);
  const setIsAboutOpen = useStore((state) => state.setIsAboutOpen);

  return (
    <Dropdown
      buttonChildren={<Logo />}
      buttonClassName="block w-full focus:outline-none"
      itemsClassName="w-56"
      placement="right-start"
      tooltipContent="mdSilo"
      tooltipPlacement="right"
    >
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
        className="border-t dark:border-gray-700"
        as="link"
        href="https://mdsilo.com"
      >
        <IconBrowser size={18} className="mr-1" />
        <span>Website</span>
      </DropdownItem>
      <DropdownItem
        className="border-t dark:border-gray-700"
        as="link"
        href="https://mdsilo.com/helpus"
      >
        <IconPizza size={18} className="mr-1" />
        <span>Help Us</span>
      </DropdownItem>
      <DropdownItem onClick={() => setIsAboutOpen(true)}>
        <IconInfoCircle size={18} className="mr-1" />
        <span>About</span>
      </DropdownItem>
      {isWeb ? (
        <DropdownItem
          onClick={async () => {
            try {
              await invoke('export_backup');
            } catch (e) {
              console.error('Failed to export backup:', e);
            }
          }}
        >
          <IconDatabaseExport size={18} className="mr-1" />
          <span>Export Backup</span>
        </DropdownItem>
      ) : (
        <DropdownItem
          onClick={async () => {
            const dir_path = await invoke<string>('create_mdsilo_dir');
            await invoke('open_url', { url: dir_path });
          }}
        >
          <IconCurrentLocation size={18} className="mr-1" />
          <span>Local mdsilo</span>
        </DropdownItem>
      )}
    </Dropdown>
  );
};

const btnClass = 'title flex items-center text-lg p-2';
const btnIconClass = 'flex-shrink-0 mx-1 text-gray-600 dark:text-gray-400';

const OpenButton = () => {
  const setIsSidebarOpen = useStore((state) => state.setIsSidebarOpen);
  const isSidebarOpen: boolean = useStore((state) => state.isSidebarOpen);

  return (
    <SidebarItem isHighlighted={isSidebarOpen}>
      <Tooltip content="Toggle Sidebar (Alt+X)" placement="right">
        <button
          aria-label="Toggle Sidebar"
          className={btnClass}
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        >
          <IconMenu2 size={24} className={btnIconClass} />
        </button>
      </Tooltip>
    </SidebarItem>
  );
}

const NewButton = () => {
  const setIsSidebarOpen = useStore((state) => state.setIsSidebarOpen);
  const setIsFindOrCreateModalOpen = useStore((state) => state.setIsFindOrCreateModalOpen);
  const isFindOrCreateModalOpen = useStore((state) => state.isFindOrCreateModalOpen);

  const onCreateNoteClick = useCallback(() => {
    if (isMobile()) {
      setIsSidebarOpen(false);
    }
    setIsFindOrCreateModalOpen((isOpen) => !isOpen);
  }, [setIsSidebarOpen, setIsFindOrCreateModalOpen]);

  return (
    <SidebarItem isHighlighted={isFindOrCreateModalOpen}>
      <Tooltip content="New Writing" placement="right">
        <button
          className={btnClass}
          onClick={onCreateNoteClick}
        >
          <IconFeather size={25} className="flex-shrink-0 mx-1 text-primary-600" />
        </button>
      </Tooltip>
    </SidebarItem>
  );
}

type ButtonProps = {
  viewTy: string;
  onClick?: () => void;
  onDispatch: () => void;
};

const FeedButton = (props: ButtonProps) => {
  const { viewTy, onClick, onDispatch } = props;

  const setIsSidebarOpen = useStore((state) => state.setIsSidebarOpen);

  const onViewFeed = useCallback(() => {
    setIsSidebarOpen(false);
    onDispatch();
  }, [setIsSidebarOpen, onDispatch]);

  return (
    <SidebarItem isHighlighted={viewTy === 'feed'} onClick={onClick}>
      <Tooltip
        content="Feed Reader (Ctrl/⌘+Shift+R)"
        placement="right"
      >
        <button className={btnClass} onClick={onViewFeed}>
          <IconRss size={24} className="flex-shrink-0 mx-1 text-orange-600" />
        </button>
      </Tooltip>
    </SidebarItem>
  );
}

const GraphButton = (props: ButtonProps) => {
  const { viewTy, onClick, onDispatch } = props;

  return (
    <SidebarItem isHighlighted={viewTy === 'graph'} onClick={onClick}>
      <Tooltip
        content="Graph View (Ctrl/⌘+Shift+G)"
        placement="right"
      >
        <button className={btnClass} onClick={onDispatch}>
          <IconDna size={24} className={btnIconClass} />
        </button>
      </Tooltip>
    </SidebarItem>
  );
};

const ChronButton = (props: ButtonProps) => {
  const { viewTy, onClick, onDispatch } = props;

  return (
    <SidebarItem isHighlighted={viewTy === 'chronicle'} onClick={onClick}>
      <Tooltip
        content="Chronicle View (Ctrl/⌘+Shift+C)"
        placement="right"
      >
        <button className={btnClass} onClick={onDispatch}>
          <IconCalendar size={24} className={btnIconClass} />
        </button>
      </Tooltip>
    </SidebarItem>
  );
};

const IssuesButton = (props: ButtonProps) => {
  const { viewTy, onClick, onDispatch } = props;

  return (
    <SidebarItem isHighlighted={viewTy === 'issues' || viewTy === 'issue'} onClick={onClick}>
      <Tooltip
        content="Issues (Ctrl/⌘+Shift+I), Tasks (Ctrl/⌘+Shift+T)"
        placement="right"
      >
        <button aria-label="Issues" className={btnClass} onClick={onDispatch}>
          <IconCircleDot size={24} className={btnIconClass} />
        </button>
      </Tooltip>
    </SidebarItem>
  );
};

const ProjectButton = (props: ButtonProps) => {
  const { viewTy, onClick, onDispatch } = props;

  return (
    <SidebarItem isHighlighted={viewTy === 'project'} onClick={onClick}>
      <Tooltip
        content="Projects (Ctrl/⌘+Shift+K)"
        placement="right"
      >
        <button aria-label="Projects" className={btnClass} onClick={onDispatch}>
          <IconLayoutKanban size={24} className={btnIconClass} />
        </button>
      </Tooltip>
    </SidebarItem>
  );
};

export function FileDrop() {
  const onClear = useCallback(() => {
    // to see recent history
    store.getState().setShowHistory(true);
    store.getState().setCurrentDir(undefined);
    // store.getState().setInitDir(undefined);
  }, []);

  return (
    <>
      <DropdownItem onClick={onListDir}>
        <IconFolderPlus size={18} className="mr-1" />
        <Tooltip content="Open Folder"><span>Open Folder</span></Tooltip>
      </DropdownItem>
      <DropdownItem onClick={onOpenFile}>
        <IconFileText size={18} className="mr-1" />
        <Tooltip content="Open .md"><span>Open File</span></Tooltip>
      </DropdownItem>
      <DropdownItem onClick={openJsonFile}>
        <IconFileImport size={18} className="mr-1" />
        <Tooltip content="Open JSON"><span>Import JSON</span></Tooltip>
      </DropdownItem>
      <DropdownItem 
        onClick={onClear} 
        className="border-t-2 border-gray-200 dark:border-gray-600"
      >
        <IconClearAll size={18} className="mr-1" />
        <Tooltip content="Open Recent History"><span>Recent</span></Tooltip>
      </DropdownItem>
      <DropdownItem 
        onClick={onSave} 
        className="border-t-2 border-gray-200 dark:border-gray-600"
      >
        <IconDeviceFloppy size={18} className="mr-1" />
        <Tooltip content="Save All Data"><span>Save</span></Tooltip>
      </DropdownItem>
    </>
  );
}

const FileButton = () => {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = 
    useState<HTMLDivElement | null>(null);
  const { styles, attributes } = usePopper(
    btnRef.current, popperElement, { placement: 'right-start' }
  );

  return (
    <Menu>
      {({ open }) => (
        <>
          <Menu.Button ref={btnRef} className="hover:bg-gray-200 dark:hover:bg-gray-700">
            <Tooltip content="File Menu" placement="right">
              <span className={btnClass}>
                <IconFile size={24} className={btnIconClass} />
              </span>
            </Tooltip>
          </Menu.Button>
          {open && (
            <Portal>
              <Menu.Items
                ref={setPopperElement}
                className="z-20 w-42 overflow-hidden bg-white rounded shadow-popover dark:bg-gray-800 focus:outline-none"
                static
                style={styles.popper}
                {...attributes.popper}
              >
                <FileDrop />
              </Menu.Items>
            </Portal>
          )}
        </>
      )}
    </Menu>
  );
};


const BottomSection = () => {
  return (
    <div>
      <SettingsButton />
    </div>
  )
}

const SettingsButton = () => {
  const setIsSettingsOpen = useStore((state) => state.setIsSettingsOpen);
  
  return (
    <Tooltip content="Preferences" placement='right'>
      <button className={btnClass} onClick={() => setIsSettingsOpen(true)}>
        <IconSettings size={24} className={btnIconClass} />
        </button>
    </Tooltip>
  )
}
