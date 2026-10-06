import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import * as dialog from '@tauri-apps/plugin-dialog';
import { TbFolder } from 'react-icons/tb';
import { store, SidebarTab as SidebarTabType } from 'lib/store';
import { Sort } from 'lib/userSettings';
import { useCurrentViewContext } from 'context/useCurrentView';
import { makeFileMeta, makeNote, mockInvoke, mockLayout, renderWithView } from '../../testUtils';
import SidebarItem from './SidebarItem';
import SidebarTab from './SidebarTab';
import SidebarContent from './SidebarContent';
import SidebarNotes, { flattenNoteTree } from './SidebarNotes';
import SidebarNotesBar from './SidebarNotesBar';
import SidebarNotesSortDropdown from './SidebarNotesSortDropdown';
import SidebarHistory from './SidebarHistory';
import SidebarNoteLink from './SidebarNoteLink';
import SidebarTags from './SidebarTags';
import SidebarSearch, { matchSort, SearchTree } from './SidebarSearch';
import SidebarPlaylist, { computePlaylist } from './SidebarPlaylist';
import Sidebar from './Sidebar';
import StatusBar from './StatusBar';
import SideMenu from './SideMenu';

const ViewProbe = () => {
  const { state } = useCurrentViewContext();
  return <p data-testid="view">{JSON.stringify(state)}</p>;
};
const viewState = () => JSON.parse(screen.getByTestId('view').textContent as string);

const withContainer = (ui: JSX.Element) => <div id="app-container">{ui}</div>;

const treeItem = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  title,
  created_at: '2022-01-01T00:00:00.000Z',
  updated_at: '2022-01-01T00:00:00.000Z',
  is_dir: false,
  children: [],
  collapsed: true,
  ...extra,
});

