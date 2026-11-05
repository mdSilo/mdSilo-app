import { useLayoutEffect, useState, type ReactNode } from "react";
import { create } from "zustand";
import { MenuItem } from "@headlessui/react";
import {
  TbMenu2,
  TbDna,
  TbCalendar,
  TbFeather,
  TbRss,
  TbSettings,
  TbLayoutKanban,
  TbCircleDot,
  TbHeadphones,
  TbBook,
  TbBooks,
  TbRefresh,
} from "react-icons/tb";
import { useCurrentViewContext } from "@/state/useCurrentView";
import { useStore } from "@/state/store";
import useIsMobile from "@/lib/hooks/useIsMobile";
import { ViewAction } from "@/state/viewReducer";
import { isTauri } from "@/workspace/util";
import Dropdown from "@/ui/Dropdown";
import Logo from "@/ui/Logo";
import { usePlayer } from "@/player/playerStore";
import { useTTS } from "@/reader/tts/tts";
import { isSyncAvailable } from "@/sync/api";
import { useSyncState } from "@/sync/syncWorkspace";
import SyncModal from "@/sync/SyncModal";
import { AppMenuItems, FileDrop, PluginMenuItems } from "@/shell/SideMenu";

/**
 * A phone, the side menu left to "auto": no side menu, its buttons are in a
 * dropdown of the logo, at the start of the menu bar of the view.
 */
export const useMenuInView = () => {
  const orientation = useStore((state) => state.sideMenuOrientation);
  const mobile = useIsMobile();
  return orientation === "auto" && mobile;
};

/** how many views show the menu in their bar now */
const useInlineMenus = create<{ count: number }>(() => ({ count: 0 }));

/**
 * The menu, inline at the start of the menu bar of a view; nothing but on a
 * phone. A view without a bar gets it floating, see ViewMenuFallback.
 */
export default function ViewMenu({ className = "" }: { className?: string }) {
  const inView = useMenuInView();
  // before paint: the floating one is not seen along with this
  useLayoutEffect(() => {
    if (!inView) return;
    useInlineMenus.setState((s) => ({ count: s.count + 1 }));
    return () => useInlineMenus.setState((s) => ({ count: s.count - 1 }));
  }, [inView]);
  if (!inView) return null;
  return <ViewMenuDropdown className={className} />;
}

/** The menu over the top-start corner of a view without a bar for it. */
export function ViewMenuFallback() {
  const inView = useMenuInView();
  const inline = useInlineMenus((s) => s.count > 0);
  if (!inView || inline) return null;
  return (
    <div className="absolute top-1 start-1 z-10 rounded-sm shadow-sm bg-base-200/90">
      <ViewMenuDropdown />
    </div>
  );
}

// the direction of the app: the menu opens below the logo, toward the view
const isRtl = () =>
  typeof document !== "undefined" &&
  getComputedStyle(document.documentElement).direction === "rtl";

const iconClass = "shrink-0 text-base-content/70";

