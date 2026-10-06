import { afterEach, beforeEach, describe, expect, test, type Mock } from 'vitest';
import * as dialog from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { store } from 'lib/store';
import { enterTauri, leaveTauri, makeFileMeta, mockInvoke } from '../testUtils';
import * as open from './open';

const parentOf = (p: string) => p.substring(0, p.lastIndexOf('/')) || '/';
const baseOf = (p: string) => p.substring(p.lastIndexOf('/') + 1);
const joinPaths = ({ root, parts }: Record<string, unknown>) =>
  [root, ...(parts as string[])].join('/').replace(/\/+/g, '/');

describe('open (web)', () => {
  test('getRecentDirPath returns the latest recent dir', () => {
    expect(open.getRecentDirPath()).toBe('');
    store.getState().upsertRecentDir('/a');
    store.getState().upsertRecentDir('/b');
    expect(open.getRecentDirPath()).toBe('/b');
  });

  test('openDirDilog opens a directory picker at the recent dir', async () => {
    store.getState().upsertRecentDir('/recent');
    (dialog.open as Mock).mockResolvedValueOnce('/picked');
    await expect(open.openDirDilog()).resolves.toBe('/picked');
    expect(dialog.open).toHaveBeenCalledWith(
      expect.objectContaining({ directory: true, multiple: false, defaultPath: '/recent' })
    );
  });

  test('openFileDilog filters by extension', async () => {
    (dialog.open as Mock).mockResolvedValueOnce(['/a.md']);
    await expect(open.openFileDilog(['md'])).resolves.toEqual(['/a.md']);
    expect(dialog.open).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: false,
        multiple: true,
        filters: [{ name: 'file', extensions: ['md'] }],
      })
    );
  });

  test('saveDilog suggests a file name inside the recent dir', async () => {
    store.getState().upsertRecentDir('/recent');
    mockInvoke(invoke, { join_paths: joinPaths });
    (dialog.save as Mock).mockResolvedValueOnce('/recent/out');
    await expect(open.saveDilog('out')).resolves.toBe('/recent/out');
    expect(dialog.save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: '/recent/out' }));

    await open.saveDilog();
    expect(dialog.save).toHaveBeenLastCalledWith(expect.objectContaining({ defaultPath: '/recent' }));
  });

  test('loadDir triggers write_json once while loading', async () => {
    await open.loadDir('/notes');
    await open.loadDir('/notes');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('write_json', { dir: '/notes' });
    expect(store.getState().isLoading).toBe(true);
  });

  test('openUrl invokes open_url', async () => {
    (invoke as Mock).mockResolvedValueOnce(true);
    await expect(open.openUrl('https://mdsilo.com')).resolves.toBe(true);
    expect(invoke).toHaveBeenCalledWith('open_url', { url: 'https://mdsilo.com' });
  });

  test('openJSONFilePath ignores empty and missing paths', async () => {
    await expect(open.openJSONFilePath('')).resolves.toBeUndefined();
    mockInvoke(invoke, { file_exist: false });
    await expect(open.openJSONFilePath('/x.json')).resolves.toBeUndefined();
  });

  test('openFilePath returns undefined for missing files', async () => {
    mockInvoke(invoke, { file_exist: false });
    await expect(open.openFilePath('/missing.md', true)).resolves.toBeUndefined();
  });

  test('listDir and openDir stop when the dir does not exist', async () => {
    mockInvoke(invoke, { file_exist: false });
    await open.listDir('/missing');
    await open.openDir('/missing');
    expect(store.getState().noteTree).toEqual({});
  });
});