beforeEach(() => {
  mockLayout();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('SidebarItem', () => {
  test('highlights and forwards props', () => {
    render(<SidebarItem isHighlighted data-testid="item">x</SidebarItem>);
    expect(screen.getByTestId('item')).toHaveClass('bg-gray-300');
  });
});

describe('SidebarTab', () => {
  test('marks active and calls setActive', async () => {
    const setActive = vi.fn();
    render(<SidebarTab isActive setActive={setActive} Icon={TbFolder} />);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('border-b-green-700');
    await userEvent.click(btn);
    expect(setActive).toHaveBeenCalled();
  });
});

describe('SidebarContent', () => {
  test('switches tabs', async () => {
    vi.mocked(invoke).mockResolvedValue([]);
    renderWithView(<SidebarContent />);
    expect(screen.getByText('Open Folder')).toBeInTheDocument();
    const tabs = screen.getAllByRole('button').slice(0, 4);
    await userEvent.click(tabs[1]);
    expect(store.getState().sidebarTab).toBe(SidebarTabType.Search);
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
    await userEvent.click(tabs[2]);
    expect(store.getState().sidebarTab).toBe(SidebarTabType.Hashtag);
    await userEvent.click(tabs[3]);
    expect(store.getState().sidebarTab).toBe(SidebarTabType.Playlist);
    await userEvent.click(tabs[0]);
    expect(store.getState().sidebarTab).toBe(SidebarTabType.Silo);
  });
});

describe('SidebarNotes', () => {
  test('shows open buttons and history without a dir', async () => {
    store.getState().setIsOpenPreOn(false);
    renderWithView(<SidebarNotes />);
    expect(screen.getByText('Open Folder')).toBeInTheDocument();
    expect(screen.getByText('Open File')).toBeInTheDocument();
    expect(screen.getByText('Recent History')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Open Folder'));
    expect(dialog.open).toHaveBeenCalledWith(expect.objectContaining({ directory: true }));
    await userEvent.click(screen.getByText('Open File'));
    expect(dialog.open).toHaveBeenCalledWith(expect.objectContaining({ directory: false }));
  });

  const seedTree = () => {
    store.getState().setCurrentDir('/n');
    store.getState().setNoteTree({
      '/n': [
        treeItem('/n/b.md', 'b', { created_at: '2022-01-03', updated_at: '2022-01-01' }),
        treeItem('/n/A.md', 'A', { created_at: '2022-01-01', updated_at: '2022-01-03' }),
        treeItem('/n/sub', 'sub', { is_dir: true, created_at: '2022-01-02', updated_at: '2022-01-02' }),
        treeItem('/n/c.md', 'c', { created_at: '2022-01-02', updated_at: '2022-01-02' }),
      ],
    });
  };
  const rowTitles = () =>
    Array.from(document.querySelectorAll('[role="button"] span.whitespace-nowrap')).map((e) => e.textContent);

  test.each([
    [Sort.TitleAscending, ['sub', 'A', 'b', 'c']],
    [Sort.TitleDescending, ['sub', 'c', 'b', 'A']],
    [Sort.DateCreatedAscending, ['sub', 'A', 'c', 'b']],
    [Sort.DateCreatedDescending, ['sub', 'b', 'c', 'A']],
    [Sort.DateModifiedAscending, ['sub', 'b', 'c', 'A']],
    [Sort.DateModifiedDescending, ['sub', 'A', 'c', 'b']],
  ])('sorts the tree by %s with dirs first', (sort, expected) => {
    seedTree();
    store.getState().setNoteSort(sort);
    renderWithView(withContainer(<SidebarNotes />));
    expect(rowTitles()).toEqual(expected);
    expect(screen.getByText('n: 4')).toBeInTheDocument();
  });

  test('shows expanded sub dirs as a nested tree', () => {
    seedTree();
    store.getState().setNoteSort(Sort.TitleAscending);
    store.getState().setNoteTree({
      ...store.getState().noteTree,
      '/n/sub': [
        treeItem('/n/sub/z.md', 'z'),
        treeItem('/n/sub/deep', 'deep', { is_dir: true }),
      ],
      '/n/sub/deep': [treeItem('/n/sub/deep/d.md', 'd')],
    });
    store.getState().setExpandedDirs({ '/n/sub': true });
    renderWithView(withContainer(<SidebarNotes />));
    expect(rowTitles()).toEqual(['sub', 'deep', 'z', 'A', 'b', 'c']);
    expect(screen.getByText('n: 4')).toBeInTheDocument();
  });

  test('flattens nested dirs with depth', () => {
    const tree = {
      '/n': [treeItem('/n/a.md', 'a'), treeItem('/n/sub', 'sub', { is_dir: true })],
      '/n/sub': [treeItem('/n/sub/deep', 'deep', { is_dir: true }), treeItem('/n/sub/b.md', 'b')],
      '/n/sub/deep': [treeItem('/n/sub/deep/c.md', 'c')],
    };
    const rows = flattenNoteTree(tree, '/n', { '/n/sub': true, '/n/sub/deep': true }, Sort.TitleAscending);
    expect(rows.map((r) => [r.node.title, r.depth, r.isExpanded])).toEqual([
      ['sub', 0, true],
      ['deep', 1, true],
      ['c', 2, false],
      ['b', 1, false],
      ['a', 0, false],
    ]);
    // collapsed dirs hide their children
    expect(flattenNoteTree(tree, '/n', { '/n/sub/deep': true }, Sort.TitleAscending).map((r) => r.node.title))
      .toEqual(['sub', 'a']);
  });
});

describe('SidebarNotesBar', () => {
  test('goes to the parent folder unless at the init dir', async () => {
    mockInvoke(invoke, { get_parent_dir: '/root', get_dirpath: '/root', file_exist: false });
    store.getState().setInitDir('/root');
    store.getState().setCurrentDir('/root/sub');
    renderWithView(withContainer(<SidebarNotesBar noteSort={Sort.TitleAscending} numOfNotes={2} />));
    expect(screen.getByText('sub: 2')).toBeInTheDocument();
    const up = screen.getAllByRole('button').at(-1) as HTMLButtonElement;
    expect(up).not.toBeDisabled();
    await act(async () => {
      fireEvent.click(up);
    });
    expect(store.getState().currentDir).toBe('/root');
  });

  test('is disabled at the init dir', () => {
    store.getState().setInitDir('/root');
    store.getState().setCurrentDir('/root');
    renderWithView(withContainer(<SidebarNotesBar noteSort={Sort.TitleAscending} numOfNotes={0} />));
    expect(screen.getAllByRole('button').at(-1)).toBeDisabled();
  });

  test('shows a plain label without a dir', () => {
    renderWithView(<SidebarNotesBar noteSort={Sort.TitleAscending} numOfNotes={0} />);
    expect(screen.getByText('md: 0')).toBeInTheDocument();
  });
});

describe('SidebarNotesSortDropdown', () => {
  test('lists sorts and selects one', async () => {
    const setCurrentSort = vi.fn();
    render(withContainer(<SidebarNotesSortDropdown currentSort={Sort.TitleAscending} setCurrentSort={setCurrentSort} />));
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getAllByRole('menuitem')).toHaveLength(6);
    await userEvent.click(screen.getByText('Created (new)'));
    expect(setCurrentSort).toHaveBeenCalledWith(Sort.DateCreatedDescending);
  });
});

describe('SidebarHistory', () => {
  test('lists recent dirs newest first and manages them', async () => {
    store.getState().setIsOpenPreOn(false);
    store.getState().setRecentDir(['/home/me/old', '/home/me/a/very/long/folder-name-here']);
    render(<SidebarHistory />);
    expect(screen.getByText('No Pinned Folder')).toBeInTheDocument();
    const labels = screen.getAllByText(/^(~|\.\.\.)/).map((e) => e.textContent);
    expect(labels).toEqual(['...ong/folder-name-here', '~/me/old']);

    const [pin, , del] = screen.getAllByRole('button').slice(0, 3);
    await userEvent.click(pin);
    expect(store.getState().pinnedDir).toBe('/home/me/a/very/long/folder-name-here');
    await userEvent.click(del);
    expect(store.getState().recentDir).toEqual(['/home/me/old']);
    await userEvent.click(screen.getByText('Clear History'));
    expect(store.getState().recentDir).toEqual([]);
  });

  test('opens a recent dir on click', async () => {
    store.getState().setIsOpenPreOn(false);
    store.getState().setRecentDir(['/home/me/notes']);
    store.getState().setPinnedDir('/home/me/pinned');
    render(<SidebarHistory />);
    await act(async () => {
      fireEvent.click(screen.getByText('~/me/notes'));
    });
    expect(store.getState().initDir).toBe('/home/me/notes');
    await act(async () => {
      fireEvent.click(screen.getByText('~/me/pinned'));
    });
    expect(store.getState().initDir).toBe('/home/me/pinned');
  });

  test('reopens the previous folder only once', async () => {
    mockInvoke(invoke, { file_exist: false });
    store.getState().setRecentDir(['/home/me/last']);
    await act(async () => {
      render(<SidebarHistory />);
    });
    expect(store.getState().initDir).toBe('/home/me/last');
    expect(vi.mocked(invoke).mock.calls.filter((c) => c[0] === 'write_json')).toHaveLength(1);
  });

  test('reopens the previous folder on startup', async () => {
    // rendered through SidebarNotes, which unmounts the history once a dir is open
    mockInvoke(invoke, { file_exist: false });
    store.getState().setRecentDir(['/home/me/last']);
    await act(async () => {
      renderWithView(<SidebarNotes />);
    });
    expect(store.getState().initDir).toBe('/home/me/last');
    expect(invoke).toHaveBeenCalledWith('write_json', { dir: '/home/me/last' });
  });
});

describe('SidebarNoteLink', () => {
  test('opens md notes', async () => {
    mockInvoke(invoke, {
      file_exist: true,
      get_file_meta: makeFileMeta({ file_path: '/n/a.md', file_name: 'a.md' }),
      get_parent_dir: '/n',
    });
    renderWithView(withContainer(<><SidebarNoteLink node={treeItem('/n/a.md', 'a')} isHighlighted /><ViewProbe /></>));
    await userEvent.click(screen.getByText('a'));
    await waitFor(() => expect(viewState().params?.noteId).toBe('/n/a.md'));
  });

  test('opens other files externally', async () => {
    renderWithView(<SidebarNoteLink node={treeItem('/n/pic.png', 'pic.png')} />);
    await userEvent.click(screen.getByText('pic.png'));
    expect(invoke).toHaveBeenCalledWith('open_url', { url: '/n/pic.png' });
  });

  test('expands and collapses dirs in place', async () => {
    store.getState().setCurrentDir('/n');
    store.getState().setNoteTree({ '/n/sub': [] });
    renderWithView(withContainer(<SidebarNoteLink node={treeItem('/n/sub', 'sub', { is_dir: true })} />));
    await act(async () => {
      fireEvent.click(screen.getByText('sub'));
    });
    expect(store.getState().expandedDirs['/n/sub']).toBe(true);
    expect(store.getState().currentDir).toBe('/n');
  });

  test('collapses an expanded dir', async () => {
    store.getState().setExpandedDirs({ '/n/sub': true });
    renderWithView(withContainer(<SidebarNoteLink node={treeItem('/n/sub', 'sub', { is_dir: true })} isExpanded />));
    await act(async () => {
      fireEvent.click(screen.getByText('sub'));
    });
    expect(store.getState().expandedDirs['/n/sub']).toBeUndefined();
  });

  test('dir dropdown opens the folder as current dir', async () => {
    mockInvoke(invoke, { get_dirpath: '/n/sub', file_exist: false });
    renderWithView(withContainer(<SidebarNoteLink node={treeItem('/n/sub', 'sub', { is_dir: true })} />));
    await userEvent.click(screen.getAllByRole('button').at(-1) as HTMLElement);
    await act(async () => {
      fireEvent.click(screen.getByText('Open Folder Here'));
    });
    await waitFor(() => expect(store.getState().currentDir).toBe('/n/sub'));
  });

  test('note dropdown offers move to', async () => {
    const note = makeNote({ id: '/n/a.md', title: 'a' });
    store.getState().setNotes({ [note.id]: note });
    store.getState().setIsLoaded(true);
    renderWithView(withContainer(<SidebarNoteLink node={treeItem('/n/a.md', 'a')} />));
    await userEvent.click(screen.getAllByRole('button').at(-1) as HTMLElement);
    await userEvent.click(screen.getByText('Move to'));
    expect(screen.getByPlaceholderText('Search to move to')).toBeInTheDocument();
  });

  test.each([
    ['New Subfolder', 'Create New Subfolder'],
    ['Rename', 'Rename the folder'],
    ['Delete', 'Delete This Folder?'],
  ])('dir dropdown %s opens its modal', async (item, title) => {
    renderWithView(withContainer(<SidebarNoteLink node={treeItem('/n/sub', 'sub', { is_dir: true })} />));
    await userEvent.click(screen.getAllByRole('button').at(-1) as HTMLElement);
    await userEvent.click(screen.getByText(item));
    expect(await screen.findByText(title)).toBeInTheDocument();
  });
});

describe('SidebarTags', () => {
  test('counts hashtags and opens the tag view', async () => {
    const a = makeNote({ id: '/a.md', content: 'x #todo# y #idea# #todo# z' });
    const b = makeNote({ id: '/b.md', content: 'p #todo# q' });
    const dir = makeNote({ id: '/d', content: ' #hidden# ', is_dir: true });
    store.getState().setNotes({ [a.id]: a, [b.id]: b, [dir.id]: dir });
    renderWithView(<><SidebarTags /><ViewProbe /></>);
    const todo = screen.getByText('todo');
    expect(todo.parentElement?.nextSibling).toHaveTextContent('3');
    expect(screen.getByText('idea')).toBeInTheDocument();
    expect(screen.queryByText('hidden')).not.toBeInTheDocument();
    await userEvent.click(todo);
    expect(viewState()).toEqual({ view: 'tag', tag: 'todo' });
  });

  test('renders nothing without tags', () => {
    renderWithView(<SidebarTags />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('SidebarSearch', () => {
  const seed = () => {
    const a = makeNote({ id: '/n/a.md', title: 'apple', content: 'red fruit\n\nsweet #fruit# here' });
    const b = makeNote({ id: '/n/b.md', title: 'banana', content: 'yellow' });
    store.getState().setNotes({ [a.id]: a, [b.id]: b });
    store.getState().setIsLoaded(true);
  };

  test('searches content on Enter and opens a match', async () => {
    seed();
    mockInvoke(invoke, {
      file_exist: true,
      get_file_meta: makeFileMeta({ file_path: '/n/a.md', file_name: 'a.md' }),
      get_parent_dir: '/n',
    });
    renderWithView(<><SidebarSearch /><ViewProbe /></>);
    await userEvent.type(screen.getByPlaceholderText('Search...'), 'fruit{enter}');
    expect(store.getState().sidebarSearchQuery).toBe('fruit');
    expect(await screen.findByText('apple')).toBeInTheDocument();
    const marks = document.querySelectorAll('mark');
    expect(marks.length).toBeGreaterThan(0);
    await userEvent.click(marks[0].closest('button') as HTMLElement);
    await waitFor(() => expect(viewState().params).toEqual({ noteId: '/n/a.md', hash: '0-' }));
  });

  test('shows no results', async () => {
    seed();
    renderWithView(<SearchTree keyword="zzz" ty="content" />);
    expect(screen.getByText('No results found.')).toBeInTheDocument();
  });

  test('searches hashtags', () => {
    seed();
    renderWithView(<SearchTree keyword="fruit" ty="hashtag" />);
    expect(screen.getByText('apple')).toBeInTheDocument();
    expect(screen.queryByText('banana')).not.toBeInTheDocument();
  });

  test('matchSort orders by refIndex with undefined first', () => {
    const m = (refIndex?: number) => ({ refIndex, indices: [] as never, value: '' });
    expect([m(2), m(), m(0)].sort(matchSort).map((x) => x.refIndex)).toEqual([undefined, 0, 2]);
    expect(matchSort(m(), m())).toBe(0);
  });
});

describe('SidebarPlaylist', () => {
  const articles = [
    { title: 'Beta', audio_url: 'b.mp3', url: 'b', feed_link: 'f', published: '2022-01-02' },
    { title: 'alpha', audio_url: 'a.mp3', url: 'a', feed_link: 'f', published: '2022-01-01' },
    { title: 'Text only', audio_url: '  ', url: 't', feed_link: 'f' },
  ];

  test('computePlaylist keeps audio articles', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(articles);
    const list = await computePlaylist();
    expect(invoke).toHaveBeenCalledWith('get_articles', { feedLink: null, readStatus: null, starStatus: null });
    expect(list).toEqual([
      { title: 'Beta', url: 'b.mp3', published: '2022-01-02', article_url: 'b', feed_link: 'f' },
      { title: 'alpha', url: 'a.mp3', published: '2022-01-01', article_url: 'a', feed_link: 'f' },
    ]);
  });

  const titles = async () => (await screen.findAllByText(/^(alpha|Beta)$/)).map((e) => e.textContent);

  test('renders newest first and selects pods', async () => {
    vi.mocked(invoke).mockResolvedValue(articles);
    render(<SidebarPlaylist />);
    expect(await titles()).toEqual(['Beta', 'alpha']);
    await userEvent.click(screen.getByText('alpha'));
    expect(store.getState().currentPod?.url).toBe('a.mp3');
  });

  test('re-sorts when a sort button is clicked', async () => {
    vi.mocked(invoke).mockResolvedValue(articles);
    render(<SidebarPlaylist />);
    expect(await titles()).toEqual(['Beta', 'alpha']);
    await userEvent.click(screen.getByText('A-Z'));
    expect(await titles()).toEqual(['alpha', 'Beta']);
    await userEvent.click(screen.getByText('Z-A'));
    expect(await titles()).toEqual(['Beta', 'alpha']);
    await userEvent.click(screen.getByText('Old'));
    expect(await titles()).toEqual(['alpha', 'Beta']);
  });
});

describe('Sidebar', () => {
  test('renders content when open', async () => {
    vi.mocked(invoke).mockResolvedValue([]);
    store.getState().setIsOpenPreOn(false);
    renderWithView(<Sidebar />);
    expect(screen.getByText('Open Folder')).toBeInTheDocument();
  });

  test('renders a closable backdrop on mobile', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });
    store.getState().setIsOpenPreOn(false);
    const { container } = renderWithView(<Sidebar />);
    fireEvent.click(container.querySelector('.fixed.inset-0') as Element);
    expect(store.getState().isSidebarOpen).toBe(false);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
  });
});

describe('StatusBar', () => {
  test('shows the current pod and jumps to its article', async () => {
    const article = { id: 1, title: 'Ep 1', url: 'https://pod/1' };
    mockInvoke(invoke, { get_article_by_url: article, get_articles: [] });
    store.getState().setCurrentPod({ title: 'Ep 1', url: 'ep1.mp3', article_url: 'https://pod/1', feed_link: 'f' });
    renderWithView(<><StatusBar /><ViewProbe /></>);
    expect(document.querySelector('audio')).toHaveAttribute('src', 'ep1.mp3');
    await userEvent.click(screen.getByText('Ep 1'));
    await waitFor(() => expect(viewState().view).toBe('feed'));
    expect(store.getState().currentArticle).toEqual(article);
  });

  test('toggles visibility of the player', async () => {
    mockInvoke(invoke, { get_articles: [] });
    store.getState().setCurrentPod({ title: 'Ep 1', url: 'ep1.mp3', article_url: 'a', feed_link: 'f' });
    renderWithView(<StatusBar />);
    await userEvent.click(screen.getAllByRole('button')[0]);
    expect(screen.getByText('Ep 1').parentElement).toHaveClass('hidden');
  });
});

describe('SideMenu', () => {
  test('logo menu opens settings, about, and local folder actions', async () => {
    mockInvoke(invoke, { create_mdsilo_dir: '/home/me/mdsilo' });
    renderWithView(withContainer(<SideMenu />));

    const logoButton = screen.getByRole('button', { name: 'mdSilo' });
    await userEvent.click(logoButton);
    expect(screen.getByText('Website').closest('a')).toHaveAttribute('href', 'https://mdsilo.com');
    await userEvent.click(screen.getByText('Settings'));
    expect(store.getState().isSettingsOpen).toBe(true);

    await userEvent.click(logoButton);
    await userEvent.click(screen.getByText('About'));
    expect(store.getState().isAboutOpen).toBe(true);

    await userEvent.click(logoButton);
    await userEvent.click(screen.getByText('Local mdsilo'));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('open_url', { url: '/home/me/mdsilo' }));
  });

  test('shows view buttons only with a dir and dispatches views', async () => {
    const { unmount } = renderWithView(withContainer(<SideMenu />));
    expect(document.querySelectorAll('#side-menu-btns button')).toHaveLength(4);
    unmount();

    store.getState().setCurrentDir('/n');
    renderWithView(withContainer(<><SideMenu /><ViewProbe /></>));
    const btns = Array.from(document.querySelectorAll('#side-menu-btns button')) as HTMLElement[];
    // logo, toggle, feed, new, issues, projects, chronicle, graph, file
    expect(btns).toHaveLength(9);
    await userEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));
    expect(store.getState().isSidebarOpen).toBe(false);
    await userEvent.click(btns[2]);
    expect(viewState().view).toBe('feed');
    await userEvent.click(btns[3]);
    expect(store.getState().isFindOrCreateModalOpen).toBe(true);
    for (const [i, view] of [[4, 'issues'], [5, 'project'], [6, 'chronicle'], [7, 'graph']] as const) {
      await userEvent.click(btns[i]);
      expect(viewState().view).toBe(view);
    }
  });

  test('hotkeys switch views', () => {
    renderWithView(withContainer(<><SideMenu /><ViewProbe /></>));
    const press = (key: string, keyCode: number) =>
      fireEvent.keyDown(document, { key, keyCode, which: keyCode, ctrlKey: true, shiftKey: true });
    for (const [key, code, view] of [
      ['g', 71, 'graph'],
      ['c', 67, 'chronicle'],
      ['k', 75, 'project'],
      ['i', 73, 'issues'],
      ['r', 82, 'feed'],
    ] as const) {
      act(() => {
        press(key, code);
      });
      expect(viewState().view).toBe(view);
    }
    act(() => {
      press('t', 84);
    });
    expect(viewState()).toEqual({ view: 'issues', issuesTab: 'tasks' });
  });

  test('settings button and file menu', async () => {
    renderWithView(withContainer(<SideMenu />));
    const buttons = screen.getAllByRole('button');
    await userEvent.click(buttons.at(-1) as HTMLElement);
    expect(store.getState().isSettingsOpen).toBe(true);

    const menus = document.querySelectorAll('#side-menu-btns [aria-haspopup="menu"]');
    await userEvent.click(menus[1] as HTMLElement);
    for (const label of ['Open Folder', 'Open File', 'Import JSON', 'Recent', 'Save']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    act(() => store.getState().setCurrentDir('/n'));
    await userEvent.click(screen.getByText('Recent'));
    expect(store.getState().showHistory).toBe(true);
    expect(store.getState().currentDir).toBeUndefined();
  });
});
