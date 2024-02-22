import React, { memo, useCallback, useEffect } from 'react';
import { IconPin, IconTrash } from '@tabler/icons-react';
import { useStore } from 'lib/store';
import Tooltip from 'components/misc/Tooltip';
import { listInitDir } from 'editor/hooks/useOpen';

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

  const isOpenPreOn = useStore((state) => state.isOpenPreOn);
  const showHistory = useStore((state) => state.showHistory);
  let isOpened = false;
  useEffect(() => { 
    if (!isOpenPreOn || showHistory || isOpened) return;
    const recentDirPath = history.length > 0 ? history[history.length - 1] : '';
    if (!recentDirPath) return;
    listInitDir(recentDirPath).then(() => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      isOpened = true;
    }); 
  }, [history]);

  return (
    <div className={`flex flex-col flex-1 overflow-x-hidden ${className}`}>
      <b className="text-xl text-center mt-4 mx-2">Pinned Folder</b>
      {pinnedDir ? (
        <div
          role="button"
          className="text-center py-1 border-b dark:border-gray-700"
          onClick={async (e) => await openRecentDir(e, pinnedDir)}
        >
          <Tooltip content={pinnedDir}>
            <p className="text-green-500 text-lg overflow-hidden overflow-ellipsis whitespace-nowrap">
              {subDirPath(pinnedDir)}
            </p>
          </Tooltip>
        </div>
      ) : (
        <p className="text-slate-500 text-center">No Pinned Folder</p>
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
        className="p-1 m-4 rounded text-slate-500 hover:text-red-500" 
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
    <div className="flex items-center justify-between p-1 border-t dark:border-gray-700">
      <Tooltip content="Pin">
        <button
          className="mx-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          onClick={async (e) => {
            e.preventDefault();
            setPinnedDir(dir);
          }}
        >
          <IconPin size={16} className="text-gray-600 dark:text-gray-300" />
        </button>
      </Tooltip>
      <div
        role="button"
        className="text-center px-1 hover:bg-gray-200 dark:hover:bg-gray-700"
        onClick={async (e) => await openRecentDir(e, dir)}
      >
        <Tooltip content={dir}>
          <span className="overflow-hidden overflow-ellipsis whitespace-nowrap">
            {subDirPath(dir)}
          </span>
        </Tooltip>
      </div>
      <Tooltip content="Delete">
        <button
          className="mx-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          onClick={async (e) => {
            e.preventDefault();
            deleteRecentDir(dir);
          }}
        >
          <IconTrash size={16} className="text-gray-600 dark:text-gray-300" />
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
