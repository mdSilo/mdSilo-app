import { memo } from "react";
import { useTransition, animated, SpringConfig } from "@react-spring/web";
import useIsMobile from "@/lib/hooks/useIsMobile";
import { useStore } from "@/state/store";
import { SIDEBAR_WIDTH } from "@/state/userSettings";
import ResizeHandle, { useResizableWidth } from "@/ui/ResizeHandle";
import SidebarContent from "./SidebarContent";

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
  const { className = "" } = props;

  const isSidebarOpen = useStore((state) => state.isSidebarOpen);
  const setIsSidebarOpen = useStore((state) => state.setIsSidebarOpen);
  const sidebarWidth = useStore((state) => state.sidebarWidth);
  const setSidebarWidth = useStore((state) => state.setSidebarWidth);
  // a phone: over the page (in the area under the menu), with a backdrop
  const mobile = useIsMobile();
  // width while dragging, saved to store (persisted) on release
  const { width, onResize, onResizeEnd } = useResizableWidth(
    sidebarWidth,
    setSidebarWidth,
    SIDEBAR_WIDTH,
  );

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
      transform: "translateX(0%)",
      dspl: 1,
      backgroundOpacity: 0.3,
      backgroundColor: "black",
    },
    from: {
      transform: "translateX(-100%)",
      dspl: 0,
      backgroundOpacity: 0,
      backgroundColor: "transparent",
    },
    enter: {
      transform: "translateX(0%)",
      dspl: 1,
      backgroundOpacity: 0.3,
      backgroundColor: "black",
    },
    leave: {
      transform: "translateX(-100%)",
      dspl: 0,
      backgroundOpacity: 0,
      backgroundColor: "transparent",
    },
    config: SPRING_CONFIG,
    expires: (item) => !item,
  });

  return transition(
    (styles, item) =>
      item && (
        <>
          {mobile ? (
            <animated.div
              className="absolute inset-0 z-10"
              data-testid="sidebar-backdrop"
              style={{
                backgroundColor: styles.backgroundColor,
                opacity: styles.backgroundOpacity,
                display: styles.dspl.to((displ) =>
                  displ === 0 ? "none" : "initial",
                ),
              }}
              onClick={() => setIsSidebarOpen(false)}
            />
          ) : null}
          <animated.div
            className={
              mobile
                ? "absolute inset-y-0 left-0 z-20 flex-none shadow-popover"
                : "relative flex-none"
            }
            style={{
              width,
              // keep some of the page visible
              maxWidth: mobile ? "85vw" : undefined,
              transform: styles.transform,
              display: styles.dspl.to((displ) =>
                displ === 0 ? "none" : "initial",
              ),
            }}
          >
            <div
              className={`flex flex-col flex-none h-full border-r border-base-300 bg-base-200 ${className}`}
            >
              <SidebarContent className="flex-1 overflow-x-hidden overflow-y-auto" />
            </div>
            {mobile ? null : (
              <ResizeHandle
                width={width}
                bounds={SIDEBAR_WIDTH}
                label="Resize sidebar"
                onResize={onResize}
                onResizeEnd={onResizeEnd}
              />
            )}
          </animated.div>
        </>
      ),
  );
}

export default memo(Sidebar);
