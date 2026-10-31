import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri, isWeb } from '@/workspace/util';
import { store, type Store } from './store';

/** more windows than the main one: books in their own windows, on desktop */
export const hasWindows = isTauri && !isWeb;

const SETTINGS_EVENT = 'mdsilo://settings';
const DATA_EVENT = 'mdsilo://data';

/** the settings a book window changes, given to the other windows */
const SHARED_KEYS = ['readerSettings', 'readerSidebarWidth', 'librarySettings', 'lastBooks'] as const;
type Shared = Partial<Pick<Store, typeof SHARED_KEYS[number]>>;

/** the files of a workspace written by a window: books.json and reading states, issues */
export type DataKind = 'library' | 'issues';

type SettingsPayload = { from: string; values: Shared };
type DataPayload = { from: string; kind: DataKind; dir: string };

const label = () => getCurrentWindow().label;

// the settings of another window being set: not to give them back
let applying = false;

/**
 * Give the shared settings changed here to the other windows, and take theirs.
 * @returns stop
 */
export function shareSettings(): () => void {
  if (!hasWindows) return () => undefined;
  const from = label();
  const unsubscribe = store.subscribe((state, prev) => {
    if (applying) return;
    const values: Shared = {};
    for (const key of SHARED_KEYS) {
      if (state[key] !== prev[key]) Object.assign(values, { [key]: state[key] });
    }
    if (Object.keys(values).length === 0) return;
    void emit<SettingsPayload>(SETTINGS_EVENT, { from, values })
      .catch((e) => console.error('Failed to share the settings:', e));
  });
  const unlisten = listen<SettingsPayload>(SETTINGS_EVENT, ({ payload }) => {
    if (payload.from === from) return;
    applying = true;
    try {
      store.setState(payload.values);
    } finally {
      applying = false;
    }
  });
  return () => {
    unsubscribe();
    void unlisten.then((off) => off());
  };
}

/** Tell the other windows that files of the workspace `dir` were written here. */
export function announce(kind: DataKind, dir: string) {
  if (!hasWindows) return;
  void emit<DataPayload>(DATA_EVENT, { from: label(), kind, dir })
    .catch((e) => console.error('Failed to announce a change:', e));
}

/**
 * Run `fn` when another window wrote files of a workspace.
 * @returns stop
 */
export function onAnnounce(kind: DataKind, fn: (dir: string) => void): () => void {
  if (!hasWindows) return () => undefined;
  const from = label();
  const unlisten = listen<DataPayload>(DATA_EVENT, ({ payload }) => {
    if (payload.from !== from && payload.kind === kind) fn(payload.dir);
  });
  return () => void unlisten.then((off) => off());
}
