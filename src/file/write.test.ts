import { afterEach, beforeEach, describe, expect, test, type Mock } from 'vitest';
import { enterTauri, leaveTauri, makeNote, mockInvoke } from '../testUtils';

describe('write (tauri)', () => {
  let write: typeof import('./write');
  let invoke: Mock;
  let store: typeof import('lib/store').store;

  beforeEach(async () => {
    enterTauri();
    invoke = (await import('@tauri-apps/api/core')).invoke as Mock;
    mockInvoke(invoke, {
      get_data: { status: false },
      join_paths: ({ root, parts }: Record<string, unknown>) => `${root}/${(parts as string[]).join('/')}`,
    });
    write = await import('./write');
    store = (await import('lib/store')).store;
  });

  afterEach(() => {
    leaveTauri();
  });

  test('writeFile writes text to the path', async () => {
    await write.writeFile('/n/a.md', '# A');
    expect(invoke).toHaveBeenCalledWith('write_file', { filePath: '/n/a.md', text: '# A' });
  });

  test('writeJsonFile writes mdsilo.json in the dir', async () => {
    await write.writeJsonFile('/n', '{"x":1}');
    expect(invoke).toHaveBeenCalledWith('write_file', { filePath: '/n/mdsilo.json', text: '{"x":1}' });
  });

  test('writeJsonFile defaults to the store snapshot', async () => {
    const note = makeNote({ id: '/n/a.md', title: 'a' });
    store.getState().setNotes({ [note.id]: note });
    await write.writeJsonFile('/n');
    const call = invoke.mock.calls.find((c) => c[0] === 'write_file');
    expect(JSON.parse(call?.[1].text).notesobj).toEqual({ '/n/a.md': note });
  });

  test('deleteFile deletes the path', async () => {
    await write.deleteFile('/n/a.md');
    expect(invoke).toHaveBeenCalledWith('delete_files', { paths: ['/n/a.md'] });
  });

  test('writeAllFile writes one md per note plus the json', async () => {
    const a = makeNote({ id: '/old/a.md', title: 'a', content: 'A' });
    const b = makeNote({ id: '/old/b.md', title: 'b', content: 'B' });
    await write.writeAllFile('/save', { [a.id]: a, [b.id]: b });
    const writes = invoke.mock.calls.filter((c) => c[0] === 'write_file').map((c) => c[1]);
    expect(writes).toEqual([
      { filePath: '/save/a.md', text: 'A' },
      { filePath: '/save/b.md', text: 'B' },
      { filePath: '/save/mdsilo.json', text: expect.any(String) },
    ]);
  });
});
