import { useEffect } from 'react';
import { useStore } from '@/state/store';
import { isSyncAvailable, syncInfo } from './api';
import { runningSync, syncWorkspace } from './syncWorkspace';

/** how long closing the app waits for the sync */
export const EXIT_SYNC_TIMEOUT_MS = 30_000;

/** Sync the workspace if sync is set up for it, quietly nothing otherwise. */
export async function syncIfSetUp(ws: string) {
  try {
    const info = await syncInfo(ws);
    if (!info.isRepo || !info.remoteUrl) return;
  } catch {
    return;
  }
  await syncWorkspace(ws);
}

/**
 * Before the app closes: the sync running finished, then one more for the
 * last edits; the app closes anyway after `timeout`.
 */
export async function syncBeforeExit(ws: string, timeout = EXIT_SYNC_TIMEOUT_MS) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<void>((resolve) => (timer = setTimeout(resolve, timeout)));
  const sync = (async () => {
    await runningSync();
    await syncIfSetUp(ws);
  })();
  await Promise.race([sync, late]);
  clearTimeout(timer);
}

/**
 * The automatic sync of the open workspace, as the settings say: every
 * `interval` minutes, and when the app closes (by the window or the tray,
 * see src-tauri/src/tray.rs).
 */
export function useAutoSync() {
  const ws = useStore((state) => state.initDir);
  const { interval, onExit } = useStore((state) => state.syncSettings);

  useEffect(() => {
    if (!isSyncAvailable || !ws || interval <= 0) return;
    const timer = setInterval(() => void syncIfSetUp(ws), interval * 60_000);
    return () => clearInterval(timer);
  }, [ws, interval]);

  useEffect(() => {
    if (!isSyncAvailable || !ws || !onExit) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().onCloseRequested(() => syncBeforeExit(ws)))
      .then((off) => {
        if (cancelled) off();
        else unlisten = off;
      })
      .catch((e) => console.error('Failed to sync on exit:', e));
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [ws, onExit]);
}
