import { describe, expect, test, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { NoteMap } from '@/lib/noteMap';
import { store } from '@/state/store';
import { ProvideCurrentView, useCurrentViewContext } from '@/state/useCurrentView';
import { writeFile } from '@/file/write';
import { scheduleSave, hasPendingSave, MAX_WAIT_MS } from '@/file/pendingSaves';
import { makeNote } from '../../testUtils';
import useDeleteNote, { doDeleteNote } from './useDeleteNote';

vi.mock('@/file/write', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/file/write')>()),
  writeFile: vi.fn(async () => undefined),
}));

const wrapper = ({ children }: { children: ReactNode }) => <ProvideCurrentView>{children}</ProvideCurrentView>;

describe('doDeleteNote', () => {
  test('removes the note, its backlinks and the file', async () => {
    const target = makeNote({ id: '/n/target.md', title: 'target' });
    const linker = makeNote({ id: '/n/linker.md', title: 'linker', content: 'see [[target]]' });
    store.getState().setNotes(NoteMap.from({ [target.id]: target, [linker.id]: linker }));

    await doDeleteNote(target.id, target.title);

    expect(store.getState().notes.get(target.id)).toBeUndefined();
    expect(store.getState().notes.get(linker.id)?.content).toBe('see target');
    expect(invoke).toHaveBeenCalledWith('delete_files', { paths: ['/n/target.md'] });
  });

  test('a save still waiting does not write the deleted file again', async () => {
    vi.useFakeTimers();
    try {
      const note = makeNote({ id: '/n/typed.md', title: 'typed' });
      store.getState().setNotes(NoteMap.from({ [note.id]: note }));
      scheduleSave(note.id, 'typed just before');

      await doDeleteNote(note.id, note.title);
      await vi.advanceTimersByTimeAsync(MAX_WAIT_MS);

      expect(hasPendingSave(note.id)).toBe(false);
      expect(writeFile).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('useDeleteNote', () => {
  test('returns to the default view and deletes', async () => {
    const note = makeNote({ id: '/n/a.md', title: 'a' });
    store.getState().setNotes(NoteMap.from({ [note.id]: note }));

    const { result } = renderHook(
      () => ({ onDelete: useDeleteNote(note.id, note.title), view: useCurrentViewContext() }),
      { wrapper }
    );
    act(() => result.current.view.dispatch({ view: 'graph' }));
    await act(async () => {
      await result.current.onDelete();
    });

    expect(result.current.view.state.view).toBe('default');
    expect(store.getState().notes.toRecord()).toEqual({});
  });
});
