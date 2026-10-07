import { describe, expect, test, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { NoteMap } from 'lib/noteMap';
import { store } from 'lib/store';
import { makeNote, mockInvoke } from '../../../testUtils';
import updateBacklinks from './updateBacklinks';

const seed = () => {
  const target = makeNote({ id: '/n/old name.md', title: 'old name' });
  const linker = makeNote({
    id: '/n/linker.md',
    title: 'linker',
    content: 'See [[old name]] and [text](old%20name) and [web](https://example.com)',
  });
  const other = makeNote({ id: '/n/other.md', title: 'other', content: 'see [[something else]]' });
  store.getState().setNotes(NoteMap.from({ [target.id]: target, [linker.id]: linker, [other.id]: other }));
};

describe('updateBacklinks', () => {
  test('rewrites links on rename', async () => {
    seed();
    await updateBacklinks('old name', '  new name ');
    expect(store.getState().notes.get('/n/linker.md')?.content).toBe(
      'See [[new name]] and [text](new%20name) and [web](https://example.com)'
    );
    expect(store.getState().notes.get('/n/other.md')?.content).toBe('see [[something else]]');
  });

  test('unlinks on delete', async () => {
    seed();
    store.getState().deleteNote('/n/old name.md');
    await updateBacklinks('old name');
    expect(store.getState().notes.get('/n/linker.md')?.content).toBe(
      'See old name and text and [web](https://example.com)'
    );
  });

  test('triggers a full load when needed and waits for it', async () => {
    store.getState().setInitDir('/n');
    const linker = makeNote({ id: '/n/linker.md', title: 'linker', content: 'see [[x]]' });
    // the loaded notes arrive after write_json
    mockInvoke(invoke, {
      write_json: () => {
        store.getState().setNotes(NoteMap.from([linker]));
        store.getState().setIsLoaded(true);
        return true;
      },
    });
    await updateBacklinks('x', 'y');
    expect(invoke).toHaveBeenCalledWith('write_json', { dir: '/n' });
    expect(store.getState().notes.get(linker.id)?.content).toBe('see [[y]]');
  });

  test('goes on with the notes in store if the load never ends', async () => {
    vi.useFakeTimers();
    try {
      seed();
      store.getState().setInitDir('/n');
      const done = updateBacklinks('old name', 'new name');
      await vi.advanceTimersByTimeAsync(5000);
      await done;
      expect(store.getState().notes.get('/n/linker.md')?.content).toContain('[[new name]]');
    } finally {
      vi.useRealTimers();
    }
  });

  test('keeps links on delete if another note has the same title', async () => {
    seed();
    const twin = makeNote({ id: '/m/old name.md', title: 'old name' });
    store.getState().upsertNote(twin);
    store.getState().deleteNote('/n/old name.md');
    await updateBacklinks('old name');
    expect(store.getState().notes.get('/n/linker.md')?.content).toContain('[[old name]]');
  });

  test('handles aliases, several links per line, escapes and code', async () => {
    const target = makeNote({ id: '/n/_draft_.md', title: '_draft_' });
    const linker = makeNote({
      id: '/n/linker.md',
      title: 'linker',
      content: [
        '[[_draft_]] and [[_draft_|my draft]] and [[other]] and [x](\\_draft\\_ "tip")',
        '`[[_draft_]]` stays in code, so does ![img](_draft_) and \\[[_draft_]]',
        '```',
        '[[_draft_]]',
        '```',
      ].join('\n'),
    });
    store.getState().setNotes(NoteMap.from([target, linker]));

    await updateBacklinks('_draft_', 'final (v2)');
    expect(store.getState().notes.get(linker.id)?.content).toBe([
      '[[final (v2)]] and [[final (v2)|my draft]] and [[other]] and [x](final%20%28v2%29 "tip")',
      '`[[_draft_]]` stays in code, so does ![img](_draft_) and \\[[_draft_]]',
      '```',
      '[[_draft_]]',
      '```',
    ].join('\n'));

    await updateBacklinks('final (v2)');
    expect(store.getState().notes.get(linker.id)?.content.split('\n')[0]).toBe(
      'final (v2) and my draft and [[other]] and x'
    );
  });

  test('updates only the notes changed', async () => {
    seed();
    const updateNote = vi.fn(store.getState().updateNote);
    store.setState({ updateNote });
    await updateBacklinks('old name', 'new name');
    expect(updateNote).toHaveBeenCalledTimes(1);
    expect(updateNote.mock.calls[0][0].id).toBe('/n/linker.md');
  });
});

describe('updateBacklinks legacy links', () => {
  test('renames the links with `_` for spaces', async () => {
    const target = makeNote({ id: '/n/a b.md', title: 'a b' });
    const legacy = makeNote({ id: '/n/old.md', title: 'old', content: '[a b](a_b) and [[a_b]]' });
    store.getState().setNotes(NoteMap.from([target, legacy]));
    await updateBacklinks('a b', 'c d');
    expect(store.getState().notes.get(legacy.id)?.content).toBe('[a b](c%20d) and [[c d]]');
  });
});
