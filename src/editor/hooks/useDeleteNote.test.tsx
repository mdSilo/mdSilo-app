import { describe, expect, test } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { store } from 'lib/store';
import { ProvideCurrentView, useCurrentViewContext } from 'context/useCurrentView';
import { makeNote } from '../../testUtils';
import useDeleteNote, { doDeleteNote } from './useDeleteNote';

const wrapper = ({ children }: { children: ReactNode }) => <ProvideCurrentView>{children}</ProvideCurrentView>;

describe('doDeleteNote', () => {
  test('removes the note, its backlinks and the file', async () => {
    const target = makeNote({ id: '/n/target.md', title: 'target' });
    const linker = makeNote({ id: '/n/linker.md', title: 'linker', content: 'see [[target]]' });
    store.getState().setNotes({ [target.id]: target, [linker.id]: linker });

    await doDeleteNote(target.id, target.title);

    expect(store.getState().notes[target.id]).toBeUndefined();
    expect(store.getState().notes[linker.id].content).toBe('see target');
    expect(invoke).toHaveBeenCalledWith('delete_files', { paths: ['/n/target.md'] });
  });
});

describe('useDeleteNote', () => {
  test('returns to the default view and deletes', async () => {
    const note = makeNote({ id: '/n/a.md', title: 'a' });
    store.getState().setNotes({ [note.id]: note });

    const { result } = renderHook(
      () => ({ onDelete: useDeleteNote(note.id, note.title), view: useCurrentViewContext() }),
      { wrapper }
    );
    act(() => result.current.view.dispatch({ view: 'graph' }));
    await act(async () => {
      await result.current.onDelete();
    });

    expect(result.current.view.state.view).toBe('default');
    expect(store.getState().notes).toEqual({});
  });
});
