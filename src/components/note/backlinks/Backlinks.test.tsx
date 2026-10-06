import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { NoteMap } from 'lib/noteMap';
import { store } from 'lib/store';
import { ProvideCurrentView, useCurrentViewContext } from 'context/useCurrentView';
import { makeFileMeta, makeNote, mockInvoke } from '../../../testUtils';
import Backlinks, { getNumOfMatches } from './Backlinks';
import BacklinkBranch from './BacklinkBranch';

const target = makeNote({ id: '/n/target.md', title: 'target', content: 'the target' });
const linker = makeNote({ id: '/n/linker.md', title: 'linker', content: 'Goes to [[target]] now' });
const mention = makeNote({ id: '/n/mention.md', title: 'mention', content: 'mentions target plainly' });

const OpenTarget = ({ children }: { children: ReactNode }) => {
  const { state, dispatch } = useCurrentViewContext();
  return (
    <>
      <button onClick={() => dispatch({ view: 'md', params: { noteId: target.id } })}>open</button>
      <p data-testid="view">{JSON.stringify(state)}</p>
      {children}
    </>
  );
};

const renderBacklinks = (isCollapse = false) =>
  render(
    <ProvideCurrentView>
      <OpenTarget>
        <Backlinks isCollapse={isCollapse} />
      </OpenTarget>
    </ProvideCurrentView>
  );

describe('getNumOfMatches', () => {
  test('sums matches', () => {
    const m = { text: '', from: 0, to: 0, context: null };
    expect(getNumOfMatches([])).toBe(0);
    expect(getNumOfMatches([{ id: 'a', title: 'a', matches: [m, m] }, { id: 'b', title: 'b', matches: [m] }])).toBe(3);
  });
});

describe('BacklinkBranch', () => {
  test('renders its title', () => {
    render(<BacklinkBranch title="3 BackLinks" />);
    expect(screen.getByText('3 BackLinks')).toBeInTheDocument();
  });
});

describe('Backlinks', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    store.getState().setNotes(NoteMap.from({ [target.id]: target, [linker.id]: linker, [mention.id]: mention }));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('lists linked and unlinked references for the current note', async () => {
    renderBacklinks();
    await userEvent.click(screen.getByText('open'));
    act(() => vi.advanceTimersByTime(1000));

    expect(screen.getByText('1 BackLinks')).toBeInTheDocument();
    expect(screen.getByText('2 Mentions')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'linker' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'mention' })).toBeInTheDocument();
  });

  test('collapses everything when asked', async () => {
    renderBacklinks(true);
    await userEvent.click(screen.getByText('open'));
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText('1 BackLinks')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'linker' })).not.toBeInTheDocument();
  });

  test('clicking a backlink note opens it', async () => {
    mockInvoke(invoke, {
      file_exist: true,
      get_file_meta: makeFileMeta({ file_path: linker.id, file_name: 'linker.md' }),
      get_parent_dir: '/n',
    });
    renderBacklinks();
    await userEvent.click(screen.getByText('open'));
    act(() => vi.advanceTimersByTime(1000));
    await userEvent.click(screen.getAllByRole('button', { name: 'linker' })[0]);
    await waitFor(() =>
      expect(JSON.parse(screen.getByTestId('view').textContent as string).params.noteId).toBe(linker.id)
    );
  });
});
