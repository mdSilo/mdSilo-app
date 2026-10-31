import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { store } from '@/state/store';
import { useIssueStore } from '@/issue/issueStore';
import { flushSave } from '@/workspace/pendingSaves';
import { openFilePaths } from '@/workspace/open';
import { joinPath } from '@/workspace/util';
import { DATA_DIR } from '@/workspace/layout';
import { reloadOpenNote } from '@/workspace/noteReloads';
import { syncRun, type SyncReport } from './api';

type SyncState = {
  syncing: boolean;
  /** the workspace of the last sync */
  ws?: string;
  report?: SyncReport;
  error?: string;
  /** ms since the epoch */
  at?: number;
};

export const useSyncState = create<SyncState>(() => ({ syncing: false }));

let running: Promise<SyncReport | undefined> | undefined;

/** The sync running, if any. */
export const runningSync = () => running;

/**
 * Sync the workspace: the edits saved first, what came in loaded after. A
 * sync already running is not started again: its result is returned.
 */
export function syncWorkspace(ws: string): Promise<SyncReport | undefined> {
  running ??= runSync(ws).finally(() => (running = undefined));
  return running;
}

async function runSync(ws: string): Promise<SyncReport | undefined> {
  useSyncState.setState({ syncing: true, error: undefined });
  try {
    await flushSave();
    await useIssueStore.getState().flush();
    const report = await syncRun(ws);
    useSyncState.setState({ ws, report, at: Date.now() });
    await applyPulled(ws, report.pulled);
    return report;
  } catch (e) {
    useSyncState.setState({ ws, error: String(e), at: Date.now() });
  } finally {
    useSyncState.setState({ syncing: false });
  }
}

/**
 * Load what the remote changed. The watcher sees the notes too, but not the
 * note open (kept as edited) nor the data in `.mdsilo/`.
 */
export async function applyPulled(ws: string, pulled: string[]) {
  if (pulled.length === 0) return;
  const data = `${DATA_DIR}/`;
  if (pulled.some((p) => p.startsWith(`${data}issues/`) || p === 'issues.json')) {
    await useIssueStore.getState().load(ws, true);
  }
  if (pulled.includes(`${data}books.json`)) {
    const { readLibrary } = await import('@/reader/library/library');
    await readLibrary(ws);
  }
  if (pulled.includes(`${data}feeds.json`)) {
    const { syncFeeds } = await import('@/feed/feedSync');
    await syncFeeds();
  }

  const notes = pulled.filter((p) => p.toLowerCase().endsWith('.md') && !p.startsWith('.')).map((p) => joinPath(ws, p));
  const present: string[] = [];
  for (const path of notes) {
    if (await invoke<boolean>('file_exist', { filePath: path })) {
      present.push(path);
    } else {
      store.getState().deleteNote(path);
    }
  }
  if (present.length > 0) await openFilePaths(present);
  if (notes.includes(store.getState().currentNoteId)) {
    reloadOpenNote();
  }
}
