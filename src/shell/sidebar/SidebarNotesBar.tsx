import { memo } from "react";
import { TbArrowBarToUp as IconArrowBarToUp } from "react-icons/tb";
import { useStore } from "@/state/store";
import { Sort } from "@/state/userSettings";
import { Tooltip } from "@/ui/ui";
import { getParentDir } from "@/workspace/util";
import { listDirPath } from "@/workspace/useOpen";
import { t } from "@/i18n";
import SidebarNotesSortDropdown from "./SidebarNotesSortDropdown";
import WorkspaceSwitcher from "./WorkspaceSwitcher";

type Props = {
  noteSort: Sort;
  numOfNotes: number;
};

function SidebarNotesBar(props: Props) {
  const { noteSort, numOfNotes } = props;
  const setNoteSort = useStore((state) => state.setNoteSort);

  const initDir = useStore((state) => state.initDir);
  const currentDir = useStore((state) => state.currentDir);
  const checkInit: boolean = !currentDir || currentDir === initDir;

  return (
    <div className="flex items-center justify-between border-t border-base-300">
      <div className="flex mx-2 my-1">
        <SidebarNotesSortDropdown
          currentSort={noteSort}
          setCurrentSort={setNoteSort}
        />
      </div>
      <div className="flex-1 min-w-0 my-1">
        <WorkspaceSwitcher count={numOfNotes} />
      </div>
      <Tooltip content={checkInit ? "" : t("Go Upper Folder")}>
        <button
          className="p-1 mx-2 rounded-sm hover:bg-base-content/10"
          onClick={async (e) => {
            e.preventDefault();
            if (!currentDir || currentDir === initDir) return;
            const parentDir: string = await getParentDir(currentDir);
            await listDirPath(parentDir, false);
          }}
          disabled={checkInit}
        >
          <IconArrowBarToUp size={16} className="text-base-content/70" />
        </button>
      </Tooltip>
    </div>
  );
}

export default memo(SidebarNotesBar);
