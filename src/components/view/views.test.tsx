import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { store } from 'lib/store';
import { ProvideCurrentView, useCurrentViewContext } from 'context/useCurrentView';
import type { ViewAction } from 'context/viewReducer';
import { getStrDate } from 'utils/helper';
import { makeFileMeta, makeNote, mockInvoke, mockLayout } from '../../testUtils';
import MainView from './MainView';
import HeatMap from './HeatMap';
import Chronicle from './chronicle';
import Journals from './journals';
import Tasks from './tasks';
import Graph from './graph';
import { LINK_REGEX, WIKILINK_REGEX, HASHTAG_REGEX } from './ForceGraph';

const Controls = ({ children }: { children: ReactNode }) => {
  const { state, dispatch } = useCurrentViewContext();
  return (
    <>
      <p data-testid="view">{JSON.stringify(state)}</p>
      <button data-testid="go" onClick={(e) => dispatch(JSON.parse((e.target as HTMLElement).dataset.action as string))} />
      {children}
    </>
  );
};
const renderView = (ui: JSX.Element) =>
  render(
    <ProvideCurrentView>
      <div id="app-container">
        <Controls>{ui}</Controls>
      </div>
    </ProvideCurrentView>
  );
const go = async (action: ViewAction) => {
  const btn = screen.getByTestId('go');
  btn.dataset.action = JSON.stringify(action);
  await act(async () => {
    fireEvent.click(btn);
  });
};
const viewState = () => JSON.parse(screen.getByTestId('view').textContent as string);

const today = () => getStrDate(new Date().toString());

describe('graph regexes', () => {
  test('LINK_REGEX captures label and href', () => {
    const m = [...'a [x](y) b [z](https://w)'.matchAll(LINK_REGEX)];
    expect(m.map((x) => [x[1], x[2]])).toEqual([['x', 'y'], ['z', 'https://w']]);
  });

  test('WIKILINK_REGEX captures the title', () => {
    expect([...'see [[My Note]].'.matchAll(WIKILINK_REGEX)].map((x) => x[1])).toEqual(['My Note']);
  });

  test('HASHTAG_REGEX needs surrounding whitespace', () => {
    expect([...'a #tag# b'.matchAll(HASHTAG_REGEX)].map((x) => x[1])).toEqual(['tag']);
    expect([...'a#tag# b'.matchAll(HASHTAG_REGEX)]).toHaveLength(0);
  });

  test('HASHTAG_REGEX finds several tags on one line, including adjacent ones', () => {
    const tags = [...'x #one# y #two words# #three# z'.matchAll(HASHTAG_REGEX)].map((x) => x[1]);
    expect(tags).toEqual(['one', 'two words', 'three']);
    expect([...'a #not\nclosed# b'.matchAll(HASHTAG_REGEX)]).toHaveLength(0);
  });
});

describe('MainView', () => {
  beforeEach(() => {
    mockInvoke(invoke, { get_channels: [], get_unread_num: {}, get_articles: [] });
  });

  test('shows the welcome page by default', () => {
    renderView(<MainView />);
    expect(screen.getByText('Hello, welcome to mdSilo Desktop.')).toBeInTheDocument();
  });

  test.each([
    [{ view: 'chronicle' }, 'Journals'],
    [{ view: 'task' }, 'PER NOTE'],
    [{ view: 'journal' }, null],
    [{ view: 'tag', tag: 'idea' }, '#idea'],
    [{ view: 'md', params: { noteId: '' } }, 'This note does not exists!'],
    [{ view: 'md', params: { noteId: '/x.md' } }, 'The note does not exist: /x.md'],
  ] as [ViewAction, string | null][])('routes %j', async (action, text) => {
    renderView(<MainView />);
    await go(action);
    expect(screen.queryByText('Hello, welcome to mdSilo Desktop.')).not.toBeInTheDocument();
    if (text) expect(screen.getByText(text)).toBeInTheDocument();
  });

  test('routes feed, projects and graph', async () => {
    renderView(<MainView />);
    await go({ view: 'feed' });
    expect(screen.getByText('Starred')).toBeInTheDocument();
    await go({ view: 'graph' });
    expect(screen.getByTestId('graph-canvas')).toBeInTheDocument();
    await go({ view: 'project' });
    expect(screen.getByText('Open a folder to use projects.')).toBeInTheDocument();
  });
});

