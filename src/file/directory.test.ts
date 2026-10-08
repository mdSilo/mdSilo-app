import { afterEach, beforeEach, describe, expect, test, vi, type Mock } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { NoteMap } from 'lib/noteMap';
import { enterTauri, leaveTauri, makeFileMeta, makeNote, mockInvoke } from '../testUtils';
import DirectoryAPI from './directory';

describe('DirectoryAPI (web)', () => {
  test('normalizes the dir path', () => {
    expect(new DirectoryAPI('C:\\notes\\').dirPath).toBe('C:/notes');
    const sub = new DirectoryAPI('sub', '/notes/');
    expect(sub.dirPath).toBe('/notes/sub');
    expect(sub.parentDir).toBe('/notes');
  });

  test('exists invokes file_exist', async () => {
    (invoke as Mock).mockResolvedValueOnce(true);
    await expect(new DirectoryAPI('/notes').exists()).resolves.toBe(true);
    expect(invoke).toHaveBeenCalledWith('file_exist', { filePath: '/notes' });
  });

  test('listen does nothing outside Tauri', async () => {
    await new DirectoryAPI('/notes').listen(vi.fn());
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('DirectoryAPI (tauri)', () => {
  let Dir: typeof DirectoryAPI;
  let tauriInvoke: Mock;
  let store: typeof import('lib/store').store;
  let win: { listen: Mock; emit: Mock };

  beforeEach(async () => {
    enterTauri();
    tauriInvoke = (await import('@tauri-apps/api/core')).invoke as Mock;
    mockInvoke(tauriInvoke, { get_data: { status: false } });
    Dir = (await import('./directory')).default;
    store = (await import('lib/store')).store;
    win = (await import('@tauri-apps/api/window')).getCurrentWindow() as never;
  });

  afterEach(() => {
    leaveTauri();
  });

  test('listDirectory returns and caches files', async () => {
    const files = [makeFileMeta()];
    mockInvoke(tauriInvoke, { list_directory: files });
    const dir = new Dir('/notes');
    await expect(dir.listDirectory()).resolves.toBe(files);
    expect(dir.files).toBe(files);
    expect(tauriInvoke).toHaveBeenCalledWith('list_directory', { dir: '/notes' });
  });

  test('getFiles returns and caches files with content', async () => {
    const data = { files: [makeFileMeta()], number_of_files: 1 };
    mockInvoke(tauriInvoke, { read_directory: data });
    const dir = new Dir('/notes');
    await expect(dir.getFiles()).resolves.toBe(data);
    expect(dir.files).toBe(data.files);
  });

  test('isDir invokes is_dir', async () => {
    mockInvoke(tauriInvoke, { is_dir: true });
    await expect(new Dir('/notes').isDir()).resolves.toBe(true);
    expect(tauriInvoke).toHaveBeenCalledWith('is_dir', { path: '/notes' });
  });

  describe('listen', () => {
    type Handler = (e: { payload: { paths: string[]; event: string } }) => Promise<void>;

    async function startListening(callback = vi.fn()) {
      await new Dir('/notes').listen(callback);
      expect(tauriInvoke).toHaveBeenCalledWith('listen_dir', { dir: '/notes' });
      expect(win.listen).toHaveBeenCalledWith('changes', expect.any(Function));
      const handler = win.listen.mock.calls[0][1] as Handler;
      return { callback, emit: (event: string, paths: string[]) => handler({ payload: { event, paths } }) };
    }

    test('write reloads changed files except the current note', async () => {
      store.getState().setCurrentNoteId('/notes/current.md');
      const { callback, emit } = await startListening();
      await emit('write', ['/notes/current.md', '/notes/other.md']);
      expect(tauriInvoke).toHaveBeenCalledWith('file_exist', { filePath: '/notes/other.md' });
      expect(tauriInvoke).not.toHaveBeenCalledWith('file_exist', { filePath: '/notes/current.md' });
      expect(callback).toHaveBeenCalledTimes(1);
    });

    test('write of only the current note opens nothing', async () => {
      store.getState().setCurrentNoteId('/notes/current.md');
      const { emit } = await startListening();
      await emit('close_write', ['/notes/current.md']);
      expect(tauriInvoke).not.toHaveBeenCalledWith('file_exist', expect.anything());
    });

    test('remove deletes notes from the store', async () => {
      const note = makeNote({ id: '/notes/a.md' });
      store.getState().setNotes(NoteMap.from({ [note.id]: note }));
      const { emit } = await startListening();
      await emit('remove', ['/notes/a.md']);
      expect(store.getState().notes.toRecord()).toEqual({});
    });

    test('renameFrom deletes the note in store and clears the current note', async () => {
      const note = makeNote({ id: '/notes/a.md', title: 'a' });
      store.getState().setNotes(NoteMap.from({ [note.id]: note }));
      store.getState().setCurrentNoteId('/notes/a.md');
      mockInvoke(tauriInvoke, { file_exist: false });
      const { emit } = await startListening();
      await emit('renameFrom', ['/notes/a.md']);
      expect(store.getState().notes.toRecord()).toEqual({});
      expect(store.getState().currentNoteId).toBe('');
      // the file is moved away already: never delete anything on disk
      expect(tauriInvoke).not.toHaveBeenCalledWith('delete_files', expect.anything());
      expect(tauriInvoke).not.toHaveBeenCalledWith('write_file', expect.anything());
    });

    test('renameFrom of a dir deletes its notes and clears the current note', async () => {
      const dir = makeNote({ id: '/notes/sub', is_dir: true });
      const note = makeNote({ id: '/notes/sub/a.md', title: 'a' });
      store.getState().setNotes(NoteMap.from({ [dir.id]: dir, [note.id]: note }));
      store.getState().setCurrentNoteId('/notes/sub/a.md');
      mockInvoke(tauriInvoke, { file_exist: false });
      const { emit } = await startListening();
      await emit('renameFrom', ['/notes/sub']);
      expect(store.getState().notes.toRecord()).toEqual({});
      expect(store.getState().currentNoteId).toBe('');
    });

    test.each(['renameFrom', 'remove'])(
      '%s keeps a file written again at the path, e.g. saved by vim',
      async (event) => {
        const note = makeNote({ id: '/notes/a.md', title: 'a' });
        store.getState().setNotes(NoteMap.from({ [note.id]: note }));
        store.getState().setCurrentNoteId('/notes/a.md');
        mockInvoke(tauriInvoke, {
          file_exist: true,
          get_file_meta: makeFileMeta({ file_path: '/notes/a.md', file_name: 'a.md' }),
          get_parent_dir: '/notes',
        });
        const { emit } = await startListening();
        await emit(event, ['/notes/a.md']);
        expect(store.getState().notes.get('/notes/a.md')).toBeTruthy();
        expect(store.getState().currentNoteId).toBe('/notes/a.md');
        expect(tauriInvoke).not.toHaveBeenCalledWith('delete_files', expect.anything());
      }
    );

    test('renameTo and create open the new paths', async () => {
      const { emit } = await startListening();
      await emit('renameTo', ['/notes/b.md']);
      await emit('create', ['/notes/c.md']);
      expect(tauriInvoke).toHaveBeenCalledWith('file_exist', { filePath: '/notes/b.md' });
      expect(tauriInvoke).toHaveBeenCalledWith('file_exist', { filePath: '/notes/c.md' });
    });

    test('loaded imports mdsilo.json into the store', async () => {
      const note = makeNote({ id: '/notes/a.md' });
      mockInvoke(tauriInvoke, {
        join_paths: '/notes/mdsilo.json',
        file_exist: true,
        read_file: JSON.stringify({ isloaded: true, notesobj: { [note.id]: note }, notetree: {} }),
      });
      store.getState().setIsLoading(true);
      const { emit } = await startListening();
      await emit('loaded', ['/notes']);
      expect(store.getState().notes.toRecord()).toEqual({ [note.id]: note });
      expect(store.getState().isLoaded).toBe(true);
      expect(store.getState().isLoading).toBe(false);
    });

    test('loaded without paths is ignored', async () => {
      const { callback, emit } = await startListening();
      await emit('loaded', []);
      expect(callback).not.toHaveBeenCalled();
    });

    test('listening again replaces the previous listener', async () => {
      const unlisten = vi.fn();
      win.listen.mockResolvedValueOnce(unlisten);
      await new Dir('/notes').listen(vi.fn());
      await new Dir('/other').listen(vi.fn());
      expect(unlisten).toHaveBeenCalledTimes(1);
      expect(tauriInvoke).toHaveBeenCalledWith('listen_dir', { dir: '/other' });
    });

    test('the json written on load is not read back', async () => {
      const { callback, emit } = await startListening();
      await emit('write', ['/notes/mdsilo.json']);
      expect(tauriInvoke).not.toHaveBeenCalledWith('file_exist', expect.anything());
      expect(callback).not.toHaveBeenCalled();
    });

    test('unloaded resets isLoaded', async () => {
      store.getState().setIsLoaded(true);
      const { emit } = await startListening();
      await emit('unloaded', []);
      expect(store.getState().isLoaded).toBe(false);
    });

    test('unknown events are re-emitted as DOM events', async () => {
      const handler = vi.fn();
      document.addEventListener('custom', handler);
      const { emit } = await startListening();
      await emit('custom', ['/a', '/b']);
      document.removeEventListener('custom', handler);
      expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({ id: '/b' });
    });
  });

  test('unlisten emits unlisten_dir', async () => {
    await new Dir('/notes').unlisten();
    expect(win.emit).toHaveBeenCalledWith('unlisten_dir');
  });
});