function ViewMenuDropdown({ className = "" }: { className?: string }) {
  const { state, dispatch } = useCurrentViewContext();
  const viewTy = state.view;

  const currentDir = useStore((s) => s.currentDir);
  const initDir = useStore((s) => s.initDir);
  // books are in the workspace layout only
  const hasReading = useStore((s) => s.layout === "workspace");
  const lastBook = useStore((s) =>
    s.initDir ? s.lastBooks[s.initDir] : undefined,
  );
  const isSidebarOpen = useStore((s) => s.isSidebarOpen);
  const setIsSidebarOpen = useStore((s) => s.setIsSidebarOpen);
  const setIsFindOrCreateModalOpen = useStore(
    (s) => s.setIsFindOrCreateModalOpen,
  );
  const setIsSettingsOpen = useStore((s) => s.setIsSettingsOpen);

  const playerShown = usePlayer((s) => s.shown);
  const reading = useTTS((s) => s.active);
  const hasPod = useStore((s) => Boolean(s.currentPod));

  const hasSync = isSyncAvailable && Boolean(initDir);
  const syncing = useSyncState((s) => s.syncing);
  const syncFailed = useSyncState((s) => Boolean(s.error) && s.ws === initDir);
  const [isSyncOpen, setIsSyncOpen] = useState(false);

  const go = (view: ViewAction) => {
    setIsSidebarOpen(false);
    dispatch(view);
  };

  return (
    <>
      <Dropdown
        buttonChildren={
          <Logo width={24} height={24} wrapperClassName="text-center p-1.5" />
        }
        buttonClassName={`block shrink-0 rounded-sm hover:bg-base-content/10 focus:outline-hidden ${className}`}
        itemsClassName="min-w-72"
        placement={isRtl() ? "bottom-end" : "bottom-start"}
      >
        <div className="max-h-[80vh] overflow-y-auto" data-testid="view-menu">
          <div className="grid grid-cols-4 gap-1 p-2">
            <Tile
              label="Explorer"
              active={isSidebarOpen}
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            >
              <TbMenu2 size={22} className={iconClass} />
            </Tile>
            {currentDir ? (
              <Tile
                label="New"
                onClick={() => {
                  setIsSidebarOpen(false);
                  setIsFindOrCreateModalOpen((isOpen) => !isOpen);
                }}
              >
                <TbFeather size={22} className="shrink-0 text-primary" />
              </Tile>
            ) : null}
            <Tile
              label="Feed"
              active={viewTy === "feed"}
              onClick={() => go({ view: "feed" })}
            >
              <TbRss size={22} className="shrink-0 text-orange-600" />
            </Tile>
            {hasReading ? (
              <Tile
                label="Library"
                active={viewTy === "library" || viewTy === "vocabulary"}
                onClick={() => go({ view: "library" })}
              >
                <TbBooks size={22} className={iconClass} />
              </Tile>
            ) : null}
            {hasReading && lastBook ? (
              <Tile
                label="Last Book"
                active={viewTy === "book"}
                onClick={() => go({ view: "book", path: lastBook })}
              >
                <TbBook size={22} className="shrink-0 text-primary" />
              </Tile>
            ) : null}
            {currentDir ? (
              <>
                <Tile
                  label="Issues"
                  active={viewTy === "issues" || viewTy === "issue"}
                  onClick={() => go({ view: "issues" })}
                >
                  <TbCircleDot size={22} className={iconClass} />
                </Tile>
                <Tile
                  label="Projects"
                  active={viewTy === "project"}
                  onClick={() => go({ view: "project" })}
                >
                  <TbLayoutKanban size={22} className={iconClass} />
                </Tile>
                <Tile
                  label="Chronicle"
                  active={viewTy === "chronicle"}
                  onClick={() => go({ view: "chronicle" })}
                >
                  <TbCalendar size={22} className={iconClass} />
                </Tile>
                <Tile
                  label="Graph"
                  active={viewTy === "graph"}
                  onClick={() => go({ view: "graph" })}
                >
                  <TbDna size={22} className={iconClass} />
                </Tile>
              </>
            ) : null}
            <Tile
              label="Player"
              active={playerShown}
              onClick={() => usePlayer.getState().setShown(!playerShown)}
            >
              <TbHeadphones
                size={22}
                className={
                  reading || hasPod ? "shrink-0 text-primary" : iconClass
                }
              />
            </Tile>
            {hasSync ? (
              <Tile label="Sync" onClick={() => setIsSyncOpen(true)}>
                <span className="relative">
                  <TbRefresh
                    size={22}
                    className={`${iconClass} ${syncing ? "animate-spin" : ""}`}
                  />
                  {syncFailed && !syncing ? (
                    <span className="absolute -top-0.5 -end-0.5 w-2 h-2 rounded-full bg-error" />
                  ) : null}
                </span>
              </Tile>
            ) : null}
            <Tile label="Settings" onClick={() => setIsSettingsOpen(true)}>
              <TbSettings size={22} className={iconClass} />
            </Tile>
          </div>
          <div className="border-t-2 border-base-300">
            <FileDrop />
          </div>
          {isTauri ? (
            <div className="border-t-2 border-base-300">
              <PluginMenuItems
                hasWorkspace={Boolean(currentDir)}
                onDispatch={go}
              />
            </div>
          ) : null}
          <div className="border-t-2 border-base-300">
            <AppMenuItems settings={false} />
          </div>
        </div>
      </Dropdown>
      {hasSync && initDir ? (
        <SyncModal
          ws={initDir}
          isOpen={isSyncOpen}
          handleClose={() => setIsSyncOpen(false)}
        />
      ) : null}
    </>
  );
}

type TileProps = {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
};

/** A button of the grid: an icon over its name, tinted when its view is on. */
function Tile({ label, active, onClick, children }: TileProps) {
  return (
    <MenuItem>
      {({ focus }) => (
        <button
          type="button"
          aria-label={label}
          aria-current={active ? "page" : undefined}
          className={`flex flex-col items-center gap-0.5 min-w-0 px-1 py-2 rounded-sm text-xs text-base-content select-none ${
            active ? "bg-primary/20" : focus ? "bg-base-content/10" : ""
          }`}
          onClick={onClick}
        >
          {children}
          <span className="max-w-full truncate">{label}</span>
        </button>
      )}
    </MenuItem>
  );
}
