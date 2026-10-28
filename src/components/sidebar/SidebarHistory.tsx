import React, { memo, useCallback, useEffect, useRef } from 'react';
import { TbPin as IconPin, TbTrash as IconTrash } from 'react-icons/tb';
import { useStore } from '@/state/store';
import { Tooltip } from '@/components/misc/ui';
import { listInitDir, startupDir } from '@/workspace/useOpen';
import { isWeb } from '@/workspace/util';

type Props = {
  className?: string;
};

function SidebarHistory(props: Props) {
  const { className = '' } = props;

  const history: string[] = useStore((state) => state.recentDir);
  const deleteRecentDir = useStore((state) => state.deleteRecentDir);
  const setRecentDir = useStore((state) => state.setRecentDir);
  const pinnedDir: string = useStore((state) => state.pinnedDir);
  const setPinnedDir = useStore((state) => state.setPinnedDir);

  const openRecentDir = useCallback(
    async (e: React.MouseEvent<HTMLDivElement, MouseEvent>, dir: string) => {
      e.preventDefault();
      await listInitDir(dir);
    }, []
  );

  const openOnStartup = useStore((state) => state.openOnStartup);
  const showHistory = useStore((state) => state.showHistory);
  // open the startup folder once: listInitDir updates recentDir, which
  // would otherwise re-run this effect forever while the history is mounted
  const isOpened = useRef(false);
  useEffect(() => { 
    // web: the workspace is opened on startup, see openWebWorkspace
    if (isWeb || showHistory || isOpened.current) return;
    const dir = startupDir({ openOnStartup, recentDir: history, pinnedDir });
    if (!dir) return;
    isOpened.current = true;
    listInitDir(dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, pinnedDir]);

  return (
    <div className={`flex flex-col flex-1 overflow-x-hidden ${className}`}>
      <b className="text-xl text-center mt-4 mx-2">Pinned Folder</b>
      {pinnedDir ? (
        <div
          role="button"
          className="text-center py-1 border-b border-base-300"
          onClick={async (e) => await openRecentDir(e, pinnedDir)}
        >
          <Tooltip content={pinnedDir}>
            <p className="text-success text-lg overflow-hidden text-ellipsis whitespace-nowrap">
              {subDirPath(pinnedDir)}
            </p>
          </Tooltip>
        </div>
      ) : (
        <p className="text-base-content/60 text-center">No Pinned Folder</p>
      )}
      <b className="text-center m-2">Recent History</b>
      {[...history].reverse().map((item, idx) => (
        <HistoryItem  
          key={`${item}-${idx}`}
          setPinnedDir={setPinnedDir}
          deleteRecentDir={deleteRecentDir}
          openRecentDir={openRecentDir}
          dir={item}
        />
      ))}
      <button 
        className="p-1 m-4 rounded-sm text-base-content/60 hover:text-error/80" 
        onClick={() => setRecentDir([])}
      >
        Clear History
      </button>
    </div>
  );
}

export default memo(SidebarHistory);


type ItemProps = {
  setPinnedDir: (dir: string) => void;
  deleteRecentDir: (dir: string) => void;
  openRecentDir: (e: React.MouseEvent<HTMLDivElement, MouseEvent>, dir: string) => Promise<void>;
  dir: string;
}

function HistoryItem(props: ItemProps) {
  const {setPinnedDir, deleteRecentDir, openRecentDir, dir} = props;
  
  return (
    <div className="flex items-center justify-between p-1 border-t border-base-300">
      <Tooltip content="Pin">
        <button
          className="mx-1 rounded-sm hover:bg-base-content/10"
          onClick={async (e) => {
            e.preventDefault();
            setPinnedDir(dir);
          }}
        >
          <IconPin size={16} className="text-base-content/70" />
        </button>
      </Tooltip>
      <div
        role="button"
        className="text-center px-1 hover:bg-base-content/10"
        onClick={async (e) => await openRecentDir(e, dir)}
      >
        <Tooltip content={dir}>
          <span className="overflow-hidden text-ellipsis whitespace-nowrap">
            {subDirPath(dir)}
          </span>
        </Tooltip>
      </div>
      <Tooltip content="Delete">
        <button
          className="mx-1 rounded-sm hover:bg-base-content/10"
          onClick={async (e) => {
            e.preventDefault();
            deleteRecentDir(dir);
          }}
        >
          <IconTrash size={16} className="text-base-content/70" />
        </button>
      </Tooltip>
    </div>
  );
}

function subDirPath(dir: string) {
  const parts = dir.split(/[/\\]/);
  const last1 = parts.pop() || '.';
  const last2 = parts.pop() || '';
  const newDir = `~${last2 ? '/' : ''}${last2}/${last1}`;
  const len = newDir.length;
  const start = Math.max(len - 20, 0);
  const prefix = start > 0 ? '...' : ''
  return prefix + newDir.substring(start);
}
