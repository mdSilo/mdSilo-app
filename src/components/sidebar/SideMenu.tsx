import { useMemo, useCallback, useRef, useState } from 'react';
import { 
  IconMenu2, IconDna, IconCalendar, IconFile, IconFeather, IconCheckbox,
  IconFolderPlus, IconFileText, IconDeviceFloppy, IconClearAll, 
  IconFileImport, IconRss, IconBox, IconMessageChatbot, 
} from '@tabler/icons';
import { Menu } from '@headlessui/react';
import { usePopper } from 'react-popper';
import { useCurrentViewContext } from 'context/useCurrentView';
import useHotkeys from 'editor/hooks/useHotkeys';
import { onOpenFile, onListDir, onSave, openJsonFile } from 'editor/hooks/useOpen';
import { store, useStore } from 'lib/store';
import { isMobile } from 'utils/helper';
import { DropdownItem } from 'components/misc/Dropdown';
import Tooltip from 'components/misc/Tooltip';
import Portal from 'components/misc/Portal';
import Logo from '../Logo';
import SidebarItem from './SidebarItem';

export default function SideMenu() {
  const currentView = useCurrentViewContext();
  const viewTy = currentView.state.view;
  const dispatch = currentView.dispatch;
  const dispatchFeed = useCallback(
    () => dispatch({view: 'feed'}), [dispatch]
  );
  const dispatchChron = useCallback(
    () => dispatch({view: 'chronicle'}), [dispatch]
  );
  const dispatchTask = useCallback(
    () => dispatch({view: 'task'}), [dispatch]
  );
  const dispatchGraph = useCallback(
    () => dispatch({view: 'graph'}), [dispatch]
  );
  const dispatchWrap = useCallback(
    () => dispatch({view: 'wrap'}), [dispatch]
  );
  const dispatchAI = useCallback(
    () => dispatch({view: 'ai'}), [dispatch]
  );

  const hotkeys = useMemo(
    () => [
      {
        hotkey: 'mod+shift+r',
        callback: dispatchFeed,
      },
      {
        hotkey: 'mod+shift+g',
        callback: dispatchGraph,
      },
      {
        hotkey: 'mod+shift+c',
        callback: dispatchChron,
      },
      {
        hotkey: 'mod+shift+t',
        callback: dispatchTask,
      },
    ],
    [dispatchFeed, dispatchGraph, dispatchChron, dispatchTask]
  );
  useHotkeys(hotkeys);

  const currentDir = useStore((state) => state.currentDir);

  return (    
    <div className="flex flex-col h-full">
      <Logo />
      <OpenButton />
      <FeedButton 
        viewTy={viewTy} 
        onDispatch={dispatchFeed} 
      />
      <AIButton viewTy={viewTy} onDispatch={dispatchAI} />
      {currentDir ? (
      <>
        <NewButton />
        <ChronButton viewTy={viewTy} onDispatch={dispatchChron} />
        <GraphButton viewTy={viewTy} onDispatch={dispatchGraph} />
        <TaskButton viewTy={viewTy} onDispatch={dispatchTask} />
      </>) : null}
      <WrapButton viewTy={viewTy} onDispatch={dispatchWrap} />
      <FileButton />
    </div>
  );
}

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
        content="Feed (Ctrl/⌘+Shift+R)"
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
        content="Visualization of networked writing (Ctrl/⌘+Shift+G)"
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

const TaskButton = (props: ButtonProps) => {
  const { viewTy, onClick, onDispatch } = props;

  return (
    <SidebarItem isHighlighted={viewTy === 'task'} onClick={onClick}>
      <Tooltip
        content="Tasks View (Ctrl/⌘+Shift+T)"
        placement="right"
      >
        <button className={btnClass} onClick={onDispatch}>
          <IconCheckbox size={24} className={btnIconClass} />
        </button>
      </Tooltip>
    </SidebarItem>
  );
};

const WrapButton = (props: ButtonProps) => {
  const { viewTy, onClick, onDispatch } = props;

  return (
    <SidebarItem isHighlighted={viewTy === 'wrap'} onClick={onClick}>
      <Tooltip
        content="Wrap App"
        placement="right"
      >
        <button className={btnClass} onClick={onDispatch}>
          <IconBox size={24} className="flex-shrink-0 mx-1 text-blue-600" />
        </button>
      </Tooltip>
    </SidebarItem>
  );
};

const AIButton = (props: ButtonProps) => {
  const { viewTy, onClick, onDispatch } = props;

  return (
    <SidebarItem isHighlighted={viewTy === 'ai'} onClick={onClick}>
      <Tooltip
        content="AI Assistant"
        placement="right"
      >
        <button className={btnClass} onClick={onDispatch}>
          <IconMessageChatbot size={24} className="flex-shrink-0 mx-1 text-purple-600" />
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
      <DropdownItem onClick={onClear}>
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
