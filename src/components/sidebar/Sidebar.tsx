import { memo, useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { IconDna, IconBookmarks, IconCheckbox } from '@tabler/icons';
import { useTransition, animated } from '@react-spring/web';
import Tooltip from 'components/misc/Tooltip';
import { isMobile } from 'utils/helper';
import { useStore } from 'lib/store';
import { SpringConfig } from '@react-spring/web';
import { useCurrentViewContext } from 'context/useCurrentView';
import SidebarItem from './SidebarItem';
import SidebarContent from './SidebarContent';
import SidebarHeader from './SidebarHeader';

const SPRING_CONFIG: SpringConfig = {
  mass: 1,
  tension: 170,
  friction: 10,
  clamp: true,
} as const;

type Props = {
  setIsFindOrCreateModalOpen: Dispatch<SetStateAction<boolean>>;
  setIsSettingsOpen: Dispatch<SetStateAction<boolean>>;
  className?: string;
};

function Sidebar(props: Props) {
  const { 
    setIsFindOrCreateModalOpen, 
    setIsSettingsOpen, 
    className='' 
  } = props;

  const isSidebarOpen = useStore((state) => state.isSidebarOpen);
  const setIsSidebarOpen = useStore((state) => state.setIsSidebarOpen);
  const hideSidebarOnMobile = useCallback(() => {
    if (isMobile()) {
      setIsSidebarOpen(false);
    }
  }, [setIsSidebarOpen]);

  const transition = useTransition<
    boolean,
    {
      transform: string;
      dspl: number;
      backgroundOpacity: number;
      backgroundColor: string;
    }
  >(isSidebarOpen, {
    initial: {
      transform: 'translateX(0%)',
      dspl: 1,
      backgroundOpacity: 0.3,
      backgroundColor: 'black',
    },
    from: {
      transform: 'translateX(-100%)',
      dspl: 0,
      backgroundOpacity: 0,
      backgroundColor: 'transparent',
    },
    enter: {
      transform: 'translateX(0%)',
      dspl: 1,
      backgroundOpacity: 0.3,
      backgroundColor: 'black',
    },
    leave: {
      transform: 'translateX(-100%)',
      dspl: 0,
      backgroundOpacity: 0,
      backgroundColor: 'transparent',
    },
    config: SPRING_CONFIG,
    expires: (item) => !item,
  });

  const currentView = useCurrentViewContext();
  const viewTy = currentView.state.view;
  const dispatch = currentView.dispatch;
  const dispatchChron = () => dispatch({view: 'chronicle'});
  const dispatchTask = () => dispatch({view: 'task'});
  const dispatchGraph = () => dispatch({view: 'graph'});

  return transition(
    (styles, item) =>
      item && (
        <>
          {isMobile() ? (
            <animated.div
              className="fixed inset-0 z-10"
              style={{
                backgroundColor: styles.backgroundColor,
                opacity: styles.backgroundOpacity,
                display: styles.dspl.to((displ) =>
                  displ === 0 ? 'none' : 'initial'
                ),
              }}
              onClick={() => setIsSidebarOpen(false)}
            />
          ) : null}
          <animated.div
            className="fixed top-0 bottom-0 left-0 z-20 w-64 shadow-popover md:shadow-none md:static md:z-0"
            style={{
              transform: styles.transform,
              display: styles.dspl.to((displ) =>
                displ === 0 ? 'none' : 'initial'
              ),
            }}
          >
            <div
              className={`flex flex-col flex-none h-full border-r bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 ${className}`}
            >
              <SidebarHeader setIsSettingsOpen={setIsSettingsOpen} />
              <ChronButton 
                viewTy={viewTy} 
                onClick={hideSidebarOnMobile} 
                onDispatch={dispatchChron} 
              />
              <GraphButton 
                viewTy={viewTy} 
                onClick={hideSidebarOnMobile} 
                onDispatch={dispatchGraph} 
              />
              <TaskButton 
                viewTy={viewTy} 
                onClick={hideSidebarOnMobile} 
                onDispatch={dispatchTask} 
              />
              <SidebarContent
                className="flex-1 mt-3 overflow-x-hidden overflow-y-auto"
                setIsFindOrCreateModalOpen={setIsFindOrCreateModalOpen}
              />
            </div>
          </animated.div>
        </>
      )
  );
}

const btnClass = 'title flex items-center text-lg px-6 py-1';
const btnIconClass = 'flex-shrink-0 mr-1 text-gray-800 dark:text-gray-300';
const btnSpanClass = 'overflow-x-hidden select-none overflow-ellipsis whitespace-nowrap';

type ButtonProps = {
  viewTy: string;
  onClick: () => void;
  onDispatch: () => void;
};

const GraphButton = (props: ButtonProps) => {
  const { viewTy, onClick, onDispatch } = props;

  return (
    <SidebarItem isHighlighted={viewTy === 'graph'} onClick={onClick}>
      <Tooltip
        content="Visualization of networked notes (Ctrl+Shift+G)"
        placement="right"
        touch={true}
      >
        <button className={btnClass} onClick={onDispatch}>
          <>
            <IconDna size={20} className={btnIconClass} />
            <span className={btnSpanClass}>Graph View</span>
          </>
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
        content="Chronicle my life (Ctrl+Shift+C)"
        placement="right"
        touch={true}
      >
        <button className={btnClass} onClick={onDispatch}>
          <>
            <IconBookmarks size={20} className={btnIconClass} />
            <span className={btnSpanClass}>Chronicle</span>
          </>
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
        content="Track Personal Tasks (Ctrl+Shift+T)"
        placement="right"
        touch={true}
      >
        <button className={btnClass} onClick={onDispatch}>
          <>
            <IconCheckbox size={20} className={btnIconClass} />
            <span className={btnSpanClass}>Tasks View</span>
          </>
        </button>
      </Tooltip>
    </SidebarItem>
  );
};

export default memo(Sidebar);