describe('HeatMap', () => {
  test('renders a year of cells and colours activity', () => {
    const now = new Date().toISOString();
    const notes = Array.from({ length: 6 }, (_, i) => makeNote({ id: `/n/${i}.md`, created_at: now, updated_at: now }));
    const { container } = render(<HeatMap noteList={notes} onClickCell={vi.fn()} />);
    expect(container.querySelectorAll('rect')).toHaveLength(53 * 7);
    // 6 created + 6 updated today => 12 activities
    expect(container.querySelectorAll('rect.fill-green-500')).toHaveLength(1);
    expect(screen.getByText(/Activity: 12/)).toBeInTheDocument();
    expect(store.getState().activities[today()]).toEqual({ activityNum: 12, createNum: 6, updateNum: 6 });
  });

  test('merges stored activities and reports clicked dates', async () => {
    store.getState().setActivities({ [today()]: { activityNum: 7, createNum: 3, updateNum: 4 } });
    const onClickCell = vi.fn();
    const { container } = render(<HeatMap noteList={[]} onClickCell={onClickCell} />);
    expect(container.querySelectorAll('rect.fill-cyan-500')).toHaveLength(1);
    const todayRect = container.querySelector('rect.fill-cyan-500') as SVGRectElement;
    await userEvent.click(todayRect);
    expect(onClickCell).toHaveBeenCalledWith(today());
  });

  test('labels twelve months', () => {
    const { container } = render(<HeatMap noteList={[]} onClickCell={vi.fn()} />);
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const months = Array.from(container.querySelectorAll('text')).map((t) => t.textContent).filter((t) => names.includes(t as string));
    expect(new Set(months).size).toBe(12);
  });
});

describe('Chronicle', () => {
  test('lists recently updated notes by date', () => {
    store.getState().setIsLoaded(true);
    const a = makeNote({ id: '/n/a.md', title: 'Alpha', updated_at: '2022-03-05T12:00:00' });
    const daily = makeNote({ id: '/n/2022-03-05.md', title: '2022-03-05', is_daily: true, updated_at: '2022-03-05T12:00:00' });
    store.getState().setNotes({ [a.id]: a, [daily.id]: daily });
    renderView(<Chronicle />);
    expect(screen.getByText('2022-3-5')).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByText('2022-03-05')).not.toBeInTheDocument();
  });

  test('opens the journal view', async () => {
    renderView(<Chronicle />);
    await userEvent.click(screen.getByText('Journals'));
    expect(viewState().view).toBe('journal');
  });

  test('creates today\'s daily note when missing', async () => {
    store.getState().setInitDir('/root');
    store.getState().setIsLoaded(true);
    mockInvoke(invoke, {
      join_paths: ({ root, parts }: Record<string, unknown>) => [root, ...(parts as string[])].join('/'),
      file_exist: false,
    });
    renderView(<Chronicle />);
    await act(async () => {
      fireEvent.click(screen.getByText(`Today : ${today()}`));
    });
    const id = `/root/daily/${today()}.md`;
    await waitFor(() => expect(viewState()).toEqual({ view: 'md', params: { noteId: id } }));
    expect(store.getState().notes[id]).toMatchObject({ title: today(), is_daily: true });
    expect(store.getState().noteTree['/root'].map((i) => i.id)).toEqual(['/root/daily']);
    expect(store.getState().currentNote[id]).toBeDefined();
  });

  test('opens an existing daily note', async () => {
    store.getState().setInitDir('/root');
    store.getState().setIsLoaded(true);
    mockInvoke(invoke, {
      join_paths: ({ root, parts }: Record<string, unknown>) => [root, ...(parts as string[])].join('/'),
      file_exist: true,
      get_file_meta: ({ filePath }: Record<string, unknown>) =>
        makeFileMeta({ file_path: filePath as string, file_name: `${today()}.md` }),
      get_parent_dir: ({ path }: Record<string, unknown>) => (path as string).substring(0, (path as string).lastIndexOf('/')),
      get_basename: ({ filePath }: Record<string, unknown>) => [(filePath as string).split('/').pop(), false],
    });
    renderView(<Chronicle />);
    await act(async () => {
      fireEvent.click(screen.getByText(`Today : ${today()}`));
    });
    await waitFor(() => expect(viewState().view).toBe('md'));
    expect(store.getState().notes[`/root/daily/${today()}.md`].content).toBe('');
  });

  test('loads the init dir when not loaded', async () => {
    store.getState().setInitDir('/root');
    await act(async () => {
      renderView(<Chronicle />);
    });
    expect(invoke).toHaveBeenCalledWith('write_json', { dir: '/root' });
  });
});

describe('Journals', () => {
  test('lists daily notes newest first and opens them', async () => {
    const d1 = makeNote({ id: '/d/2022-01-01.md', title: '2022-01-01', content: 'first day' });
    const d2 = makeNote({ id: '/d/2022-02-01.md', title: '2022-02-01', content: 'second day' });
    const other = makeNote({ id: '/d/other.md', title: 'other' });
    store.getState().setNotes({ [d1.id]: d1, [d2.id]: d2, [other.id]: other });
    store.getState().setInitDir('/d');
    store.getState().setIsLoaded(true);
    mockInvoke(invoke, { file_exist: false });
    renderView(<Journals />);
    const titles = screen.getAllByText(/^2022-/).map((e) => e.textContent);
    expect(titles).toEqual(['2022-02-01', '2022-01-01']);
    expect(screen.getByText('first day')).toBeInTheDocument();
    expect(screen.queryByText('other')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('new or find')).toBeInTheDocument();
    await userEvent.click(screen.getByText('2022-01-01'));
    await waitFor(() => expect(viewState().params?.noteId).toBe(d1.id));
  });
});

