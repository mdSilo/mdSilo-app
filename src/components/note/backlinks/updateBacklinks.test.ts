import { describe, expect, test } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { store } from 'lib/store';
import { makeNote } from '../../../testUtils';
import updateBacklinks from './updateBacklinks';

const seed = () => {
  const target = makeNote({ id: '/n/old name.md', title: 'old name' });
  const linker = makeNote({
    id: '/n/linker.md',
    title: 'linker',
    content: 'See [[old name]] and [text](old%20name) and [web](https://example.com)',
  });
  const other = makeNote({ id: '/n/other.md', title: 'other', content: 'see [[something else]]' });
  store.getState().setNotes({ [target.id]: target, [linker.id]: linker, [other.id]: other });
};

describe('updateBacklinks', () => {
  test('rewrites links on rename', async () => {
    seed();
    await updateBacklinks('old name', '  new name ');
    expect(store.getState().notes['/n/linker.md'].content).toBe(
      'See [[new name]] and [text](new%20name) and [web](https://example.com)'
    );
    expect(store.getState().notes['/n/other.md'].content).toBe('see [[something else]]');
  });

  test('unlinks on delete', async () => {
    seed();
    await updateBacklinks('old name');
    expect(store.getState().notes['/n/linker.md'].content).toBe(
      'See old name and text and [web](https://example.com)'
    );
  });

  test('triggers a full load when needed', async () => {
    store.getState().setInitDir('/n');
    await updateBacklinks('x', 'y');
    expect(invoke).toHaveBeenCalledWith('write_json', { dir: '/n' });
  });
});
