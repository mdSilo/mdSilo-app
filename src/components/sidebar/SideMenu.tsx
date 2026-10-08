import { createContext, useMemo, useCallback, useContext, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { 
  TbMenu2, TbDna, TbCalendar, TbFeather, TbFolderPlus, TbFileText, TbDeviceFloppy, TbClearAll,
  TbFileImport, TbRss, TbSettings, TbLayoutKanban, TbCircleDot, TbBrowser,
  TbPizza, TbInfoCircle, TbCurrentLocation, TbDatabaseExport,
} from 'react-icons/tb';
import { MdFolderOpen } from "react-icons/md";
import { Menu } from '@headlessui/react';
import { usePopper } from 'react-popper';
import { useCurrentViewContext } from 'context/useCurrentView';
import useHotkeys from 'editor/hooks/useHotkeys';
import { onOpenFile, onListDir, onSave, openJsonFile } from 'editor/hooks/useOpen';
import { isWeb } from 'file/util';
import { store, useStore } from 'lib/store';
import type { SideMenuOrientation } from 'lib/userSettings';
import { isMobile } from 'utils/helper';
import { ViewAction } from 'context/viewReducer';
import Dropdown, { DropdownItem } from 'components/misc/Dropdown';
import Tooltip from 'components/misc/Tooltip';
import Portal from 'components/misc/Portal';
import Logo from '../Logo';
import SidebarItem from './SidebarItem';

const SideMenuOrientationContext = createContext<SideMenuOrientation>('auto');

const useIsHorizontalMenu = () => {
  const orientation = useContext(SideMenuOrientationContext);
  return orientation === 'horizontal' || (orientation === 'auto' && isMobile(768));
};

const useTooltipPlacement = () => useIsHorizontalMenu() ? 'top' : 'right';

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
  const orientation = useStore((state) => state.sideMenuOrientation);
  const menuClassName = orientation === 'horizontal'
    ? 'flex flex-row items-center w-full px-1 bg-gray-100 dark:bg-gray-800'
    : orientation === 'vertical'
      ? 'flex flex-col h-full pb-3 bg-gray-100 dark:bg-gray-800'
      : 'flex flex-row items-center w-full px-1 bg-gray-100 dark:bg-gray-800 md:flex-col md:items-stretch md:w-auto md:h-full md:pb-3';
  const buttonsClassName = orientation === 'horizontal'
    ? 'flex flex-row items-center'
    : orientation === 'vertical'
      ? 'flex flex-col h-full'
      : 'flex flex-row items-center md:flex-col md:flex-1 md:items-stretch';
  const bottomClassName = orientation === 'horizontal'
    ? 'ml-auto'
    : orientation === 'vertical'
      ? ''
      : 'ml-auto md:ml-0';

  return (
    <SideMenuOrientationContext.Provider value={orientation}>
      <div className={menuClassName}>
        <div className={buttonsClassName} id="side-menu-btns">
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
        <div className={bottomClassName}>
          <BottomSection />
        </div>
      </div>
    </SideMenuOrientationContext.Provider>
  );
}

const LogoMenu = () => {
  const isHorizontal = useIsHorizontalMenu();
  const tooltipPlacement = useTooltipPlacement();
  const setIsSidebarOpen = useStore((state) => state.setIsSidebarOpen);
  const setIsSettingsOpen = useStore((state) => state.setIsSettingsOpen);
  const setIsAboutOpen = useStore((state) => state.setIsAboutOpen);

  return (
    <Dropdown
      buttonChildren={<Logo />}
      buttonClassName="block focus:outline-none"
      itemsClassName="w-56"
      placement={isHorizontal ? 'bottom-start' : 'right-start'}
      tooltipContent="mdSilo"
      tooltipPlacement={tooltipPlacement}
    >
      <DropdownItem
        onClick={() => {
          if (isMobile(768)) {
            setIsSidebarOpen(false);
          }
          setIsSettingsOpen(true);
        }}
      >
        <TbSettings size={18} className="mr-1" />
        <span>Settings</span>
      </DropdownItem>
      <DropdownItem
        className="border-t dark:border-gray-700"
        as="link"
        href="https://mdsilo.com"
      >
        <TbBrowser size={18} className="mr-1" />
        <span>Website</span>
      </DropdownItem>
      <DropdownItem
        className="border-t dark:border-gray-700"
        as="link"
        href="https://mdsilo.com/helpus"
      >
        <TbPizza size={18} className="mr-1" />
        <span>Help Us</span>
      </DropdownItem>
      <DropdownItem onClick={() => setIsAboutOpen(true)}>
        <TbInfoCircle size={18} className="mr-1" />
        <span>About</span>
      </DropdownItem>
      {!isWeb && (
        <DropdownItem
          onClick={async () => {
            const dir_path = await invoke<string>('create_mdsilo_dir');
            await invoke('open_url', { url: dir_path });
          }}
        >
          <TbCurrentLocation size={18} className="mr-1" />
          <span>Local mdsilo</span>
        </DropdownItem>
      )}
    </Dropdown>
  );
};

