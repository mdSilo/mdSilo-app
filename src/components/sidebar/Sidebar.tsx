import { memo, useCallback, useRef, useState } from 'react';
import { useTransition, animated, SpringConfig } from '@react-spring/web';
import { isMobile } from 'utils/helper';
import { useStore } from 'lib/store';
import { SIDEBAR_WIDTH } from 'lib/userSettings';
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
  // width while dragging, saved to store (persisted) on release
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const width = clampWidth(dragWidth ?? sidebarWidth);

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
            className="fixed top-0 bottom-0 left-0 z-20 flex-none shadow-popover md:shadow-none md:relative md:z-0"
            style={{
              width,
              // overlay on mobile: keep some of the page visible
              maxWidth: isMobile() ? '85vw' : undefined,
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
            <SidebarResizer
              width={width}
              onResize={setDragWidth}
              onResizeEnd={(w) => {
                setSidebarWidth(clampWidth(w));
                setDragWidth(null);
              }}
            />
          </animated.div>
        </>
      )
  );
}

const clampWidth = (width: number) => {
  const w = Number.isFinite(width) ? width : SIDEBAR_WIDTH.default;
  return Math.round(Math.min(SIDEBAR_WIDTH.max, Math.max(SIDEBAR_WIDTH.min, w)));
};

type ResizerProps = {
  width: number;
  onResize: (width: number) => void;
  onResizeEnd: (width: number) => void;
};

/**
 * Drag handle on the right edge of the sidebar to resize its width.
 * Double click to reset, arrow keys to resize by keyboard.
 */
function SidebarResizer(props: ResizerProps) {
  const { width, onResize, onResizeEnd } = props;
  const dragRef = useRef<{ startX: number; startWidth: number; width: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { startX: e.clientX, startWidth: width, width };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    drag.width = clampWidth(drag.startWidth + e.clientX - drag.startX);
    onResize(drag.width);
  }, [onResize]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    onResizeEnd(drag.width);
  }, [onResizeEnd]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 64 : 16;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onResizeEnd(width - step);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      onResizeEnd(width + step);
    }
  }, [onResizeEnd, width]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={width}
      aria-valuemin={SIDEBAR_WIDTH.min}
      aria-valuemax={SIDEBAR_WIDTH.max}
      tabIndex={0}
      title="Drag to resize, double click to reset"
      className="absolute top-0 bottom-0 z-10 w-1.5 -right-0.5 cursor-col-resize select-none hover:bg-blue-500/50 active:bg-blue-500/70 focus:outline-none focus-visible:bg-blue-500/50"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => onResizeEnd(SIDEBAR_WIDTH.default)}
      onKeyDown={onKeyDown}
    />
  );
}

export default memo(Sidebar);