describe('Tasks', () => {
  const seed = () => {
    const a = makeNote({ id: '/n/a.md', title: 'Alpha', content: '- [ ] write tests\n- [x] read code\n' });
    const b = makeNote({ id: '/n/b.md', title: 'Beta', content: 'Working on it #doing# today\n\nLater #todo# stuff' });
    store.getState().setNotes({ [a.id]: a, [b.id]: b });
    store.getState().setIsLoaded(true);
  };

  test('groups checkbox tasks per note', () => {
    seed();
    renderView(<Tasks />);
    expect(screen.getByText(/: Alpha$/)).toBeInTheDocument();
    expect(screen.getByText('write tests')).toBeInTheDocument();
    expect(screen.getByText('read code')).toBeInTheDocument();
  });

  test('switches to per completion', async () => {
    seed();
    renderView(<Tasks />);
    await userEvent.click(screen.getByText('PER COMPLETION'));
    expect(screen.getByText('PER COMPLETION')).toHaveClass('text-red-500');
    expect(screen.getByText(/write tests/)).toBeInTheDocument();
  });

  test('lists hashtag tasks and collapses others', async () => {
    seed();
    renderView(<Tasks />);
    expect(screen.getByText('Doing')).toBeInTheDocument();
    expect(screen.getAllByText(/: Beta$/)).toHaveLength(2);
    await userEvent.click(screen.getByText('#doing'));
    expect(screen.getAllByText(/: Beta$/)).toHaveLength(1);
  });

  test('opens a note from its task group', async () => {
    seed();
    mockInvoke(invoke, {
      file_exist: true,
      get_file_meta: makeFileMeta({ file_path: '/n/a.md', file_name: 'a.md' }),
      get_parent_dir: '/n',
    });
    renderView(<Tasks />);
    await userEvent.click(screen.getByText(/: Alpha$/));
    await waitFor(() => expect(viewState().params?.noteId).toBe('/n/a.md'));
  });
});

describe('Graph / ForceGraph', () => {
  type Ctx = Record<string, ReturnType<typeof vi.fn>> & { canvas: HTMLCanvasElement };
  let ctx: Ctx;

  beforeEach(() => {
    mockLayout();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      if (!ctx || ctx.canvas !== this) {
        ctx = new Proxy({ canvas: this } as Ctx, {
          get(target, prop: string) {
            if (prop in target) return target[prop];
            target[prop] = prop === 'measureText' ? vi.fn((t: string) => ({ width: t.length * 6 })) : vi.fn();
            return target[prop];
          },
          set(target, prop: string, value) {
            target[prop] = value;
            return true;
          },
        });
      }
      return ctx as unknown as CanvasRenderingContext2D;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const seed = () => {
    const a = makeNote({ id: '/n/a.md', title: 'Alpha', content: 'to [[Beta]] and [b](Beta) #topic# end' });
    const b = makeNote({ id: '/n/b.md', title: 'Beta', content: 'plain' });
    const pic = makeNote({ id: '/n/pic.png', title: 'pic.png' });
    store.getState().setNotes({ [a.id]: a, [b.id]: b, [pic.id]: pic });
    store.getState().setIsLoaded(true);
  };

  const drawnText = () => new Set((ctx.fillText?.mock.calls ?? []).map((c) => c[0]));

  test('draws note and tag nodes with links', async () => {
    seed();
    renderView(<Graph />);
    await waitFor(() => expect(drawnText()).toEqual(new Set(['Alpha', 'Beta', '#topic'])));
    expect(ctx.arc).toHaveBeenCalled();
    expect(ctx.lineTo).toHaveBeenCalled();
  });

  test('clicking a note node opens it', async () => {
    const a = makeNote({ id: '/n/a.md', title: 'Alpha' });
    store.getState().setNotes({ [a.id]: a });
    store.getState().setIsLoaded(true);
    mockInvoke(invoke, {
      file_exist: true,
      get_file_meta: makeFileMeta({ file_path: '/n/a.md', file_name: 'a.md' }),
      get_parent_dir: '/n',
    });
    renderView(<Graph />);
    await waitFor(() => expect(ctx.arc).toHaveBeenCalled());
    // wait for the single node to settle at the centre
    await new Promise((r) => setTimeout(r, 300));
    const [x, y] = ctx.arc.mock.calls.at(-1) as number[];
    const canvas = screen.getByTestId('graph-canvas');
    fireEvent.mouseMove(canvas, { clientX: x, clientY: y });
    expect(canvas.style.cursor).toBe('pointer');
    fireEvent.click(canvas, { clientX: x, clientY: y });
    await waitFor(() => expect(viewState().params?.noteId).toBe('/n/a.md'));
    fireEvent.mouseMove(canvas, { clientX: x + 500, clientY: y + 500 });
    expect(canvas.style.cursor).toBe('default');
  });

  test('loads the init dir when not loaded', async () => {
    store.getState().setInitDir('/root');
    await act(async () => {
      renderView(<Graph />);
    });
    expect(invoke).toHaveBeenCalledWith('write_json', { dir: '/root' });
  });
});