const btnClass = 'title flex items-center text-lg p-2';
const btnIconClass = 'flex-shrink-0 mx-1 text-gray-600 dark:text-gray-400';

const OpenButton = () => {
  const tooltipPlacement = useTooltipPlacement();
  const setIsSidebarOpen = useStore((state) => state.setIsSidebarOpen);
  const isSidebarOpen: boolean = useStore((state) => state.isSidebarOpen);

  return (
    <SidebarItem isHighlighted={isSidebarOpen}>
      <Tooltip content="Toggle Sidebar (Alt+X)" placement={tooltipPlacement}>
        <button
          aria-label="Toggle Sidebar"
          className={btnClass}
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        >
          <TbMenu2 size={24} className={btnIconClass} />
        </button>
      </Tooltip>
    </SidebarItem>
  );
}

const NewButton = () => {
  const tooltipPlacement = useTooltipPlacement();
  const setIsSidebarOpen = useStore((state) => state.setIsSidebarOpen);
  const setIsFindOrCreateModalOpen = useStore((state) => state.setIsFindOrCreateModalOpen);
  const isFindOrCreateModalOpen = useStore((state) => state.isFindOrCreateModalOpen);

  const onCreateNoteClick = useCallback(() => {
    if (isMobile(768)) {
      setIsSidebarOpen(false);
    }
    setIsFindOrCreateModalOpen((isOpen) => !isOpen);
  }, [setIsSidebarOpen, setIsFindOrCreateModalOpen]);

  return (
    <SidebarItem isHighlighted={isFindOrCreateModalOpen}>
      <Tooltip content="New Writing" placement={tooltipPlacement}>
        <button
          className={btnClass}
          onClick={onCreateNoteClick}
        >
          <TbFeather size={25} className="flex-shrink-0 mx-1 text-primary-600" />
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
  const tooltipPlacement = useTooltipPlacement();
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
        placement={tooltipPlacement}
      >
        <button className={btnClass} onClick={onViewFeed}>
          <TbRss size={24} className="flex-shrink-0 mx-1 text-orange-600" />
        </button>
      </Tooltip>
    </SidebarItem>
  );
}

const GraphButton = (props: ButtonProps) => {
  const tooltipPlacement = useTooltipPlacement();
  const { viewTy, onClick, onDispatch } = props;

  return (
    <SidebarItem isHighlighted={viewTy === 'graph'} onClick={onClick}>
      <Tooltip
        content="Graph View (Ctrl/⌘+Shift+G)"
        placement={tooltipPlacement}
      >
        <button className={btnClass} onClick={onDispatch}>
          <TbDna size={24} className={btnIconClass} />
        </button>
      </Tooltip>
    </SidebarItem>
  );
};

const ChronButton = (props: ButtonProps) => {
  const tooltipPlacement = useTooltipPlacement();
  const { viewTy, onClick, onDispatch } = props;

  return (
    <SidebarItem isHighlighted={viewTy === 'chronicle'} onClick={onClick}>
      <Tooltip
        content="Chronicle View (Ctrl/⌘+Shift+C)"
        placement={tooltipPlacement}
      >
        <button className={btnClass} onClick={onDispatch}>
          <TbCalendar size={24} className={btnIconClass} />
        </button>
      </Tooltip>
    </SidebarItem>
  );
};

