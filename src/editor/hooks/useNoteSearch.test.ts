import { describe, expect, test } from 'vitest';
import { renderHook } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { store } from 'lib/store';
import { makeNote } from '../../testUtils';
import useNoteSearch from './useNoteSearch';

const notes = [
  makeNote({ id: '/n/apple.md', title: 'apple', content: 'Red fruit\n\nGrows on #trees#' }),
  makeNote({ id: '/n/banana.md', title: 'banana', content: 'Yellow fruit' }),
  makeNote({ id: '/n/cherry.md', title: 'cherry pie', content: 'Dessert with #fruit# filling' }),
  makeNote({ id: '/n/data.json', title: 'data.json', content: 'apple' }),
  makeNote({ id: '/n/apples', title: 'apples', is_dir: true }),
];

const seed = () => store.getState().setNotes(Object.fromEntries(notes.map((n) => [n.id, n])));

describe('useNoteSearch', () => {
  test('searches note titles, excluding dirs and non-md files', () => {
    seed();
    const { result } = renderHook(() => useNoteSearch());
    const hits = result.current('apple').map((r) => r.item.id);
    expect(hits).toEqual(['/n/apple.md']);
  });

  test('limits the number of results', () => {
    seed();
    const { result } = renderHook(() => useNoteSearch({ numOfResults: 1, extendedSearch: true }));
    expect(result.current("'a")).toHaveLength(1);
  });

  test('searches content blocks', () => {
    seed();
    const { result } = renderHook(() => useNoteSearch({ searchContent: true }));
    const hits = result.current('fruit');
    expect(hits.map((r) => r.item.title).sort()).toEqual(['apple', 'banana', 'cherry pie']);
    expect(result.current('yellow').map((r) => r.item.title)).toEqual(['banana']);
    expect(hits[0].matches?.length).toBeGreaterThan(0);
  });

  test('searches hashtags', () => {
    seed();
    const { result } = renderHook(() => useNoteSearch({ searchHashTag: true }));
    const hits = result.current('fruit');
    expect(hits.map((r) => r.item.title)).toEqual(['cherry pie']);
    expect(hits[0].item.blocks?.[0].text).toContain('fruit');
  });

  test('searches dirs only when asked', () => {
    seed();
    const { result } = renderHook(() => useNoteSearch({ searchDir: true }));
    expect(result.current('apple').map((r) => r.item.id)).toEqual(['/n/apples']);
  });

  test('searches a provided note base instead of the store', () => {
    seed();
    const base = [makeNote({ id: '/x/kiwi.md', title: 'kiwi' })];
    const { result } = renderHook(() => useNoteSearch({ notesBase: base }));
    expect(result.current('kiwi').map((r) => r.item.id)).toEqual(['/x/kiwi.md']);
    expect(result.current('apple')).toEqual([]);
  });

  test('triggers a full load when the dir is not loaded', () => {
    store.getState().setInitDir('/n');
    const { result } = renderHook(() => useNoteSearch());
    result.current('x');
    expect(invoke).toHaveBeenCalledWith('write_json', { dir: '/n' });
  });
});
