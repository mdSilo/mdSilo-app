import { memo } from 'react';
import { useTransition, animated, SpringConfig } from '@react-spring/web';
import { isMobile } from 'utils/helper';
import { useStore } from 'lib/store';
import { SIDEBAR_WIDTH } from 'lib/userSettings';
import ResizeHandle, { useResizableWidth } from 'components/misc/ResizeHandle';
import SidebarContent from './SidebarContent';

const SPRING_CONFIG: SpringConfig = {
  mass: 1,
  tension: 170,
  friction: 10,
  clamp: true,
} as const;

type Props = {
  className?: string;
};

function Sidebar(props: Props) {
  const { className='' } = props; 

  const isSidebarOpen = useStore((state) => state.isSidebarOpen);
  const setIsSidebarOpen = useStore((state) => state.setIsSidebarOpen);
  const sidebarWidth = useStore((state) => state.sidebarWidth);
  const setSidebarWidth = useStore((state) => state.setSidebarWidth);
  const sideMenuOrientation = useStore((state) => state.sideMenuOrientation);
  const horizontalMenu = sideMenuOrientation === 'horizontal'
    ? 'top-12 md:top-0'
    : sideMenuOrientation === 'vertical'
      ? 'top-0'
      : 'top-12 md:top-0';
  // width while dragging, saved to store (persisted) on release
  const { width, onResize, onResizeEnd } = useResizableWidth(sidebarWidth, setSidebarWidth, SIDEBAR_WIDTH);

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

  return transition(
    (styles, item) =>
      item && (
        <>
          {isMobile(768) ? (
            <animated.div
              className="fixed inset-0 z-10"
              style={{
                backgroundColor: styles.backgroundColor,
                opacity: styles.backgroundOpacity,
                top: sideMenuOrientation === 'vertical' ? 0 : '3rem',
                display: styles.dspl.to((displ) =>
                  displ === 0 ? 'none' : 'initial'
                ),
              }}
              onClick={() => setIsSidebarOpen(false)}
            />
          ) : null}
          <animated.div
            className={`fixed bottom-0 left-0 z-20 flex-none shadow-popover md:shadow-none md:relative md:z-0 ${horizontalMenu}`}
            style={{
              width,
              // overlay on mobile: keep some of the page visible
              maxWidth: isMobile(768) ? '85vw' : undefined,
              transform: styles.transform,
              display: styles.dspl.to((displ) =>
                displ === 0 ? 'none' : 'initial'
              ),
            }}
          >
            <div
              className={`flex flex-col flex-none h-full border-r border-lime-900 bg-gray-50 dark:bg-gray-800 dark:text-gray-300 ${className}`}
            >
              <SidebarContent className="flex-1 overflow-x-hidden overflow-y-auto" />
            </div>
            <ResizeHandle
              width={width}
              bounds={SIDEBAR_WIDTH}
              label="Resize sidebar"
              onResize={onResize}
              onResizeEnd={onResizeEnd}
            />
          </animated.div>
        </>
      )
  );
}

export default memo(Sidebar);
