import { afterEach, beforeEach, describe, expect, test, type Mock } from 'vitest';
import { enterTauri, leaveTauri, makeFileMeta, makeNote, mockInvoke } from '../../testUtils';

const joinPaths = ({ root, parts }: Record<string, unknown>) =>
  [root, ...(parts as string[])].join('/').replace(/\/+/g, '/');

describe('useOpen (tauri)', () => {
  let useOpen: typeof import('./useOpen');
  let store: typeof import('lib/store').store;
  let invoke: Mock;
  let dialog: { open: Mock; save: Mock };

  const files = [
    makeFileMeta({ file_path: '/picked/a.md', file_name: 'a.md' }),
    makeFileMeta({ file_path: '/picked/b.md', file_name: 'b.md' }),
  ];
  const metaByPath = Object.fromEntries(files.map((f) => [f.file_path, f]));

  beforeEach(async () => {
    enterTauri();
    invoke = (await import('@tauri-apps/api/core')).invoke as Mock;
    dialog = (await import('@tauri-apps/plugin-dialog')) as never;
    mockInvoke(invoke, {
      get_data: { status: false },
      file_exist: true,
      get_dirpath: ({ path }: Record<string, unknown>) =>
        (path as string).endsWith('.md') || (path as string).endsWith('.json')
          ? (path as string).substring(0, (path as string).lastIndexOf('/'))
          : path,
      get_parent_dir: ({ path }: Record<string, unknown>) =>
        (path as string).substring(0, (path as string).lastIndexOf('/')) || '/',
      get_basename: ({ filePath }: Record<string, unknown>) => [
        (filePath as string).substring((filePath as string).lastIndexOf('/') + 1),
        true,
      ],
      get_file_meta: ({ filePath }: Record<string, unknown>) => metaByPath[filePath as string],
      list_directory: files,
      read_directory: { files, number_of_files: files.length },
      join_paths: joinPaths,
    });
    useOpen = await import('./useOpen');
    store = (await import('lib/store')).store;
  });

  afterEach(() => {
    leaveTauri();
  });

  const dirty = () => {
    const stale = makeNote({ id: '/old/x.md' });
    store.getState().setNotes({ [stale.id]: stale });
    store.getState().setCurrentNoteId(stale.id);
    store.getState().setIsLoaded(true);
  };

  test('onOpenFile opens picked files into a clean store', async () => {
    dirty();
    dialog.open.mockResolvedValueOnce(['/picked/a.md', '/picked/b.md']);
    await useOpen.onOpenFile();
    const s = store.getState();
    expect(Object.keys(s.notes).sort()).toEqual(['/picked/a.md', '/picked/b.md']);
    expect(s.currentDir).toBe('/picked');
    expect(s.recentDir).toEqual(['/picked']);
    expect(s.currentNoteId).toBe('');
    expect(s.isLoaded).toBe(false);
  });

  test('onOpenFile accepts a single path and ignores cancel', async () => {
    dialog.open.mockResolvedValueOnce('/picked/a.md');
    await useOpen.onOpenFile();
    expect(Object.keys(store.getState().notes)).toEqual(['/picked/a.md']);

    dialog.open.mockResolvedValueOnce(null);
    await useOpen.onOpenFile();
    expect(Object.keys(store.getState().notes)).toEqual(['/picked/a.md']);
  });

  test('onOpenDir opens all files of the folder', async () => {
    dirty();
    dialog.open.mockResolvedValueOnce('/picked');
    await useOpen.onOpenDir();
    const s = store.getState();
    expect(s.initDir).toBe('/picked');
    expect(s.currentDir).toBe('/picked');
    expect(Object.keys(s.notes).sort()).toEqual(['/picked/a.md', '/picked/b.md']);
    expect(invoke).toHaveBeenCalledWith('read_directory', { dir: '/picked' });
  });

  test('onListDir lists the folder and triggers a background load', async () => {
    dialog.open.mockResolvedValueOnce('/picked');
    await useOpen.onListDir();
    const s = store.getState();
    expect(s.initDir).toBe('/picked');
    expect(s.noteTree['/picked']).toHaveLength(2);
    expect(invoke).toHaveBeenCalledWith('list_directory', { dir: '/picked' });
    expect(invoke).toHaveBeenCalledWith('write_json', { dir: '/picked' });
    expect(s.isLoading).toBe(true);
  });

  test('onOpenDir and onListDir ignore cancel', async () => {
    dialog.open.mockResolvedValue(null);
    await useOpen.onOpenDir();
    await useOpen.onListDir();
    expect(store.getState().initDir).toBeUndefined();
  });

  test('listDirPath resets the tree unless cached', async () => {
    store.getState().upsertTree('/elsewhere', [makeNote({ id: '/elsewhere/z.md' })]);
    await useOpen.listDirPath('/picked');
    expect(Object.keys(store.getState().noteTree)).toEqual(['/picked']);
    expect(store.getState().currentDir).toBe('/picked');

    invoke.mockClear();
    await useOpen.listDirPath('/picked', false);
    expect(invoke).not.toHaveBeenCalledWith('list_directory', expect.anything());

    await useOpen.listDirPath('/other', false);
    expect(invoke).toHaveBeenCalledWith('list_directory', { dir: '/other' });
  });

  test('openJsonFile writes notes to a sibling folder and opens it', async () => {
    const note = makeNote({ id: 'x', title: 'hello', content: 'world' });
    mockInvoke(invoke, {
      file_exist: true,
      read_file: JSON.stringify({ isloaded: true, notesobj: { x: note }, notetree: {} }),
      get_dirpath: '/backup',
      get_basename: ['data.json', true],
      join_paths: joinPaths,
      list_directory: [],
    });
    dialog.open.mockResolvedValueOnce('/backup/data.json');
    await useOpen.openJsonFile();
    expect(invoke).toHaveBeenCalledWith('write_file', { filePath: '/backup/data/hello.md', text: 'world' });
    expect(store.getState().initDir).toBe('/backup/data');
  });

  test('onSave writes everything to the chosen dir', async () => {
    const note = makeNote({ id: '/n/a.md', title: 'a', content: 'A' });
    store.getState().setNotes({ [note.id]: note });
    dialog.save.mockResolvedValueOnce('C:\\out\\');
    await useOpen.onSave();
    expect(invoke).toHaveBeenCalledWith('write_file', { filePath: 'C:/out/a.md', text: 'A' });
    expect(store.getState().currentDir).toBe('C:/out');
  });

  test('onSave does nothing on cancel', async () => {
    dialog.save.mockResolvedValueOnce(null);
    await useOpen.onSave();
    expect(invoke).not.toHaveBeenCalledWith('write_file', expect.anything());
  });

  describe('openWebWorkspace', () => {
    const withDirs = (dirs: string[]) => mockInvoke(invoke, {
      get_data: { status: false },
      file_exist: true,
      is_dir: ({ path }: Record<string, unknown>) => dirs.includes(path as string),
      create_mdsilo_dir: '/mdSilo',
      get_dirpath: ({ path }: Record<string, unknown>) => path,
      list_directory: [],
      join_paths: joinPaths,
    });

    test('opens the default workspace on first visit', async () => {
      withDirs(['/mdSilo']);
      expect(await useOpen.openWebWorkspace()).toBe('/mdSilo');
      expect(invoke).toHaveBeenCalledWith('create_mdsilo_dir');
      expect(store.getState().initDir).toBe('/mdSilo');
      expect(store.getState().currentDir).toBe('/mdSilo');
    });

    test('reopens the previous folder, else the pinned one', async () => {
      withDirs(['/mdSilo', '/work', '/pinned']);
      store.getState().setRecentDir(['/old', '/work']);
      store.getState().setPinnedDir('/pinned');
      expect(await useOpen.openWebWorkspace()).toBe('/work');

      store.getState().setInitDir(undefined);
      store.getState().setRecentDir(['/gone']);
      expect(await useOpen.openWebWorkspace()).toBe('/pinned');

      store.getState().setInitDir(undefined);
      store.getState().setIsOpenPreOn(false);
      store.getState().setRecentDir(['/work']);
      store.getState().setPinnedDir('');
      expect(await useOpen.openWebWorkspace()).toBe('/mdSilo');
    });

    test('does nothing if a folder is open', async () => {
      withDirs(['/mdSilo']);
      store.getState().setInitDir('/opened');
      expect(await useOpen.openWebWorkspace()).toBeUndefined();
      expect(invoke).not.toHaveBeenCalledWith('create_mdsilo_dir', expect.anything());
    });
  });
});
