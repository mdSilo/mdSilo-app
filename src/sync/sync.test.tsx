import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import type { Mock } from 'vitest';
import { store } from '@/state/store';
import { useCurrentViewContext } from '@/state/useCurrentView';
import { issueStore, resetIssueStore } from '@/issue/issueStore';
import { hasPendingSave, scheduleSave } from '@/workspace/pendingSaves';
import { useNoteReloads } from '@/workspace/noteReloads';
import { makeFileMeta, makeNote, mockInvoke, renderWithView, resetStore, useWebFs } from '@/testUtils';
import { openFilePaths } from '@/workspace/open';
import type { SyncInfo, SyncReport } from './api';
import { applyPulled, syncWorkspace, useSyncState } from './syncWorkspace';
import SyncModal from './SyncModal';
import SyncButton from './SyncButton';

// FileAPI does not work in tests: the notes opened are checked by the paths
vi.mock('@/workspace/open', async (original) => ({
  ...(await original<typeof import('@/workspace/open')>()),
  openFilePaths: vi.fn(async () => true),
}));

const WS = '/ws';

const report = (partial: Partial<SyncReport> = {}): SyncReport => ({
  committed: true,
  pulled: [],
  pushed: true,
  conflicts: [],
  ...partial,
});

const issueJson = (number: number, title: string) =>
  JSON.stringify({ number, title, body: '', state: 'open', labels: [], events: [], createdAt: '2026-10-29T00:00:00Z', updatedAt: '2026-10-29T00:00:00Z' });

beforeEach(() => {
  resetStore();
  useSyncState.setState({ syncing: false, ws: undefined, report: undefined, error: undefined, at: undefined });
});
afterEach(() => resetIssueStore());

