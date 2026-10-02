import { describe, expect, test } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { store } from 'lib/store';
import { ProvideCurrentView, useCurrentViewContext } from 'context/useCurrentView';
import { makeFileMeta, mockInvoke } from '../../testUtils';
import useOnNoteLinkClick from './useOnNoteLinkClick';

const wrapper = ({ children }: { children: ReactNode }) => <ProvideCurrentView>{children}</ProvideCurrentView>;

describe('useOnNoteLinkClick', () => {
  test('opens the note and switches to the md view', async () => {
    mockInvoke(invoke, {
      file_exist: true,
      get_file_meta: makeFileMeta({ file_path: '/n/a.md', file_name: 'a.md', file_text: 'hi' }),
      get_parent_dir: '/n',
    });
    const { result } = renderHook(() => ({ link: useOnNoteLinkClick(), view: useCurrentViewContext() }), {
      wrapper,
    });

    await act(async () => {
      await result.current.link.onClick('/n/a.md', 3);
    });

    expect(result.current.view.state).toEqual({ view: 'md', params: { noteId: '/n/a.md', hash: '0-3' } });
    expect(store.getState().currentNote['/n/a.md'].content).toBe('hi');
    expect(store.getState().currentNoteId).toBe('/n/a.md');
  });

  test('does nothing when the file is missing', async () => {
    mockInvoke(invoke, { file_exist: false });
    const { result } = renderHook(() => ({ link: useOnNoteLinkClick(), view: useCurrentViewContext() }), {
      wrapper,
    });
    await act(async () => {
      await result.current.link.onClick('/n/missing.md');
    });
    expect(result.current.view.state.view).toBe('default');
  });
});
