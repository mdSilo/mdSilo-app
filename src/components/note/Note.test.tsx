import { describe, expect, test, vi } from 'vitest';
import { forwardRef, useImperativeHandle } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import * as dialog from '@tauri-apps/plugin-dialog';
import copy from 'copy-to-clipboard';
import { store, SidebarTab } from 'lib/store';
import { ProvideCurrentView, useCurrentViewContext } from 'context/useCurrentView';
import { writeFile, deleteFile } from 'file/write';
import { makeFileMeta, makeNote, mockInvoke } from '../../testUtils';
import Note from './Note';

// The real editor is exercised elsewhere; here we capture the props Note wires into it.
type EditorProps = Record<string, (...args: never[]) => unknown> & { value: string; readOnly: boolean; dir: string };
const editor = vi.hoisted(() => ({ props: undefined as unknown as EditorProps }));

vi.mock('mdsmirror', async (importOriginal) => {
  const actual = await importOriginal<typeof import('mdsmirror')>();
  const MockEditor = forwardRef((props: EditorProps, ref) => {
    editor.props = props;
    useImperativeHandle(ref, () => ({ getHeadings: () => [{ title: 'Heading', level: 1, id: 'heading' }] }));
    return <div data-testid="ms-editor">{props.value}</div>;
  });
  return { ...actual, default: MockEditor };
});
vi.mock('components/mindmap/mindmap', () => ({
  Mindmap: (props: { title: string }) => <div data-testid="mindmap">{props.title}</div>,
}));
vi.mock('file/write', () => ({
  writeFile: vi.fn(async () => undefined),
  deleteFile: vi.fn(async () => undefined),
  writeJsonFile: vi.fn(async () => undefined),
}));
vi.mock('copy-to-clipboard', () => ({ default: vi.fn() }));

const joinPaths = ({ root, parts }: Record<string, unknown>) => [root, ...(parts as string[])].join('/');
const dirOf = (p: string) => p.substring(0, p.lastIndexOf('/'));

const ViewProbe = () => {
  const { state } = useCurrentViewContext();
  return <p data-testid="view">{JSON.stringify(state)}</p>;
};
const viewState = () => JSON.parse(screen.getByTestId('view').textContent as string);

/** Call an editor callback inside act, since most of them update the store. */
async function callEditor(name: string, ...args: unknown[]) {
  let result: unknown;
  await act(async () => {
    result = await (editor.props[name] as (...a: unknown[]) => unknown)(...args);
  });
  return result;
}

const note = makeNote({ id: '/root/sub/My Note.md', title: 'My Note', content: '# Heading\n\nbody' });
const other = makeNote({ id: '/root/Other.md', title: 'Other', content: 'links [[My Note]]' });

function setup({ withInitDir = true } = {}) {
  store.getState().setNotes({ [note.id]: note, [other.id]: other });
  store.getState().setCurrentNote({ [note.id]: note });
  store.getState().setInitDir(withInitDir ? '/root' : undefined);
  store.getState().setIsLoaded(true);
  mockInvoke(invoke, {
    join_paths: joinPaths,
    get_dirpath: ({ path }: Record<string, unknown>) =>
      (path as string).endsWith('.md') ? dirOf(path as string) : path,
    get_basename: ({ filePath }: Record<string, unknown>) => [(filePath as string).split('/').pop(), false],
    get_parent_dir: ({ path }: Record<string, unknown>) => dirOf(path as string),
    file_exist: true,
    get_file_meta: ({ filePath }: Record<string, unknown>) =>
      makeFileMeta({
        file_path: filePath as string,
        file_name: (filePath as string).split('/').pop(),
        file_text: 'disk content',
        size: 42,
      }),
  });
  return render(
    <ProvideCurrentView>
      <div id="app-container">
        <Note noteId={note.id} />
        <ViewProbe />
      </div>
    </ProvideCurrentView>
  );
}