describe('syncWorkspace', () => {
  test('the edits are saved before the sync, what came in is loaded after', async () => {
    const web = await useWebFs();
    store.getState().setInitDir(WS);
    store.getState().setLayout('workspace');
    await web('write_file', { filePath: `${WS}/writing/Gone.md`, text: 'gone' });
    store.getState().upsertNote(makeNote({ id: `${WS}/writing/Gone.md`, title: 'Gone' }));
    store.getState().setCurrentNoteId(`${WS}/writing/Open.md`);
    scheduleSave(`${WS}/writing/Open.md`, 'typed');

    // FileAPI does not write in tests: flushed is enough
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let pendingAtSync = true;
    (invoke as Mock).mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd !== 'sync_run') return web(cmd, args);
      pendingAtSync = hasPendingSave(`${WS}/writing/Open.md`);
      // the remote: a new note, the open note changed, a note deleted, an issue
      await web('write_file', { filePath: `${WS}/writing/New.md`, text: '# New' });
      await web('write_file', { filePath: `${WS}/writing/Open.md`, text: 'from the remote' });
      await web('delete_files', { paths: [`${WS}/writing/Gone.md`] });
      await web('create_dir_recursive', { dirPath: `${WS}/.mdsilo/issues` });
      await web('write_file', { filePath: `${WS}/.mdsilo/issues/1.json`, text: issueJson(1, 'From there') });
      await web('write_file', { filePath: `${WS}/.mdsilo/issues/meta.json`, text: '{"nextNumber":2}' });
      return report({ pulled: ['writing/New.md', 'writing/Open.md', 'writing/Gone.md', '.mdsilo/issues/1.json'] });
    });
    const reloads = useNoteReloads.getState().seq;

    const result = await syncWorkspace(WS);
    expect(pendingAtSync).toBe(false);
    expect(result?.pushed).toBe(true);
    expect(openFilePaths).toHaveBeenCalledWith([`${WS}/writing/New.md`, `${WS}/writing/Open.md`]);
    expect(store.getState().notes.get(`${WS}/writing/Gone.md`)).toBeUndefined();
    expect(issueStore.getState().data.issues.map((i) => i.title)).toEqual(['From there']);
    expect(useNoteReloads.getState().seq).toBe(reloads + 1);
    expect(useSyncState.getState()).toMatchObject({ syncing: false, ws: WS, error: undefined });
  });

  test('an error is kept to show', async () => {
    mockInvoke(invoke, { sync_run: () => Promise.reject('authentication failed (HTTP 401): check the token') });
    expect(await syncWorkspace(WS)).toBeUndefined();
    expect(useSyncState.getState()).toMatchObject({ syncing: false, error: 'authentication failed (HTTP 401): check the token' });
  });

  test('nothing pulled, nothing loaded', async () => {
    mockInvoke(invoke, {});
    await applyPulled(WS, []);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('SyncModal', () => {
  const ViewProbe = () => {
    const { state } = useCurrentViewContext();
    return <p data-testid="view">{JSON.stringify(state)}</p>;
  };

  test('set up a remote, then sync; the conflicts open', async () => {
    let info: SyncInfo = { isRepo: false, hasToken: false, changes: 0 };
    const setup = vi.fn((args: Record<string, unknown>) => {
      const s = args.setup as Record<string, string>;
      info = { isRepo: true, branch: 'main', remoteUrl: s.url, hasToken: Boolean(s.token), changes: 3 };
      return info;
    });
    mockInvoke(invoke, {
      sync_info: () => info,
      sync_setup: setup,
      sync_run: () => {
        info = { ...info, changes: 0 };
        return report({
          pulled: ['writing/Note.md'],
          conflicts: [
            { path: 'writing/Note.md', copy: 'writing/Note (conflict 2026-10-29 1530).md' },
            { path: '.mdsilo/books.json' },
          ],
        });
      },
      file_exist: true,
      get_file_meta: (args: Record<string, unknown>) =>
        makeFileMeta({ file_path: args.filePath as string, file_name: 'Note.md', file_text: '# Note' }),
      read_file: '# Note',
    });
    renderWithView(<><SyncModal ws={WS} isOpen handleClose={() => undefined} /><ViewProbe /></>);

    const url = await screen.findByPlaceholderText('https://github.com/me/notes.git');
    fireEvent.change(url, { target: { value: 'https://github.com/me/notes.git' } });
    fireEvent.change(screen.getByPlaceholderText(/personal access token/), { target: { value: 'tok' } });
    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('https://github.com/me/notes.git');
    expect(setup).toHaveBeenCalledWith({
      dir: WS,
      setup: { url: 'https://github.com/me/notes.git', username: '', token: 'tok', authorName: 'Me', authorEmail: '' },
    });
    expect(screen.getByText(/Token saved · 3 changed/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    await screen.findByText(/Changed on both sides/);
    expect(screen.getByText(/1 changed from the remote, changes sent/)).toBeInTheDocument();
    // the data merged has no copy, not listed
    expect(screen.queryByText('.mdsilo/books.json')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/0 changed since the last sync/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'writing/Note (conflict 2026-10-29 1530).md' }));
    await waitFor(() =>
      expect(JSON.parse(screen.getByTestId('view').textContent as string)).toMatchObject({
        view: 'md',
        params: { noteId: `${WS}/writing/Note (conflict 2026-10-29 1530).md` },
      })
    );
  });

  test('the token kept unless given, or forgotten', async () => {
    const setup = vi.fn((args: Record<string, unknown>) => ({ isRepo: true, hasToken: true, changes: 0, remoteUrl: (args.setup as { url: string }).url }));
    mockInvoke(invoke, {
      sync_info: { isRepo: true, remoteUrl: 'https://h.test/r.git', hasToken: true, changes: 0 },
      sync_setup: setup,
    });
    renderWithView(<SyncModal ws={WS} isOpen handleClose={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Change the remote' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(setup).toHaveBeenCalledTimes(1));
    expect((setup.mock.calls[0][0].setup as { token?: string }).token).toBeUndefined();

    fireEvent.click(await screen.findByRole('button', { name: 'Change the remote' }));
    fireEvent.click(screen.getByLabelText('Forget the saved token'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(setup).toHaveBeenCalledTimes(2));
    expect((setup.mock.calls[1][0].setup as { token?: string }).token).toBe('');
  });

  test('the author is optional; the automatic sync is set once a remote is', async () => {
    let info: SyncInfo = { isRepo: false, hasToken: false, changes: 0 };
    mockInvoke(invoke, {
      sync_info: () => info,
      sync_setup: () => (info = { isRepo: true, remoteUrl: 'https://h.test/r.git', hasToken: false, changes: 0 }),
    });
    renderWithView(<SyncModal ws={WS} isOpen handleClose={() => undefined} />);
    expect(await screen.findByText('optional')).toBeInTheDocument();
    expect(screen.queryByText('Automatic sync')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('https://github.com/me/notes.git'), { target: { value: 'https://h.test/r.git' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Automatic sync');
    fireEvent.change(screen.getByLabelText('Every'), { target: { value: '15' } });
    fireEvent.click(screen.getByLabelText('When the app closes'));
    expect(store.getState().syncSettings).toEqual({ interval: 15, onExit: true });
  });

  test('a failed sync shows the error', async () => {
    mockInvoke(invoke, {
      sync_info: { isRepo: true, remoteUrl: 'https://h.test/r.git', hasToken: false, changes: 1 },
      sync_run: () => Promise.reject('authentication failed (HTTP 401): a token is needed'),
    });
    renderWithView(<SyncModal ws={WS} isOpen handleClose={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sync now' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('a token is needed');
  });
});

describe('SyncButton', () => {
  test('not on the web, nor out of Tauri', () => {
    store.getState().setInitDir(WS);
    renderWithView(<SyncButton className="" iconClassName="" />);
    expect(screen.queryByRole('button', { name: 'Sync' })).not.toBeInTheDocument();
  });
});
