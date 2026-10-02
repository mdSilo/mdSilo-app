import { describe, expect, test } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { store } from 'lib/store';
import { makeNote } from '../../testUtils';
import useTasks, { computeTasks } from './useTasks';

const withTasks = makeNote({ id: '/a.md', title: 'a', content: '- [ ] one\n- [x] two\n' });
const without = makeNote({ id: '/b.md', title: 'b', content: 'no tasks here' });

describe('computeTasks', () => {
  test('collects tasks per note', () => {
    const result = computeTasks({ [withTasks.id]: withTasks, [without.id]: without });
    expect(result).toEqual([
      {
        note: withTasks,
        tasks: [
          { title: 'a', text: 'one', completed: false },
          { title: 'a', text: 'two', completed: true },
        ],
      },
    ]);
  });

  test('returns nothing for no notes', () => {
    expect(computeTasks({})).toEqual([]);
  });
});

describe('useTasks', () => {
  test('recomputes when notes change', () => {
    const { result } = renderHook(() => useTasks());
    expect(result.current).toEqual([]);
    act(() => store.getState().upsertNote(withTasks));
    expect(result.current).toHaveLength(1);
  });

  test('loads the init dir when needed', async () => {
    store.getState().setInitDir('/notes');
    await act(async () => {
      renderHook(() => useTasks());
    });
    expect(invoke).toHaveBeenCalledWith('write_json', { dir: '/notes' });
    expect(store.getState().isLoaded).toBe(true);
  });
});