const IssuesButton = (props: ButtonProps) => {
  const tooltipPlacement = useTooltipPlacement();
  const { viewTy, onClick, onDispatch } = props;

  return (
    <SidebarItem isHighlighted={viewTy === 'issues' || viewTy === 'issue'} onClick={onClick}>
      <Tooltip
        content="Issues (Ctrl/⌘+Shift+I), Tasks (Ctrl/⌘+Shift+T)"
        placement={tooltipPlacement}
      >
        <button aria-label="Issues" className={btnClass} onClick={onDispatch}>
          <TbCircleDot size={24} className={btnIconClass} />
        </button>
      </Tooltip>
    </SidebarItem>
  );
};

const ProjectButton = (props: ButtonProps) => {
  const tooltipPlacement = useTooltipPlacement();
  const { viewTy, onClick, onDispatch } = props;

  return (
    <SidebarItem isHighlighted={viewTy === 'project'} onClick={onClick}>
      <Tooltip
        content="Projects (Ctrl/⌘+Shift+K)"
        placement={tooltipPlacement}
      >
        <button aria-label="Projects" className={btnClass} onClick={onDispatch}>
          <TbLayoutKanban size={24} className={btnIconClass} />
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
        <TbFolderPlus size={18} className="mr-1" />
        <Tooltip content="Open Folder"><span>Open Folder</span></Tooltip>
      </DropdownItem>
      <DropdownItem onClick={onOpenFile}>
        <TbFileText size={18} className="mr-1" />
        <Tooltip content="Open .md"><span>Open File</span></Tooltip>
      </DropdownItem>
      <DropdownItem onClick={openJsonFile}>
        <TbFileImport size={18} className="mr-1" />
        <Tooltip content="Open JSON"><span>Import JSON</span></Tooltip>
      </DropdownItem>
      {isWeb && (
        <DropdownItem
          className="border-t-2 border-gray-200 dark:border-gray-600"
          onClick={async () => {
            try {
              await invoke('export_backup');
            } catch (e) {
              console.error('Failed to export backup:', e);
            }
          }}
        >
          <TbDatabaseExport size={18} className="mr-1" />
          <Tooltip content="Export Backup"><span>Backup</span></Tooltip>
        </DropdownItem>
      )}
      <DropdownItem 
        onClick={onClear} 
        className="border-t-2 border-gray-200 dark:border-gray-600"
      >
        <TbClearAll size={18} className="mr-1" />
        <Tooltip content="Open Recent History"><span>Recent</span></Tooltip>
      </DropdownItem>
      <DropdownItem 
        onClick={onSave} 
        className="border-t-2 border-gray-200 dark:border-gray-600"
      >
        <TbDeviceFloppy size={18} className="mr-1" />
        <Tooltip content="Save All Data"><span>Save</span></Tooltip>
      </DropdownItem>
    </>
  );
}

const FileButton = () => {
  const isHorizontal = useIsHorizontalMenu();
  const tooltipPlacement = useTooltipPlacement();
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = 
    useState<HTMLDivElement | null>(null);
  const { styles, attributes } = usePopper(
    btnRef.current, popperElement, {
      placement: isHorizontal ? 'bottom-start' : 'right-start',
    }
  );

  return (
    <Menu>
      {({ open }) => (
        <>
          <Menu.Button ref={btnRef} className="hover:bg-gray-200 dark:hover:bg-gray-700">
            <Tooltip content="File Menu" placement={tooltipPlacement}>
              <span className={btnClass}>
                <MdFolderOpen size={24} className={btnIconClass} />
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
  const tooltipPlacement = useTooltipPlacement();
  const setIsSettingsOpen = useStore((state) => state.setIsSettingsOpen);
  
  return (
    <Tooltip content="Preferences" placement={tooltipPlacement}>
      <button className={btnClass} onClick={() => setIsSettingsOpen(true)}>
        <TbSettings size={24} className={btnIconClass} />
        </button>
    </Tooltip>
  )
}
