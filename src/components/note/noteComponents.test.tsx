import { describe, expect, test, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import { NoteMap } from 'lib/noteMap';
import { store } from 'lib/store';
import { ProvideCurrentView, useCurrentViewContext } from 'context/useCurrentView';
import { ProvideCurrentMd } from 'context/useCurrentMd';
import { makeFileMeta, makeNote, mockInvoke, renderWithView } from '../../testUtils';
import NoteMetadata from './NoteMetadata';
import Toc from './Toc';
import Title from './Title';
import NoteSumList from './NoteSumList';
import FindOrCreateInput from './NoteNewInput';
import FindOrCreateModal from './NoteNewModal';
import MoveToInput, { moveNoteTreeItem } from './NoteMoveInput';
import MoveToModal from './NoteMoveModal';
import NoteDelModal from './NoteDelModal';
import NoteHeader from './NoteHeader';

const joinPaths = ({ root, parts }: Record<string, unknown>) => [root, ...(parts as string[])].join('/');

const ViewProbe = () => {
  const { state } = useCurrentViewContext();
  return <p data-testid="view">{JSON.stringify(state)}</p>;
};
const viewState = () => JSON.parse(screen.getByTestId('view').textContent as string);

describe('NoteMetadata', () => {
  test('renders nothing for unknown notes', () => {
    const { container } = render(<NoteMetadata noteId="/missing.md" />);
    expect(container).toBeEmptyDOMElement();
  });

  test('shows counts and dates', () => {
    const note = makeNote({ id: '/a.md', content: 'hello big world' });
    store.getState().setNotes(NoteMap.from({ [note.id]: note }));
    render(<NoteMetadata noteId="/a.md" />);
    expect(screen.getByText('~3 words, 15 characters')).toBeInTheDocument();
    expect(screen.getByText(/^Created:/)).toBeInTheDocument();
    expect(screen.getByText(/^Modified:/)).toBeInTheDocument();
  });

  test('hides counts for empty notes', () => {
    const note = makeNote({ id: '/a.md', content: '' });
    store.getState().setNotes(NoteMap.from({ [note.id]: note }));
    render(<NoteMetadata noteId="/a.md" />);
    expect(screen.queryByText(/words/)).not.toBeInTheDocument();
  });
});

describe('Toc', () => {
  const headings = [
    { title: 'Intro', level: 1, id: 'intro' },
    { title: 'Details', level: 2, id: 'details' },
  ];

  test('toggles the heading list', async () => {
    render(<Toc headings={headings} metaInfo="(2)" />);
    expect(screen.queryByText('Intro')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Table of Contents/ }));
    expect(screen.getByText('Intro').closest('a')).toHaveAttribute('href', '#intro');
    expect(screen.getByText('Details').parentElement).toHaveStyle({ paddingLeft: '24px' });
    await userEvent.click(screen.getByRole('button', { name: /Table of Contents/ }));
    expect(screen.queryByText('Intro')).not.toBeInTheDocument();
  });

  test('shows nothing when there are no headings', async () => {
    render(<Toc headings={[]} />);
    await userEvent.click(screen.getByRole('button'));
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('Title', () => {
  test('shows the initial title and emits on blur', () => {
    const onChange = vi.fn();
    render(<Title initialTitle="Hello" onChange={onChange} />);
    const box = screen.getByRole('textbox');
    expect(box).toHaveTextContent('Hello');
    expect(box).toHaveAttribute('contenteditable', 'true');
    box.textContent = 'Changed';
    fireEvent.blur(box);
    expect(onChange).toHaveBeenCalledWith('Changed');
  });

  test('is read-only for daily notes and in read mode', () => {
    const { rerender } = render(<Title initialTitle="2022-01-01" onChange={vi.fn()} isDaily />);
    expect(screen.getByRole('textbox')).toHaveAttribute('contenteditable', 'false');
    act(() => store.getState().setReadMode(true));
    rerender(<Title initialTitle="x" onChange={vi.fn()} />);
    expect(screen.getByRole('textbox')).toHaveAttribute('contenteditable', 'false');
  });

  test('pastes plain text without newlines', () => {
    const execCommand = vi.fn();
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
    render(<Title initialTitle="x" onChange={vi.fn()} />);
    const notPrevented = fireEvent.paste(screen.getByRole('textbox'), {
      clipboardData: { getData: () => 'line one\r\nline two\nthree' },
    });
    expect(notPrevented).toBe(false);
    expect(execCommand).toHaveBeenCalledWith('insertText', false, 'line one line two three');
  });

  test('blocks Enter', () => {
    render(<Title initialTitle="x" onChange={vi.fn()} />);
    const notPrevented = fireEvent.keyPress(screen.getByRole('textbox'), { key: 'Enter', code: 'Enter', charCode: 13 });
    expect(notPrevented).toBe(false);
  });
});

describe('NoteSumList', () => {
  const notes = [
    makeNote({ id: '/n/a.md', title: 'Alpha', content: '# H\n\nFirst para\n\nSecond para\n\nThird para' }),
  ];

  test('lists notes with a summary and opens them', async () => {
    mockInvoke(invoke, { file_exist: false });
    renderWithView(
      <>
        <NoteSumList anchor="2022-1-1" notes={notes} />
        <ViewProbe />
      </>
    );
    expect(screen.getByText('2022-1-1')).toBeInTheDocument();
    const summary = screen.getByText(/First para/);
    expect(summary).toHaveTextContent('Second para');
    expect(summary).not.toHaveTextContent('Third para');
    await userEvent.click(screen.getByText('Alpha'));
    await waitFor(() => expect(viewState()).toEqual({ view: 'md', params: { noteId: '/n/a.md' } }));
  });

  test('shows a recap button for dates', async () => {
    const onClick = vi.fn();
    renderWithView(<NoteSumList anchor="2022-1-1" notes={[]} isDate onClick={onClick} />);
    const btn = screen.getByText('2022-1-1').parentElement?.querySelector('button') as HTMLButtonElement;
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledWith('2022-1-1');
  });
});

describe('FindOrCreateInput', () => {
  const seed = () => {
    const a = makeNote({ id: '/n/apple.md', title: 'apple' });
    const b = makeNote({ id: '/n/apricot.md', title: 'apricot' });
    store.getState().setNotes(NoteMap.from({ [a.id]: a, [b.id]: b }));
    store.getState().setCurrentDir('/n');
  };

  test('offers to create a new note when no exact match', async () => {
    seed();
    renderWithView(<FindOrCreateInput />);
    await userEvent.type(screen.getByPlaceholderText('new or find'), 'appl');
    expect(screen.getByText('New: appl')).toBeInTheDocument();
    expect(screen.getByText('apple')).toBeInTheDocument();
  });

  test('hides the new option on exact match', async () => {
    seed();
    renderWithView(<FindOrCreateInput />);
    await userEvent.type(screen.getByPlaceholderText('new or find'), 'Apple');
    expect(screen.queryByText(/^New:/)).not.toBeInTheDocument();
  });

  test('creates a new note and navigates to it', async () => {
    seed();
    mockInvoke(invoke, { join_paths: joinPaths });
    const onOptionClick = vi.fn();
    renderWithView(
      <>
        <FindOrCreateInput onOptionClick={onOptionClick} />
        <ViewProbe />
      </>
    );
    await userEvent.type(screen.getByPlaceholderText('new or find'), '2022-02-02');
    await userEvent.click(screen.getByText('New: 2022-02-02'));
    await waitFor(() => expect(viewState().view).toBe('md'));
    expect(onOptionClick).toHaveBeenCalled();
    const note = store.getState().notes.get('/n/2022-02-02.md');
    expect(note).toMatchObject({ title: '2022-02-02', is_daily: true, file_path: '/n/2022-02-02.md' });
    expect(store.getState().noteTree['/n'].map((i) => i.id)).toContain('/n/2022-02-02.md');
    expect(store.getState().currentNote).toEqual({ '/n/2022-02-02.md': note });
  });

  test('does not create a note without a current dir', async () => {
    renderWithView(
      <>
        <FindOrCreateInput />
        <ViewProbe />
      </>
    );
    await userEvent.type(screen.getByPlaceholderText('new or find'), 'x{enter}');
    expect(invoke).not.toHaveBeenCalledWith('join_paths', expect.anything());
    expect(viewState().view).toBe('default');
  });

  test('keyboard selects and opens an existing note', async () => {
    seed();
    mockInvoke(invoke, {
      file_exist: true,
      get_file_meta: makeFileMeta({ file_path: '/n/apricot.md', file_name: 'apricot.md' }),
      get_parent_dir: '/n',
    });
    renderWithView(
      <>
        <FindOrCreateInput />
        <ViewProbe />
      </>
    );
    const input = screen.getByPlaceholderText('new or find');
    await userEvent.type(input, 'apr');
    // options: New: apr, apricot
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{ArrowDown}{ArrowUp}{ArrowUp}{ArrowUp}');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(viewState()).toEqual({ view: 'md', params: { noteId: '/n/apricot.md' } }));
  });
});

describe('FindOrCreateModal', () => {
  test('closes on backdrop click and Escape', async () => {
    const setIsOpen = vi.fn();
    const { container } = renderWithView(<FindOrCreateModal setIsOpen={setIsOpen} />);
    fireEvent.click(container.querySelector('.bg-black') as Element);
    expect(setIsOpen).toHaveBeenCalledWith(false);

    setIsOpen.mockClear();
    fireEvent.keyDown(document, { key: 'Escape', keyCode: 27, which: 27 });
    expect(setIsOpen).toHaveBeenCalledWith(false);
  });
});

describe('MoveToInput', () => {
  const seedTree = () => {
    const dirs = ['zeta', 'alpha', 'beta'].map((t) => makeNote({ id: `/root/${t}`, title: t, is_dir: true }));
    const file = makeNote({ id: '/root/file.md', title: 'file' });
    store.getState().setNotes(NoteMap.from(Object.fromEntries([...dirs, file].map((n) => [n.id, n]))));
    store.getState().upsertTree('/root', [...dirs, file]);
    store.getState().setInitDir('/root');
    store.getState().setCurrentDir('/root');
    store.getState().setIsLoaded(true);
  };

  test('lists root and sorted dirs when empty', () => {
    seedTree();
    render(<MoveToInput noteId="/root/file.md" />);
    const labels = screen.getAllByRole('button').map((b) => b.textContent);
    expect(labels).toEqual(['Move to root', 'alpha', 'beta', 'zeta']);
  });

  test('searches dirs and offers a new folder', async () => {
    seedTree();
    render(<MoveToInput noteId="/root/file.md" />);
    await userEvent.type(screen.getByPlaceholderText('Search to move to'), 'bet');
    const labels = screen.getAllByRole('button').map((b) => b.textContent);
    expect(labels).toEqual(['New Folder: bet', 'beta']);
  });

  test('creates the new folder before moving', async () => {
    seedTree();
    mockInvoke(invoke, { join_paths: joinPaths, create_dir_recursive: true });
    const onOptionClick = vi.fn();
    render(<MoveToInput noteId="/root/file.md" onOptionClick={onOptionClick} />);
    await userEvent.type(screen.getByPlaceholderText('Search to move to'), 'fresh');
    await userEvent.click(screen.getByText('New Folder: fresh'));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('create_dir_recursive', { dirPath: '/root/fresh' }));
    expect(onOptionClick).toHaveBeenCalled();
  });

  test('loads the dir when not loaded', async () => {
    store.getState().setInitDir('/root');
    await act(async () => {
      render(<MoveToInput noteId="/root/file.md" />);
    });
    expect(invoke).toHaveBeenCalledWith('write_json', { dir: '/root' });
    expect(store.getState().isLoaded).toBe(true);
  });
});

describe('moveNoteTreeItem', () => {
  test('moves the note in the store', () => {
    const note = makeNote({ id: '/a/x.md', title: 'x' });
    store.getState().setNotes(NoteMap.from({ [note.id]: note }));
    store.getState().upsertTree('/a', [note]);
    moveNoteTreeItem('/a/x.md', '/b', '/b/x.md', note);
    expect(store.getState().notes.keys()).toEqual(['/b/x.md']);
    expect(store.getState().notes.get('/b/x.md')).toMatchObject({ title: 'x', file_path: '/b/x.md' });
    expect(store.getState().noteTree['/a']).toEqual([]);
    expect(store.getState().noteTree['/b'].map((i) => i.id)).toEqual(['/b/x.md']);
  });

  test('ignores moves to the same path', () => {
    const note = makeNote({ id: '/a/x.md' });
    store.getState().setNotes(NoteMap.from({ [note.id]: note }));
    moveNoteTreeItem('/a/x.md', '/a', '/a/x.md', note);
    expect(store.getState().notes.toRecord()).toEqual({ '/a/x.md': note });
  });
});

describe('MoveToModal', () => {
  test('closes on backdrop click', () => {
    const setIsOpen = vi.fn();
    const { container } = render(<MoveToModal noteId="/a.md" setIsOpen={setIsOpen} />);
    fireEvent.click(container.querySelector('.bg-black') as Element);
    expect(setIsOpen).toHaveBeenCalledWith(false);
  });
});

describe('NoteDelModal', () => {
  test('confirms deletion', async () => {
    const note = makeNote({ id: '/n/a.md', title: 'a' });
    store.getState().setNotes(NoteMap.from({ [note.id]: note }));
    renderWithView(<NoteDelModal noteId={note.id} noteTitle="a" isOpen handleClose={vi.fn()} />);
    await userEvent.click(await screen.findByText('Confirm Delete'));
    await waitFor(() => expect(store.getState().notes.toRecord()).toEqual({}));
    expect(invoke).toHaveBeenCalledWith('delete_files', { paths: ['/n/a.md'] });
  });

  test('cancels', async () => {
    const handleClose = vi.fn();
    renderWithView(<NoteDelModal noteId="/n/a.md" noteTitle="a" isOpen handleClose={handleClose} />);
    await userEvent.click(await screen.findByText('Cancel Delete'));
    expect(handleClose).toHaveBeenCalled();
  });
});

describe('NoteHeader', () => {
  const note = makeNote({ id: '/n/a.md', title: 'a', content: 'body' });

  const renderHeader = (setShowBacklink = vi.fn()) => {
    store.getState().setNotes(NoteMap.from({ [note.id]: note }));
    const value = { ty: 'md', id: note.id, state: { view: 'md' }, dispatch: vi.fn() };
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <ProvideCurrentView>
        <div id="app-container">
          <ProvideCurrentMd value={value}>{children}</ProvideCurrentMd>
        </div>
      </ProvideCurrentView>
    );
    return render(<NoteHeader setShowBacklink={setShowBacklink} />, { wrapper: Wrapper });
  };

  test('switches editor modes', async () => {
    mockInvoke(invoke, { file_exist: false });
    const setShowBacklink = vi.fn();
    const { container } = renderHeader(setShowBacklink);
    const [, rawBtn, mindBtn] = Array.from(container.querySelectorAll('#note-header-btns button'));
    await userEvent.click(rawBtn);
    await waitFor(() => expect(store.getState().rawMode).toBe('raw'));
    expect(setShowBacklink).toHaveBeenCalledWith(false);
    await userEvent.click(mindBtn);
    await waitFor(() => expect(store.getState().rawMode).toBe('mindmap'));
  });

  test('opens the options menu and the delete modal', async () => {
    renderHeader();
    const menuBtn = screen.getAllByRole('button').find((b) => b.getAttribute('aria-haspopup')) as HTMLElement;
    await userEvent.click(menuBtn);
    expect(screen.getByText('Export PDF')).toBeInTheDocument();
    expect(screen.getByText('Export PNG')).toBeInTheDocument();
    expect(screen.getByText(/Created:/)).toBeInTheDocument();
    await userEvent.click(screen.getByText('Delete Permanently'));
    expect(await screen.findByText('Delete This Work?')).toBeInTheDocument();
  });
});
