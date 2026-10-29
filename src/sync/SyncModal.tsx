import { useCallback, useEffect, useState } from 'react';
import { store, useStore } from '@/state/store';
import { useCurrentViewContext } from '@/state/useCurrentView';
import { BaseModal } from '@/ui/BaseModal';
import { Select, Spinner, Toggle } from '@/ui/ui';
import { openFilePath } from '@/workspace/open';
import { joinPath } from '@/workspace/util';
import { syncInfo, syncSetup, type SyncInfo } from './api';
import { syncWorkspace, useSyncState } from './syncWorkspace';

type Props = {
  ws: string;
  isOpen: boolean;
  handleClose: () => void;
};

type Form = { url: string; username: string; token: string; authorName: string; authorEmail: string };

const formOf = (info?: SyncInfo): Form => ({
  url: info?.remoteUrl ?? '',
  username: info?.username ?? '',
  token: '',
  authorName: info?.authorName ?? '',
  authorEmail: info?.authorEmail ?? '',
});

const inputClass = 'input input-sm w-full';

/** minutes between automatic syncs */
const INTERVALS: [number, string][] = [
  [0, 'Never'],
  [5, '5 minutes'],
  [15, '15 minutes'],
  [30, '30 minutes'],
  [60, 'Hour'],
];

/** Set up the sync of the workspace with a git remote, and sync. */
export default function SyncModal({ ws, isOpen, handleClose }: Props) {
  const { dispatch } = useCurrentViewContext();
  const { syncing, report, error, at, ws: syncedWs } = useSyncState();
  const syncSettings = useStore((state) => state.syncSettings);
  const setSyncSettings = useStore((state) => state.setSyncSettings);
  const [info, setInfo] = useState<SyncInfo>();
  const [form, setForm] = useState<Form>(formOf());
  const [forgetToken, setForgetToken] = useState(false);
  const [editing, setEditing] = useState(false);
  const [setupError, setSetupError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await syncInfo(ws);
      setInfo(next);
      setForm(formOf(next));
      setEditing(!next.isRepo || !next.remoteUrl);
    } catch (e) {
      setSetupError(String(e));
    }
  }, [ws]);

  useEffect(() => {
    if (isOpen) void refresh();
  }, [isOpen, refresh]);
  // the count of changes, after a sync
  useEffect(() => {
    if (isOpen && !syncing && at) void refresh();
  }, [isOpen, syncing, at, refresh]);

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    setSaving(true);
    setSetupError(undefined);
    try {
      const next = await syncSetup(ws, {
        url: form.url,
        username: form.username,
        token: forgetToken ? '' : form.token || undefined,
        authorName: form.authorName,
        authorEmail: form.authorEmail,
      });
      setInfo(next);
      setForm(formOf(next));
      setForgetToken(false);
      setEditing(false);
    } catch (e) {
      setSetupError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const openNote = async (path: string) => {
    const file = joinPath(ws, path);
    await openFilePath(file, true);
    store.getState().setCurrentNoteId(file);
    dispatch({ view: 'md', params: { noteId: file } });
    handleClose();
  };

  const ready = Boolean(info?.isRepo && info.remoteUrl);
  const lastReport = syncedWs === ws ? report : undefined;
  const lastError = syncedWs === ws ? error : undefined;

  return (
    <BaseModal title="Sync" isOpen={isOpen} handleClose={handleClose} panelClassName="max-w-md">
      <div className="flex flex-col gap-3 p-3 text-sm text-left bg-base-200">
        <p className="text-base-content/80">
          The workspace syncs as a git repository with a remote such as GitHub or Gitea, over HTTPS
          with a personal access token. Books sync only if chosen in the library.
        </p>

        {ready && !editing ? (
          <div className="flex flex-col gap-1">
            <div className="break-all">
              <span className="text-base-content/70">Remote: </span>{info?.remoteUrl}
              {info?.branch ? <span className="text-base-content/70"> ({info.branch})</span> : null}
            </div>
            <div className="text-base-content/70">
              {info?.hasToken ? 'Token saved' : 'No token'} · {info?.changes ?? 0} changed since the last sync
            </div>
            <button className="self-start link link-primary text-xs" onClick={() => setEditing(true)}>
              Change the remote
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span>Repository URL</span>
              <input
                className={inputClass}
                placeholder="https://github.com/me/notes.git"
                value={form.url}
                onChange={set('url')}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>Token {info?.hasToken ? <span className="text-base-content/70">(saved; empty to keep it)</span> : null}</span>
              <input
                className={inputClass}
                type="password"
                autoComplete="off"
                placeholder="a personal access token, with write access to the repository"
                value={form.token}
                disabled={forgetToken}
                onChange={set('token')}
              />
            </label>
            {info?.hasToken ? (
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  className="checkbox checkbox-xs"
                  checked={forgetToken}
                  onChange={(e) => setForgetToken(e.target.checked)}
                />
                Forget the saved token
              </label>
            ) : null}
            <label className="flex flex-col gap-1">
              <span>User name <span className="text-base-content/70">(if the host needs it with the token)</span></span>
              <input className={inputClass} value={form.username} onChange={set('username')} />
            </label>
            <div className="text-xs text-base-content/70">
              Author of the commits <span className="badge badge-ghost badge-xs">optional</span>
              {' '}Empty: the name and email of your git config, or mdSilo.
            </div>
            <div className="flex gap-2">
              <label className="flex flex-col flex-1 gap-1">
                <span>Name</span>
                <input className={inputClass} placeholder="Name" value={form.authorName} onChange={set('authorName')} />
              </label>
              <label className="flex flex-col flex-1 gap-1">
                <span>Email</span>
                <input className={inputClass} placeholder="me@example.com" value={form.authorEmail} onChange={set('authorEmail')} />
              </label>
            </div>
            <p className="text-xs text-base-content/70">
              The token is kept in the app data of this device, never in the workspace.
            </p>
            {setupError ? <div role="alert" className="text-error">{setupError}</div> : null}
            <div className="flex justify-end gap-2">
              {ready ? (
                <button className="btn btn-sm btn-ghost" onClick={() => { setEditing(false); setForm(formOf(info)); }}>
                  Cancel
                </button>
              ) : null}
              <button className="btn btn-sm btn-primary" disabled={!form.url.trim() || saving} onClick={save}>
                Save
              </button>
            </div>
          </div>
        )}

        {ready && !editing ? (
          <button className="btn btn-sm btn-primary" disabled={syncing} onClick={() => void syncWorkspace(ws)}>
            {syncing ? <Spinner size="xs" color="neutral" /> : null}
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        ) : null}

        {ready && !editing ? (
          <div className="flex flex-col gap-2 pt-2 border-t border-base-300">
            <span className="font-semibold">Automatic sync</span>
            <Select
              label="Every"
              value={String(syncSettings.interval)}
              onChange={(v) => setSyncSettings({ ...syncSettings, interval: Number(v) })}
            >
              {INTERVALS.map(([minutes, name]) => (
                <option key={minutes} value={minutes}>{name}</option>
              ))}
            </Select>
            <Toggle
              label="When the app closes"
              checked={syncSettings.onExit}
              onChange={(onExit) => setSyncSettings({ ...syncSettings, onExit })}
            />
          </div>
        ) : null}

        {lastError ? <div role="alert" className="break-words text-error">{lastError}</div> : null}
        {lastReport && !lastError ? (
          <div className="flex flex-col gap-1">
            <div className="text-base-content/70">
              {lastReport.pulled.length} changed from the remote
              {lastReport.pushed ? ', changes sent' : ''}
              {at ? ` · ${new Date(at).toLocaleTimeString()}` : ''}
            </div>
            {lastReport.conflicts.some((c) => c.copy) ? (
              <div className="flex flex-col gap-1">
                <div className="text-warning">
                  Changed on both sides: the remote version is in the note, this device&apos;s beside it.
                </div>
                <ul className="flex flex-col gap-1">
                  {lastReport.conflicts.filter((c) => c.copy).map((c) => (
                    <li key={c.path} className="break-all">
                      <FileLink path={c.path} open={openNote} />
                      {' ← '}
                      <FileLink path={c.copy!} open={openNote} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </BaseModal>
  );
}

/** A note opens on click; other files are only named. */
function FileLink({ path, open }: { path: string; open: (path: string) => Promise<void> }) {
  if (!path.toLowerCase().endsWith('.md')) return <span>{path}</span>;
  return <button className="link" onClick={() => void open(path)}>{path}</button>;
}
