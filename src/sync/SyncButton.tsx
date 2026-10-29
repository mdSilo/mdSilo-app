import { useState } from 'react';
import { TbRefresh } from 'react-icons/tb';
import { useStore } from '@/state/store';
import { Tooltip } from '@/ui/ui';
import { isSyncAvailable } from './api';
import { useSyncState } from './syncWorkspace';
import SyncModal from './SyncModal';

type Props = {
  className: string;
  iconClassName: string;
  tooltipPlacement?: 'top' | 'right' | 'bottom' | 'left';
};

/** The sync of the workspace, in the side menu; see SyncModal. */
export default function SyncButton({ className, iconClassName, tooltipPlacement }: Props) {
  const initDir = useStore((state) => state.initDir);
  const syncing = useSyncState((s) => s.syncing);
  const failed = useSyncState((s) => Boolean(s.error) && s.ws === initDir);
  const [isOpen, setIsOpen] = useState(false);
  if (!isSyncAvailable || !initDir) return null;

  return (
    <>
      <Tooltip content={syncing ? 'Syncing…' : failed ? 'Sync failed' : 'Sync'} placement={tooltipPlacement}>
        <button aria-label="Sync" className={`${className} relative`} onClick={() => setIsOpen(true)}>
          <TbRefresh size={22} className={`${iconClassName} ${syncing ? 'animate-spin' : ''}`} />
          {failed && !syncing ? <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-error" /> : null}
        </button>
      </Tooltip>
      <SyncModal ws={initDir} isOpen={isOpen} handleClose={() => setIsOpen(false)} />
    </>
  );
}