describe('Note', () => {
  test('shows a message for unknown notes', () => {
    render(
      <ProvideCurrentView>
        <Note noteId="/nope.md" />
      </ProvideCurrentView>
    );
    expect(screen.getByText('The note does not exist: /nope.md')).toBeInTheDocument();
  });

  test('renders title, relative path, editor and toc', async () => {
    setup();
    expect(screen.getByRole('textbox')).toHaveTextContent('My Note');
    expect(screen.getByText('root/sub/My Note.md')).toBeInTheDocument();
    expect(screen.getByTestId('ms-editor')).toHaveTextContent('# Heading');
    expect(editor.props.dir).toBe('ltr');
    expect(editor.props.readOnly).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: /Table of Contents/ }));
    expect(screen.getByText('Heading').closest('a')).toHaveAttribute('href', '#heading');
  });

  test('emits PageLoaded for the note', () => {
    const handler = vi.fn();
    document.addEventListener('PageLoaded', handler);
    setup();
    document.removeEventListener('PageLoaded', handler);
    expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({ id: note.id });
  });

  test('switches to raw markdown and mindmap modes', () => {
    setup();
    act(() => store.getState().setRawMode('raw'));
    expect(screen.queryByTestId('ms-editor')).not.toBeInTheDocument();
    expect(document.querySelector('.cm-theme-dark')).toBeInTheDocument();
    act(() => store.getState().setRawMode('mindmap'));
    expect(screen.getByTestId('mindmap')).toHaveTextContent('My Note');
  });

  test('writes content changes to disk', async () => {
    setup();
    await callEditor('onChange', 'new text', {});
    expect(writeFile).toHaveBeenCalledWith(note.id, 'new text');
  });

  test('search callbacks open the sidebar search', () => {
    setup();
    act(() => {
      editor.props.onSearchSelectText('needle' as never);
    });
    expect(store.getState().sidebarTab).toBe(SidebarTab.Search);
    expect(store.getState().sidebarSearchQuery).toBe('needle');
    expect(store.getState().sidebarSearchType).toBe('content');
    act(() => {
      editor.props.onClickHashtag('tag' as never);
    });
    expect(store.getState().sidebarSearchType).toBe('hashtag');
    expect(store.getState().isSidebarOpen).toBe(true);
  });

  test('onSearchLink returns encoded note titles', async () => {
    setup();
    const results = await callEditor('onSearchLink', 'My');
    expect(results).toEqual([{ title: 'My Note', url: 'My%20Note' }]);
  });

  test('onCreateLink reuses existing notes and creates new ones', async () => {
    setup();
    await expect(callEditor('onCreateLink', ' Other ')).resolves.toBe('Other');
    await expect(callEditor('onCreateLink', 'Brand New')).resolves.toBe('Brand%20New');
    const created = store.getState().notes['/root/sub/Brand New.md'];
    expect(created).toMatchObject({ title: 'Brand New', file_path: '/root/sub/Brand New.md' });
    expect(writeFile).toHaveBeenCalledWith('/root/sub/Brand New.md', ' ');
  });

  test('onOpenLink opens urls externally', async () => {
    setup();
    await callEditor('onOpenLink', 'https://mdsilo.com');
    expect(invoke).toHaveBeenCalledWith('open_url', { url: 'https://mdsilo.com' });
  });

  test('onOpenLink navigates to existing notes', async () => {
    setup();
    await callEditor('onOpenLink', 'Other');
    expect(viewState()).toEqual({ view: 'md', params: { noteId: other.id } });
  });

  test('onOpenLink creates missing notes', async () => {
    setup();
    await callEditor('onOpenLink', 'Fresh%20One');
    expect(viewState()).toEqual({ view: 'md', params: { noteId: '/root/sub/Fresh One.md' } });
  });

  test('onClickAttachment resolves relative paths against init dir', async () => {
    setup();
    await callEditor('onClickAttachment', './assets/a%20b.pdf');
    expect(invoke).toHaveBeenCalledWith('open_url', { url: '/root/assets/a b.pdf' });
  });

  test('attachFile copies into assets and describes the file', async () => {
    setup();
    vi.mocked(dialog.open).mockResolvedValueOnce('/pics/cat.png' as never);
    const base = vi.mocked(invoke).getMockImplementation();
    vi.mocked(invoke).mockImplementation(async (cmd: string, args?: unknown) =>
      cmd === 'copy_file_to_assets' ? ['/root/assets/cat.png', './assets/cat.png'] : base?.(cmd, args as never)
    );
    const attaches = await callEditor('attachFile', 'image/*');
    expect(invoke).toHaveBeenCalledWith('copy_file_to_assets', { srcPath: '/pics/cat.png', workDir: '/root' });
    expect(attaches).toEqual([{ type: 'image/png', name: 'cat.png', size: 42, src: './assets/cat.png' }]);
  });

  test('attachFile returns nothing when cancelled', async () => {
    setup();
    await expect(callEditor('attachFile', '*')).resolves.toEqual([]);
  });

  test('onSaveDiagram writes the decoded svg', async () => {
    setup();
    await callEditor('onSaveDiagram', '<svg>&copy;</svg>', 'mermaid');
    expect(writeFile).toHaveBeenCalledWith('/root/mindmap/My-Note-mermaid.svg', '<svg>©</svg>');
  });

  test('onCopyHash copies title plus hash', () => {
    setup();
    editor.props.onCopyHash('#intro' as never);
    expect(copy).toHaveBeenCalledWith('My Note#intro');
  });

  test('renaming the title moves the file and updates backlinks', async () => {
    setup({ withInitDir: false });
    const title = screen.getByRole('textbox');
    title.textContent = 'Renamed';
    await act(async () => {
      fireEvent.blur(title);
    });
    await waitFor(() => expect(viewState().params?.noteId).toBe('/root/sub/Renamed.md'));
    expect(deleteFile).toHaveBeenCalledWith(note.id);
    expect(writeFile).toHaveBeenCalledWith('/root/sub/Renamed.md', 'disk content');
    expect(store.getState().notes[note.id]).toBeUndefined();
    expect(store.getState().notes['/root/sub/Renamed.md'].title).toBe('Renamed');
    expect(store.getState().notes[other.id].content).toBe('links [[Renamed]]');
  });

  test('does not rename to an existing title', async () => {
    setup();
    const title = screen.getByRole('textbox');
    title.textContent = 'Other';
    await act(async () => {
      fireEvent.blur(title);
    });
    expect(deleteFile).not.toHaveBeenCalled();
  });

  test('toggles backlinks', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /BackLinks/ }));
    expect(await screen.findByText(/BackLinks$/, { selector: 'p' })).toBeInTheDocument();
  });

  test('clicking the path lists the parent dir', async () => {
    setup();
    store.getState().setCurrentDir('/root');
    await act(async () => {
      fireEvent.click(screen.getByText('root/sub/My Note.md'));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(store.getState().currentDir).toBe('/root/sub');
    expect(invoke).toHaveBeenCalledWith('get_parent_dir', { path: note.id });
  });
});