describe('open (tauri)', () => {
  let tOpen: typeof open;
  let tStore: typeof store;
  let tInvoke: Mock;

  const dirEntries = [
    makeFileMeta({ file_path: '/notes/sub', file_name: 'sub', is_dir: true, is_file: false }),
    makeFileMeta({ file_path: '/notes/a.md', file_name: 'a.md', file_text: 'A' }),
    makeFileMeta({ file_path: '/notes/pic.png', file_name: 'pic.png' }),
    makeFileMeta({ file_path: '/notes/mdsilo.json', file_name: 'mdsilo.json' }),
    makeFileMeta({ file_path: '/notes/.git', file_name: '.git', is_dir: true, is_file: false, is_hidden: true }),
  ];

  const metaByPath = Object.fromEntries(dirEntries.map((m) => [m.file_path, m]));

  beforeEach(async () => {
    enterTauri();
    tInvoke = (await import('@tauri-apps/api/core')).invoke as Mock;
    mockInvoke(tInvoke, {
      get_data: { status: false },
      file_exist: true,
      list_directory: dirEntries,
      read_directory: { files: dirEntries, number_of_files: dirEntries.length },
      get_file_meta: ({ filePath }: Record<string, unknown>) => metaByPath[filePath as string],
      get_parent_dir: ({ path }: Record<string, unknown>) => parentOf(path as string),
      get_basename: ({ filePath }: Record<string, unknown>) => [baseOf(filePath as string), false],
      join_paths: joinPaths,
    });
    tOpen = await import('./open');
    tStore = (await import('lib/store')).store;
  });

  afterEach(() => {
    leaveTauri();
  });

  test.each(['listDir', 'openDir'] as const)('%s upserts notes and tree, skipping hidden and json', async (fn) => {
    await tOpen[fn]('/notes', false);
    const { notes, noteTree } = tStore.getState();
    expect(Object.keys(notes).sort()).toEqual(['/notes/a.md', '/notes/sub']);
    expect(notes['/notes/sub'].is_dir).toBe(true);
    expect(noteTree['/notes'].map((i) => i.id)).toEqual(['/notes/sub', '/notes/a.md', '/notes/pic.png']);
  });

  test.each(['listDir', 'openDir'] as const)('%s checks the dir once and writes no storage', async (fn) => {
    tInvoke.mockClear();
    await tOpen[fn]('/notes', false);
    const cmds = tInvoke.mock.calls.map((c) => c[0]);
    // no existence check per listed sub dir
    expect(cmds.filter((c) => c === 'file_exist')).toHaveLength(1);
    // nothing saved yet (first launch): default settings written once at most
    expect(cmds.filter((c) => c === 'set_data').length).toBeLessThanOrEqual(1);
    // loading notes does not touch persisted settings
    tInvoke.mockClear();
    await tOpen[fn]('/notes', false);
    expect(tInvoke.mock.calls.map((c) => c[0])).not.toContain('set_data');
  });

  test('openDir keeps file content, listDir does not', async () => {
    await tOpen.listDir('/notes', false);
    expect(tStore.getState().notes['/notes/a.md'].content).toBe('');
    await tOpen.openDir('/notes', false);
    expect(tStore.getState().notes['/notes/a.md'].content).toBe('A');
  });

  test('listDir attaches a listener by default', async () => {
    await tOpen.listDir('/notes');
    expect(tInvoke).toHaveBeenCalledWith('listen_dir', { dir: '/notes' });
  });

  test('openFilePaths upserts files and dirs under their parent', async () => {
    const opened = await tOpen.openFilePaths(['/notes/a.md', '/notes/sub', '/notes/pic.png', '/notes/mdsilo.json']);
    expect(opened).toBe(true);
    const { notes, noteTree } = tStore.getState();
    expect(Object.keys(notes).sort()).toEqual(['/notes/a.md', '/notes/sub']);
    expect(noteTree['/notes'].map((i) => i.id)).toEqual(['/notes/a.md', '/notes/pic.png', '/notes/sub']);
  });

  test('openFilePaths returns false when nothing was opened', async () => {
    await expect(tOpen.openFilePaths(['/notes/pic.png'])).resolves.toBe(false);
  });

  test('openFilePath can set the current note', async () => {
    const note = await tOpen.openFilePath('/notes/a.md', true);
    expect(note?.title).toBe('a');
    expect(tStore.getState().currentNote).toEqual({ '/notes/a.md': note });
    expect(tStore.getState().noteTree['/notes'][0].id).toBe('/notes/a.md');
  });

  test('openFilePath builds tree entries up to the init dir', async () => {
    metaByPath['/root/x/y/deep.md'] = makeFileMeta({ file_path: '/root/x/y/deep.md', file_name: 'deep.md' });
    tStore.getState().setInitDir('/root');
    await tOpen.openFilePath('/root/x/y/deep.md', false);
    await new Promise((r) => setTimeout(r, 0));
    const tree = tStore.getState().noteTree;
    expect(tree['/root/x/y'].map((i) => i.id)).toEqual(['/root/x/y/deep.md']);
    expect(tree['/root/x'].map((i) => i.id)).toEqual(['/root/x/y']);
    expect(tree['/root'].map((i) => i.id)).toEqual(['/root/x']);
    expect(tree['/']).toBeUndefined();
  });

  test('openJSONFilePath reads and parses the file', async () => {
    mockInvoke(tInvoke, { file_exist: true, read_file: '{"isloaded":true,"notesobj":{},"notetree":{}}' });
    await expect(tOpen.openJSONFilePath('/notes/mdsilo.json')).resolves.toEqual({
      isloaded: true,
      notesobj: {},
      notetree: {},
    });
  });
});
