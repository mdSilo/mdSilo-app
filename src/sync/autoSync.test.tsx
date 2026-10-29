import { afterEach, beforeEach, describe, expect, test, vi, type Mock } from 'vitest';
import { renderHook } from '@testing-library/react';
import { enterTauri, leaveTauri, mockInvoke } from '@/testUtils';

const WS = '/ws';
const SET_UP = { isRepo: true, remoteUrl: 'https://h.test/r.git', hasToken: true, changes: 0 };
const REPORT = { committed: false, pulled: [], pushed: false, conflicts: [] };

// as in the app: modules imported again in Tauri (isSyncAvailable)
async function load() {
  enterTauri();
  const invoke = (await import('@tauri-apps/api/core')).invoke as Mock;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const { store } = await import('@/state/store');
  const autoSync = await import('./autoSync');
  const { useSyncState } = await import('./syncWorkspace');
  return { invoke, win: getCurrentWindow() as unknown as Record<string, Mock>, store, useSyncState, ...autoSync };
}

const runs = (invoke: Mock) => invoke.mock.calls.filter(([cmd]) => cmd === 'sync_run').length;

describe('automatic sync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    leaveTauri();
  });

  test('every few minutes, where sync is set up', async () => {
    const { invoke, store, useAutoSync } = await load();
    let info: object = { isRepo: false, hasToken: false, changes: 0 };
    mockInvoke(invoke, { sync_info: () => info, sync_run: REPORT });
    store.getState().setInitDir(WS);
    store.getState().setSyncSettings({ interval: 5, onExit: false });
    const { unmount } = renderHook(() => useAutoSync());

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(runs(invoke)).toBe(0); // not set up
    info = SET_UP;
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(runs(invoke)).toBe(1);
    expect(invoke).toHaveBeenCalledWith('sync_run', { dir: WS });

    store.getState().setSyncSettings({ interval: 0, onExit: false });
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(runs(invoke)).toBe(1);
    unmount();
  });

  test('on exit: the window waits for the sync', async () => {
    const { invoke, win, store, useAutoSync } = await load();
    mockInvoke(invoke, { sync_info: SET_UP, sync_run: REPORT });
    let onClose: (() => Promise<void>) | undefined;
    const off = vi.fn();
    win.onCloseRequested = vi.fn(async (handler: () => Promise<void>) => {
      onClose = handler;
      return off;
    });
    store.getState().setInitDir(WS);
    store.getState().setSyncSettings({ interval: 0, onExit: true });
    const { unmount } = renderHook(() => useAutoSync());
    await vi.waitFor(() => expect(onClose).toBeDefined());

    await onClose!();
    expect(runs(invoke)).toBe(1);

    store.getState().setSyncSettings({ interval: 0, onExit: false });
    await vi.waitFor(() => expect(off).toHaveBeenCalled());
    unmount();
  });

  test('on exit: the sync running first, then the last edits', async () => {
    const { invoke, useSyncState, syncBeforeExit } = await load();
    let finish: (() => void) | undefined;
    mockInvoke(invoke, {
      sync_info: SET_UP,
      sync_run: () => (runs(invoke) === 1 ? new Promise((resolve) => (finish = () => resolve(REPORT))) : REPORT),
    });
    const { syncWorkspace } = await import('./syncWorkspace');
    const first = syncWorkspace(WS);
    expect(syncWorkspace(WS)).toBe(first); // not started twice
    await vi.waitFor(() => expect(finish).toBeDefined());

    let done = false;
    const exit = syncBeforeExit(WS).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(10);
    expect(done).toBe(false);
    finish!();
    await exit;
    expect(runs(invoke)).toBe(2);
    expect(useSyncState.getState().syncing).toBe(false);
  });

  test('on exit: closes anyway after the timeout', async () => {
    const { invoke, syncBeforeExit } = await load();
    mockInvoke(invoke, { sync_info: SET_UP, sync_run: () => new Promise(() => undefined) });
    let done = false;
    const exit = syncBeforeExit(WS, 1000).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await exit;
    expect(done).toBe(true);
  });
});
