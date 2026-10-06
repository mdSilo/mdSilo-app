import { afterEach, beforeEach, describe, expect, test, type Mock } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { NoteMap } from 'lib/noteMap';
import { store } from 'lib/store';
import { enterTauri, leaveTauri, makeNote, mockInvoke } from '../testUtils';
import * as util from './util';

describe('path helpers', () => {
  test('normalizeSlash converts backslashes and trims trailing slashes', () => {
    expect(util.normalizeSlash('C:/')).toBe('C:');
    expect(util.normalizeSlash('C:\\Files\\mdsilo\\app.msi')).toBe('C:/Files/mdsilo/app.msi');
    expect(util.normalizeSlash('/home/user/')).toBe('/home/user');
    expect(util.normalizeSlash('/home/user///')).toBe('/home/user');
    expect(util.normalizeSlash('/')).toBe('/');
    expect(util.normalizeSlash('')).toBe('/');
  });

  test('joinPath joins parts with single slashes', () => {
    expect(util.joinPath('/', 'md', '/silo/')).toBe('/md/silo');
    expect(util.joinPath('/home/user/', 'notes', 'a.md')).toBe('/home/user/notes/a.md');
    expect(util.joinPath('C:\\Users', 'me\\', 'a.md')).toBe('C:/Users/me/a.md');
    expect(util.joinPath('a', '', 'b')).toBe('a/b');
  });

  test('joinPath returns "." for nothing to join', () => {
    expect(util.joinPath()).toBe('.');
    expect(util.joinPath('')).toBe('.');
  });

  test('trimSlashAll removes leading and trailing slashes of both kinds', () => {
    expect(util.trimSlashAll('/\\md/silo\\')).toBe('md/silo');
    expect(util.trimSlashAll('md')).toBe('md');
    expect(util.trimSlashAll('///')).toBe('');
  });
});

describe('web mode', () => {
  test('isTauri is false in a plain browser', () => {
    expect(util.isTauri).toBe(false);
  });

  test('setWindowTitle is a no-op outside Tauri', () => {
    util.setWindowTitle('hello');
    expect(getCurrentWindow).not.toHaveBeenCalled();
  });

  test('buildNotesJson serializes notes, tree and activities', () => {
    const note = makeNote({ id: '/a.md', title: 'a' });
    store.getState().setNotes(NoteMap.from({ [note.id]: note }));
    store.getState().setIsLoaded(true);
    store.getState().upsertTree('/', [note]);
    store.getState().setActivities({ '2022-1-1': { createNum: 1, updateNum: 0 } } as never);

    const data = JSON.parse(util.buildNotesJson());
    expect(data.isloaded).toBe(true);
    expect(data.notesobj).toEqual({ '/a.md': note });
    expect(data.notetree['/'][0]).toMatchObject({ id: '/a.md', title: 'a', is_dir: false });
    expect(data.activities).toEqual({ '2022-1-1': { createNum: 1, updateNum: 0 } });
  });
});

describe('backend commands', () => {
  test.each([
    ['joinPaths', () => util.joinPaths('/root', ['a', 'b']), 'join_paths', { root: '/root', parts: ['a', 'b'] }],
    ['createDirRecursive', () => util.createDirRecursive('/a/b'), 'create_dir_recursive', { dirPath: '/a/b' }],
    ['deleteFiles', () => util.deleteFiles(['/a', '/b']), 'delete_files', { paths: ['/a', '/b'] }],
    ['renameFile', () => util.renameFile('/a', '/b'), 'rename_file', { fromPath: '/a', toPath: '/b' }],
    ['getDirPath', () => util.getDirPath('/a/b.md'), 'get_dirpath', { path: '/a/b.md' }],
    ['getParentDir', () => util.getParentDir('/a/b'), 'get_parent_dir', { path: '/a/b' }],
    ['getBaseName', () => util.getBaseName('/a/b.md'), 'get_basename', { filePath: '/a/b.md' }],
  ])('%s invokes %s', async (_name, call, cmd, args) => {
    (invoke as Mock).mockResolvedValueOnce('result');
    await expect(call()).resolves.toBe('result');
    expect(invoke).toHaveBeenCalledWith(cmd, args);
  });
});

describe('tauri mode', () => {
  let tauriUtil: typeof util;
  let tauriStore: typeof store;

  beforeEach(async () => {
    enterTauri();
    mockInvoke((await import('@tauri-apps/api/core')).invoke, { get_data: { status: false } });
    tauriUtil = await import('./util');
    tauriStore = (await import('lib/store')).store;
  });

  afterEach(() => {
    leaveTauri();
  });

  test('isTauri is true when window.__TAURI__ is present', () => {
    expect(tauriUtil.isTauri).toBe(true);
  });

  test('setWindowTitle sets the native window title', async () => {
    const { getCurrentWindow: getWin } = await import('@tauri-apps/api/window');
    tauriUtil.setWindowTitle('Note');
    expect(getWin().setTitle).toHaveBeenCalledWith('Note ');
  });

  test('setWindowTitle shows the loading marker', async () => {
    const { getCurrentWindow: getWin } = await import('@tauri-apps/api/window');
    tauriUtil.setWindowTitle('Note', true);
    expect(getWin().setTitle).toHaveBeenLastCalledWith('Note  --- Loading ---');

    tauriStore.getState().setIsLoading(true);
    tauriUtil.setWindowTitle('Other');
    expect(getWin().setTitle).toHaveBeenLastCalledWith('Other  --- Loading ---');
  });

  test('setWindowTitle swallows backend errors', async () => {
    const { getCurrentWindow: getWin } = await import('@tauri-apps/api/window');
    (getWin().setTitle as Mock).mockRejectedValueOnce(new Error('boom'));
    expect(() => tauriUtil.setWindowTitle('x')).not.toThrow();
  });
});
