import { invoke } from '@tauri-apps/api/core';
import { store } from 'lib/store';
import { joinPath } from 'file/util';

/**
 * The workspace layout:
 *
 *   <workspace>/
 *     reading/    books, their annotations (Foo.epub.md), clips
 *     writing/    notes, assets, daily notes
 *     .mdsilo/    data: workspace.json, issues/, feeds.json, books.json
 *       local/    this device only, never synced: index.db, caches
 *
 * A folder without `.mdsilo/workspace.json` is a legacy workspace: notes and
 * issues.json at its root, as before. It keeps working, and can be migrated.
 */
export const READING_DIR = 'reading';
export const WRITING_DIR = 'writing';
export const DATA_DIR = '.mdsilo';
export const LOCAL_DIR = 'local';
/** the clipped feed articles, in reading/ (the root of legacy workspaces) */
export const CLIPS_DIR = 'clips';
export const WORKSPACE_FILE = 'workspace.json';
export const WORKSPACE_VERSION = 1;

export type Layout = 'workspace' | 'legacy';

export type WorkspaceMeta = { version: number; createdAt: string };

/** `.mdsilo/.gitignore`: the device local data stays out of sync */
export const DATA_GITIGNORE = `${LOCAL_DIR}/\n`;

export const dataDirOf = (ws: string) => joinPath(ws, DATA_DIR);
export const localDirOf = (ws: string) => joinPath(ws, DATA_DIR, LOCAL_DIR);

/** The layout of a workspace folder, by its marker file. */
export async function detectLayout(ws: string): Promise<Layout> {
  try {
    const marker = joinPath(ws, DATA_DIR, WORKSPACE_FILE);
    return (await invoke<boolean>('is_file', { path: marker })) ? 'workspace' : 'legacy';
  } catch {
    return 'legacy';
  }
}

/** Create the dirs and files of the layout, keeping the existing ones. */
export async function initLayout(ws: string): Promise<void> {
  for (const dir of [READING_DIR, WRITING_DIR, joinPath(DATA_DIR, LOCAL_DIR)]) {
    await invoke('create_dir_recursive', { dirPath: joinPath(ws, dir) });
  }
  const gitignore = joinPath(ws, DATA_DIR, '.gitignore');
  if (!(await invoke<boolean>('file_exist', { filePath: gitignore }))) {
    await invoke('write_file', { filePath: gitignore, text: DATA_GITIGNORE });
  }
  // the marker last: a layout half created is still legacy
  const marker = joinPath(ws, DATA_DIR, WORKSPACE_FILE);
  if (!(await invoke<boolean>('file_exist', { filePath: marker }))) {
    const meta: WorkspaceMeta = { version: WORKSPACE_VERSION, createdAt: new Date().toISOString() };
    await invoke('write_file', { filePath: marker, text: JSON.stringify(meta, null, 2) });
  }
}

type Roots = { initDir?: string; layout?: Layout };

const roots = (): Roots => store.getState();

/** Where the notes are: `writing/`, or the root of a legacy workspace. */
export function writingRoot(state: Roots = roots()): string | undefined {
  const { initDir, layout } = state;
  if (!initDir) return undefined;
  return layout === 'workspace' ? joinPath(initDir, WRITING_DIR) : initDir;
}

/** Where the books are; legacy workspaces have no reading root. */
export function readingRoot(state: Roots = roots()): string | undefined {
  const { initDir, layout } = state;
  return initDir && layout === 'workspace' ? joinPath(initDir, READING_DIR) : undefined;
}

/** The data dir, `.mdsilo/`; legacy workspaces keep data at the root. */
export function dataRoot(state: Roots = roots()): string | undefined {
  const { initDir, layout } = state;
  return initDir && layout === 'workspace' ? dataDirOf(initDir) : undefined;
}

/** The dir of the device local data, `.mdsilo/local/`. */
export function localRoot(state: Roots = roots()): string | undefined {
  const { initDir, layout } = state;
  return initDir && layout === 'workspace' ? localDirOf(initDir) : undefined;
}

/** Top level entries of a workspace, never moved into writing/ on migration. */
export const LAYOUT_ENTRIES = new Set([READING_DIR, WRITING_DIR, DATA_DIR]);

/**
 * The layout of a folder being opened. An empty folder becomes a workspace;
 * a folder with notes but no marker stays legacy until migrated.
 */
export async function resolveLayout(ws: string): Promise<Layout> {
  const layout = await detectLayout(ws);
  if (layout === 'workspace') return layout;
  try {
    const entries = await invoke<{ is_hidden: boolean }[]>('list_directory', { dir: ws });
    if (!entries || entries.some((e) => !e.is_hidden)) return 'legacy';
    await initLayout(ws);
    return 'workspace';
  } catch (e) {
    console.error('Failed to create the workspace layout', e);
    return 'legacy';
  }
}

/** The dir to create a note in from the current dir: writing/ at the root. */
export function newNoteDir(currentDir: string | undefined, state: Roots = roots()): string | undefined {
  const writing = writingRoot(state);
  if (!currentDir || currentDir === state.initDir) return writing ?? currentDir;
  return currentDir;
}
