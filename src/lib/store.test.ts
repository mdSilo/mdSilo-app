import { describe, expect, test, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { makeNote } from '../testUtils';
import { store, useStore, getNoteTreeItem, onStoreHydrated, SidebarTab, type NoteTreeItem } from './store';

describe('store defaults', () => {
  test('has sensible initial values', () => {
    const s = store.getState();
    expect(s.notes).toEqual({});
    expect(s.noteTree).toEqual({});
    expect(s.currentNoteId).toBe('');
    expect(s.sidebarTab).toBe(SidebarTab.Silo);
    expect(s.sidebarSearchType).toBe('content');
    expect(s.isLoading).toBe(false);
    expect(s.isLoaded).toBe(false);
    expect(s.currentArticle).toBeNull();
    expect(s.currentPod).toBeNull();
  });
});

describe('setter', () => {
  test('accepts a value', () => {
    store.getState().setCurrentNoteId('a');
    expect(store.getState().currentNoteId).toBe('a');
  });

  test('accepts an updater function', () => {
    store.getState().setIsSidebarOpen((open) => !open);
    expect(store.getState().isSidebarOpen).toBe(false);
  });
});

describe('note operations', () => {
  test('upsertNote inserts and then merges', () => {
    const note = makeNote({ id: '/a.md', title: 'a', content: 'one' });
    store.getState().upsertNote(note);
    expect(store.getState().notes['/a.md']).toEqual(note);

    store.getState().upsertNote({ ...note, content: 'two' });
    expect(store.getState().notes['/a.md'].content).toBe('two');
    expect(Object.keys(store.getState().notes)).toHaveLength(1);
  });

  test('upsertNotes inserts and merges many notes at once', () => {
    const a = makeNote({ id: '/a.md', title: 'a', content: 'one' });
    store.getState().upsertNote(a);
    const before = store.getState();
    store.getState().upsertNotes([{ ...a, content: 'two' }, makeNote({ id: '/b.md', title: 'b' })]);
    expect(store.getState().notes['/a.md'].content).toBe('two');
    expect(store.getState().notes['/b.md'].title).toBe('b');
    // empty list is a no-op
    const after = store.getState();
    store.getState().upsertNotes([]);
    expect(store.getState()).toBe(after);
    expect(after).not.toBe(before);
  });

  test('updateNote changes existing notes and bumps updated_at', () => {
    const note = makeNote({ id: '/a.md', updated_at: '2000-01-01T00:00:00.000Z' });
    store.getState().upsertNote(note);
    store.getState().updateNote({ id: '/a.md', title: 'renamed' });
    const updated = store.getState().notes['/a.md'];
    expect(updated.title).toBe('renamed');
    expect(updated.updated_at > note.updated_at).toBe(true);
  });

  test('updateNote ignores unknown notes', () => {
    store.getState().updateNote({ id: '/missing.md', title: 'x' });
    expect(store.getState().notes).toEqual({});
  });

  test('upsertTree appends unique items to a dir', () => {
    const a = makeNote({ id: '/d/a.md', title: 'a' });
    const b = makeNote({ id: '/d/b', title: 'b', is_dir: true });
    store.getState().upsertTree('/d', [a]);
    store.getState().upsertTree('/d', [a, b]);
    const items = store.getState().noteTree['/d'];
    expect(items.map((i) => i.id)).toEqual(['/d/a.md', '/d/b']);
    expect(items[0]).toEqual({
      id: '/d/a.md',
      title: 'a',
      created_at: a.created_at,
      updated_at: a.updated_at,
      is_dir: false,
      children: [],
      collapsed: true,
    });
    expect(items[1].is_dir).toBe(true);
  });

  test('deleteNote removes the note and its tree item', () => {
    const a = makeNote({ id: '/d/a.md' });
    const b = makeNote({ id: '/d/b.md' });
    store.getState().upsertNote(a);
    store.getState().upsertNote(b);
    store.getState().upsertTree('/d', [a, b]);
    store.getState().deleteNote('/d/a.md');
    expect(Object.keys(store.getState().notes)).toEqual(['/d/b.md']);
    expect(store.getState().noteTree['/d'].map((i) => i.id)).toEqual(['/d/b.md']);
  });

  test('deleteNote tolerates ids missing from the tree', () => {
    store.getState().deleteNote('/nope');
    expect(store.getState().notes).toEqual({});
  });
});

describe('getNoteTreeItem', () => {
  const item = (id: string, children: NoteTreeItem[] = []): NoteTreeItem => ({
    id,
    title: id,
    created_at: '',
    updated_at: '',
    is_dir: children.length > 0,
    children,
    collapsed: false,
  });

  test('finds items at any depth', () => {
    const deep = item('c');
    const tree = [item('a'), item('b', [item('b1', [deep])])];
    expect(getNoteTreeItem(tree, 'a')?.id).toBe('a');
    expect(getNoteTreeItem(tree, 'c')).toBe(deep);
    expect(getNoteTreeItem(tree, 'x')).toBeNull();
    expect(getNoteTreeItem([], 'a')).toBeNull();
  });
});

describe('useStore', () => {
  test('re-renders on state change', () => {
    const { result } = renderHook(() => useStore((s) => s.currentDir));
    expect(result.current).toBeUndefined();
    act(() => store.getState().setCurrentDir('/notes'));
    expect(result.current).toBe('/notes');
  });
});

describe('persistence', () => {
  test('persists user settings but not session state', async () => {
    store.getState().setDarkMode(false);
    store.getState().setCurrentNoteId('/a.md');
    await new Promise((r) => setTimeout(r, 0));
    const saved = JSON.parse(JSON.parse(localStorage.getItem('mdsilo-storage') as string));
    expect(saved.state.darkMode).toBe(false);
    expect(saved.state).not.toHaveProperty('currentNoteId');
    expect(saved.state).not.toHaveProperty('notes');
    expect(saved.version).toBe(1);
  });

  test('writes storage only when persisted settings change', async () => {
    store.getState().setDarkMode(true);
    await new Promise((r) => setTimeout(r, 0));
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    // session state changes: nothing to write
    store.getState().upsertNotes([makeNote({ id: '/a.md' }), makeNote({ id: '/b.md' })]);
    store.getState().setCurrentNoteId('/a.md');
    await new Promise((r) => setTimeout(r, 0));
    expect(setItem).not.toHaveBeenCalled();
    // a setting changes: written once
    store.getState().setSidebarWidth(300);
    await new Promise((r) => setTimeout(r, 0));
    expect(setItem).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(JSON.parse(localStorage.getItem('mdsilo-storage') as string));
    expect(saved.state.sidebarWidth).toBe(300);
    setItem.mockRestore();
  });

  test('finishes hydrating on first launch w/o saved settings', async () => {
    localStorage.clear();
    const persist = (store as unknown as { persist: { rehydrate: () => Promise<void>; hasHydrated: () => boolean } }).persist;
    await persist.rehydrate();
    expect(persist.hasHydrated()).toBe(true);
    let called = 0;
    onStoreHydrated(() => { called += 1; });
    expect(called).toBe(1);
  });
});

