import { memo, useState, type MouseEvent } from "react";
import { MenuItem } from "@headlessui/react";
import {
  TbCheck,
  TbChevronDown,
  TbFolder,
  TbFolderPlus,
  TbPin,
  TbPinFilled,
  TbPlus,
  TbX,
} from "react-icons/tb";
import { useStore } from "@/state/store";
import Dropdown, { DropdownItem } from "@/ui/Dropdown";
import Portal from "@/ui/Portal";
import DirNewModal from "@/shell/dir/DirNewModal";
import { onListDir, reopenWorkspace } from "@/workspace/useOpen";
import { normalizeSlash } from "@/workspace/util";
import { useT } from "@/i18n";

const baseName = (dir: string) => normalizeSlash(dir).split("/").pop() || dir;

/**
 * The workspace in the bar of the explorer, with the number of items of the
 * folder shown; its menu switches to the pinned or a recent folder in place,
 * without closing the one open first, and makes a subfolder.
 */
function WorkspaceSwitcher({ count }: { count?: number }) {
  const t = useT();
  // the workspace, or the folder of a file opened alone (Open File)
  const initDir = useStore((state) => state.initDir || state.currentDir);
  // the workspace, or a folder of it (Open Folder Here)
  const currentDir = useStore((state) => state.currentDir);
  const [isNewDirOpen, setIsNewDirOpen] = useState(false);
  const recentDir = useStore((state) => state.recentDir);
  const pinnedDir = useStore((state) => state.pinnedDir);
  const setPinnedDir = useStore((state) => state.setPinnedDir);
  const deleteRecentDir = useStore((state) => state.deleteRecentDir);
  const setRecentDir = useStore((state) => state.setRecentDir);
  if (!initDir) return null;

  // the pinned folder first, then the latest
  const dirs = [
    ...new Set([pinnedDir, ...[...(recentDir ?? [])].reverse()]),
  ].filter(Boolean);

  const onSwitch = (dir: string) => {
    if (dir !== initDir) void reopenWorkspace(dir);
  };
  // the row is the switch, these buttons in it are not
  const stop = (e: MouseEvent, action: () => void) => {
    e.stopPropagation();
    e.preventDefault();
    action();
  };

  const shownDir = currentDir || initDir;
  const inSubfolder = normalizeSlash(shownDir) !== normalizeSlash(initDir);

  return (
    <>
      <Dropdown
        buttonChildren={
          <span className="flex items-center justify-center gap-1 min-w-0">
            <TbFolder size={16} className="shrink-0 text-base-content/70" />
            <span className="font-semibold truncate">
              {baseName(initDir)}
              {inSubfolder ? ` / ${baseName(shownDir)}` : ""}
            </span>
            {count !== undefined ? (
              <span className="shrink-0 text-xs text-base-content/60">
                <span className="sr-only">: </span>
                {count}
              </span>
            ) : null}
            <TbChevronDown
              size={14}
              className="shrink-0 text-base-content/60"
            />
          </span>
        }
        buttonClassName="block w-full min-w-0 px-2 py-1 text-sm rounded-sm hover:bg-base-content/10 focus:outline-hidden"
        itemsClassName="min-w-64 max-w-[90vw]"
        placement="bottom"
        tooltipContent={shownDir}
      >
        <div
          className="max-h-[60vh] overflow-y-auto"
          data-testid="workspace-list"
        >
          <div className="px-4 pt-2 pb-1 text-xs text-base-content/60">
            {t("Folders")}
          </div>
          {dirs.map((dir) => {
            const isCurrent = dir === initDir;
            const isPinned = dir === pinnedDir;
            return (
              <MenuItem key={dir}>
                {({ focus }) => (
                  <div
                    role="menuitem"
                    title={dir}
                    aria-current={isCurrent ? "true" : undefined}
                    className={`group flex items-center gap-1 ps-4 pe-2 py-1.5 text-sm cursor-pointer select-none ${focus ? "bg-base-content/10" : ""}`}
                    onClick={() => onSwitch(dir)}
                  >
                    <span className="w-4 shrink-0">
                      {isCurrent ? (
                        <TbCheck size={14} className="text-success" />
                      ) : null}
                    </span>
                    <span className="flex-1 min-w-0 truncate">
                      {baseName(dir)}
                      <span className="ms-2 text-xs text-base-content/50">
                        {dir}
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label={isPinned ? t("Unpin") : t("Pin")}
                      title={
                        isPinned
                          ? t("Unpin")
                          : t("Pin: open on startup if so set")
                      }
                      className={`p-0.5 rounded-sm hover:bg-base-content/15 ${isPinned ? "" : "[@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus:opacity-100"}`}
                      onClick={(e) =>
                        stop(e, () => setPinnedDir(isPinned ? "" : dir))
                      }
                    >
                      {isPinned ? (
                        <TbPinFilled size={14} className="text-primary" />
                      ) : (
                        <TbPin size={14} className="text-base-content/70" />
                      )}
                    </button>
                    {isCurrent || isPinned ? (
                      <span className="w-5 shrink-0" />
                    ) : (
                      <button
                        type="button"
                        aria-label={t("Remove from Recent")}
                        title={t("Remove from Recent")}
                        className="p-0.5 rounded-sm [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-base-content/15"
                        onClick={(e) => stop(e, () => deleteRecentDir(dir))}
                      >
                        <TbX size={14} className="text-base-content/70" />
                      </button>
                    )}
                  </div>
                )}
              </MenuItem>
            );
          })}
        </div>
        <DropdownItem
          className="border-t border-base-300"
          onClick={() => setIsNewDirOpen(true)}
        >
          <TbPlus size={16} className="me-1" />
          <span>{t("New Subfolder")}</span>
        </DropdownItem>
        <DropdownItem onClick={onListDir}>
          <TbFolderPlus size={16} className="me-1" />
          <span>{t("Open Folder…")}</span>
        </DropdownItem>
        {dirs.length > 1 ? (
          <DropdownItem
            className="text-base-content/70"
            onClick={() => setRecentDir([initDir])}
          >
            <TbX size={16} className="me-1" />
            <span>{t("Clear Recent")}</span>
          </DropdownItem>
        ) : null}
      </Dropdown>
      {isNewDirOpen ? (
        <Portal>
          <DirNewModal
            dirPath={shownDir}
            isOpen={isNewDirOpen}
            handleClose={() => setIsNewDirOpen(false)}
          />
        </Portal>
      ) : null}
    </>
  );
}

export default memo(WorkspaceSwitcher);
