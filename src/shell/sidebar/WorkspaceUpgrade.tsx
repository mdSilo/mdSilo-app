import { memo, useState } from 'react';
import { useStore } from '@/state/store';
import { reopenWorkspace } from '@/workspace/useOpen';

/**
 * On a legacy workspace: offer to move it into the workspace layout
 * (reading/, writing/, .mdsilo/), see workspace/migrate.
 */
function WorkspaceUpgrade() {
  const initDir = useStore((state) => state.initDir);
  const layout = useStore((state) => state.layout);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!initDir || layout !== 'legacy') return null;

  const upgrade = async () => {
    setBusy(true);
    setError('');
    try {
      const { migrateToWorkspace } = await import('@/workspace/migrate');
      const result = await migrateToWorkspace(initDir);
      await reopenWorkspace(initDir);
      if (result.skipped.length > 0) {
        setError(`Left at the root, already in writing/: ${result.skipped.join(', ')}`);
      }
    } catch (e) {
      console.error('Failed to upgrade the workspace', e);
      setError(String(e));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <div className="mx-2 my-1 p-2 text-xs rounded-sm bg-base-200" data-testid="workspace-upgrade">
      {confirming ? (
        <>
          <p className="mb-2">
            Notes move into <b>writing/</b>, clips into <b>reading/</b>, and the
            issues into <b>.mdsilo/</b>. Links keep working.
          </p>
          <div className="flex gap-2">
            <button className="btn btn-xs btn-primary" onClick={upgrade} disabled={busy}>
              {busy ? 'Upgrading...' : 'Upgrade'}
            </button>
            <button className="btn btn-xs" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="text-base-content/70">Folder without reading and writing</span>
          <button className="btn btn-xs btn-outline" onClick={() => setConfirming(true)}>
            Upgrade
          </button>
        </div>
      )}
      {error ? <p className="mt-1 text-error">{error}</p> : null}
    </div>
  );
}

export default memo(WorkspaceUpgrade);
