import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { store } from 'lib/store';
import { useCurrentViewContext } from 'context/useCurrentView';
import MainView from 'components/view/MainView';
import { makeNote, renderWithView } from '../../testUtils';
import * as ops from './issueOps';
import { issueStore, resetIssueStore } from './issueStore';
import { boardColumns, dragEndOp, dropTarget } from './project/ProjectBoard';
import { timeAgo } from './common';
import { textColorFor } from './LabelChip';
import type { IssueData } from './types';

const files = vi.hoisted(() => ({ written: [] as { path: string; text: string }[] }));
const editors = vi.hoisted(() => ({ props: {} as Record<string, Record<string, (...a: never[]) => unknown>> }));

vi.mock('file/files', () => ({
  default: class {
    fileName: string;
    constructor(name: string, parent?: string) {
      this.fileName = parent ? `${parent}/${name}` : name;
    }
    async readFile() { return ''; }
    async writeFile(text: string) { files.written.push({ path: this.fileName, text }); }
  },
}));

// a textarea stands in for the ProseMirror editor
vi.mock('mdsmirror', async (importOriginal) => {
  const actual = await importOriginal<typeof import('mdsmirror')>();
  const MockEditor = (props: Record<string, unknown>) => {
    const name = (props.placeholder as string) || 'editor';
    editors.props[name] = props as never;
    return (
      <textarea
        aria-label={name}
        defaultValue={props.value as string}
        readOnly={props.readOnly as boolean}
        onChange={(e) => (props.onChange as ((t: string) => void) | undefined)?.(e.target.value)}
      />
    );
  };
  return { ...actual, default: MockEditor };
});

vi.mock('file/open', async (importOriginal) => ({
  ...(await importOriginal<typeof import('file/open')>()),
  openFilePath: vi.fn(async (id: string) => store.getState().notes[id]),
  openUrl: vi.fn(async () => undefined),
}));

const ViewProbe = () => {
  const { state, dispatch } = useCurrentViewContext();
  return (
    <>
      <p data-testid="view">{JSON.stringify(state)}</p>
      <button type="button" data-testid="goto" onClick={(e) => dispatch(JSON.parse((e.target as HTMLElement).dataset.view!))} />
    </>
  );
};
const viewState = () => JSON.parse(screen.getByTestId('view').textContent as string);
async function go(view: object) {
  const btn = screen.getByTestId('goto');
  btn.dataset.view = JSON.stringify(view);
  await act(async () => { fireEvent.click(btn); });
}
const data = () => issueStore.getState().data;
const labelId = (name: string) => data().labels.find((l) => l.name === name)!.id;

function seed(build: (d: IssueData) => IssueData = (d) => d) {
  store.getState().setInitDir('/w');
  store.getState().setCurrentDir('/w');
  store.getState().setIsLoaded(true);
  issueStore.setState({ data: build(ops.defaultIssueData()), dir: '/w', isLoaded: true });
}

function renderApp(view: object) {
  renderWithView(<><MainView /><ViewProbe /></>);
  return go(view);
}

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup(); // unmount before resetting the store
  resetIssueStore();
  files.written = [];
  editors.props = {};
  vi.restoreAllMocks();
});

describe('helpers', () => {
  test('timeAgo and label text color', () => {
    const now = Date.parse('2026-01-10T00:00:00Z');
    expect(timeAgo('2026-01-10T00:00:00Z', now)).toBe('just now');
    expect(timeAgo('2026-01-09T23:59:59Z', now)).toBe('1 second ago');
    expect(timeAgo('2026-01-09T23:58:00Z', now)).toBe('2 minutes ago');
    expect(timeAgo('2026-01-09T21:00:00Z', now)).toBe('3 hours ago');
    expect(timeAgo('2026-01-05T00:00:00Z', now)).toBe('5 days ago');
    expect(timeAgo('2025-01-05T00:00:00Z', now)).toMatch(/^on /);
    expect(timeAgo('nope', now)).toBe('');
    expect(textColorFor('#ffffff')).toBe('#000');
    expect(textColorFor('#000')).toBe('#fff');
    expect(textColorFor('bad')).toBe('#000');
  });
});

describe('Issues view', () => {
  test('needs an open folder', async () => {
    await renderApp({ view: 'issues' });
    expect(screen.getByText('Open a folder to track issues.')).toBeInTheDocument();
  });

  test('creates an issue and opens it', async () => {
    seed();
    await renderApp({ view: 'issues' });
    expect(screen.getByText(/No issues yet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'New issue' }));
    await userEvent.type(screen.getByLabelText('New issue title'), 'First bug');
    fireEvent.change(screen.getByLabelText(/Add a description/), { target: { value: 'body [[Note]]' } });
    await userEvent.click(screen.getByRole('button', { name: 'Submit new issue' }));
    expect(viewState()).toEqual({ view: 'issue', issueNumber: 1 });
    expect(data().issues[0]).toMatchObject({ title: 'First bug', body: 'body [[Note]]' });
    expect(await screen.findByTestId('issue-detail')).toHaveTextContent('First bug #1');
    await waitFor(() => expect(files.written.at(-1)?.path).toBe('/w/issues.json'));
  });

  test('lists, filters and sorts issues', async () => {
    seed((d) => {
      d = ops.createMilestone(d, { title: 'v1' });
      const bug = d.labels.find((l) => l.name === 'bug')!.id;
      d = ops.createIssue(d, { title: 'Crash', labels: [bug], milestone: d.milestones[0].id });
      d = ops.createIssue(d, { title: 'Idea one' });
      d = ops.createIssue(d, { title: 'Old thing' });
      d = ops.addComment(d, 2, 'hi');
      return ops.setState(d, 3, 'closed');
    });
    await renderApp({ view: 'issues' });
    const rows = () => screen.queryAllByTestId('issue-row').map((r) => within(r).getAllByRole('button')[0].textContent);
    expect(rows()).toEqual(['Idea one', 'Crash']);
    expect(screen.getByRole('button', { name: /2 Open/ })).toHaveAttribute('aria-pressed', 'true');
    // closed tab
    await userEvent.click(screen.getByRole('button', { name: /1 Closed/ }));
    expect(rows()).toEqual(['Old thing']);
    expect(screen.getByLabelText('Filter issues')).toHaveValue('is:closed ');
    // label dropdown
    const filter = screen.getByLabelText('Filter issues');
    fireEvent.change(filter, { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Filter by label'), { target: { value: 'bug' } });
    expect(filter).toHaveValue('label:bug ');
    expect(rows()).toEqual(['Crash']);
    fireEvent.change(screen.getByLabelText('Filter by label'), { target: { value: 'bug' } });
    expect(rows()).toHaveLength(3);
    fireEvent.change(screen.getByLabelText('Filter by label'), { target: { value: '__none' } });
    expect(rows()).toEqual(['Old thing', 'Idea one']);
    fireEvent.change(filter, { target: { value: '' } });
    // milestone dropdown
    fireEvent.change(screen.getByLabelText('Filter by milestone'), { target: { value: '__none' } });
    expect(filter).toHaveValue('no:milestone ');
    fireEvent.change(screen.getByLabelText('Filter by milestone'), { target: { value: 'v1' } });
    expect(rows()).toEqual(['Crash']);
    fireEvent.change(screen.getByLabelText('Filter by milestone'), { target: { value: '__any' } });
    expect(rows()).toHaveLength(3);
    // sort
    fireEvent.change(screen.getByLabelText('Sort issues'), { target: { value: 'comments-desc' } });
    expect(rows()[0]).toBe('Idea one');
    // clicking a label chip and milestone in a row filters
    const crashRow = screen.getAllByTestId('issue-row').find((r) => r.textContent?.includes('Crash'))!;
    await userEvent.click(within(crashRow).getByRole('button', { name: 'bug' }));
    expect(filter.getAttribute('value') ?? (filter as HTMLInputElement).value).toContain('label:bug');
    await userEvent.click(screen.getByRole('button', { name: 'v1' }));
    expect((filter as HTMLInputElement).value).toContain('milestone:v1');
    fireEvent.change(filter, { target: { value: 'nothing-matches' } });
    expect(screen.getByText('No issues match this filter.')).toBeInTheDocument();
    // open an issue from the list
    fireEvent.change(filter, { target: { value: '' } });
    await userEvent.click(screen.getByRole('button', { name: 'Crash' }));
    expect(viewState()).toEqual({ view: 'issue', issueNumber: 1 });
  });

  test('manages labels', async () => {
    seed((d) => ops.createIssue(d, { title: 'a', labels: [d.labels[0].id] }));
    await renderApp({ view: 'issues' });
    await userEvent.click(screen.getByRole('button', { name: /Labels/ }));
    expect(screen.getByText('4 labels')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'New label' }));
    await userEvent.type(screen.getByLabelText('Label name'), 'docs');
    await userEvent.type(screen.getByLabelText('Label description'), 'Documentation');
    await userEvent.click(screen.getByRole('button', { name: 'color #0ea5e9' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create label' }));
    expect(data().labels.at(-1)).toMatchObject({ name: 'docs', color: '#0ea5e9', description: 'Documentation' });
    // edit
    await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[4]);
    const name = screen.getByLabelText('Label name');
    await userEvent.clear(name);
    await userEvent.type(name, 'documentation');
    fireEvent.change(screen.getByLabelText('custom color'), { target: { value: '#123456' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(data().labels.at(-1)).toMatchObject({ name: 'documentation', color: '#123456' });
    // cancel a form
    await userEvent.click(screen.getByRole('button', { name: 'New label' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    // delete
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    expect(data().labels.map((l) => l.name)).not.toContain('bug');
    expect(data().issues[0].labels).toEqual([]);
    // click a label to filter
    await userEvent.click(screen.getByRole('button', { name: 'idea' }));
    expect(screen.getByLabelText('Filter issues')).toHaveValue('is:open label:idea ');
  });

  test('manages milestones', async () => {
    seed((d) => ops.createIssue(ops.createIssue(d, { title: 'a' }), { title: 'b' }));
    await renderApp({ view: 'issues' });
    await userEvent.click(screen.getByRole('button', { name: /Milestones/ }));
    expect(screen.getByText('No open milestones.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'New milestone' }));
    await userEvent.type(screen.getByLabelText('Milestone title'), 'v1');
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2000-01-01' } });
    await userEvent.type(screen.getByLabelText('Milestone description'), 'first');
    await userEvent.click(screen.getByRole('button', { name: 'Create milestone' }));
    const m = data().milestones[0];
    expect(m).toMatchObject({ title: 'v1', dueOn: '2000-01-01', description: 'first', state: 'open' });
    expect(screen.getByText('Past due by 2000-01-01')).toBeInTheDocument();
    act(() => issueStore.getState().apply((d) => ops.setState(ops.setMilestone(ops.setMilestone(d, 1, m.id), 2, m.id), 1, 'closed')));
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText('50% complete')).toBeInTheDocument();
    // edit
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.clear(screen.getByLabelText('Milestone title'));
    await userEvent.type(screen.getByLabelText('Milestone title'), 'v1.0');
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(data().milestones[0].title).toBe('v1.0');
    expect(data().milestones[0].dueOn).toBeUndefined();
    expect(screen.getByText('No due date')).toBeInTheDocument();
    // close, reopen
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(data().milestones[0].state).toBe('closed');
    await userEvent.click(screen.getByRole('button', { name: /1 Closed/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    expect(data().milestones[0].state).toBe('open');
    await userEvent.click(screen.getByRole('button', { name: /1 Open/ }));
    // filter by milestone
    await userEvent.click(screen.getByRole('button', { name: 'v1.0' }));
    expect(screen.getByLabelText('Filter issues')).toHaveValue('is:open milestone:v1.0 ');
    // delete
    await userEvent.click(screen.getByRole('button', { name: /Milestones/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(data().milestones).toEqual([]);
  });
});

describe('Issue detail', () => {
  const note = makeNote({ id: '/w/Spec.md', title: 'Spec', content: 'fixes [#1](issue:1)' });

  function seedDetail() {
    seed((d) => {
      d = ops.createMilestone(d, { title: 'v1' });
      return ops.createIssue(d, { title: 'Crash', body: 'see [[Spec]]', notes: ['/w/Gone.md'] });
    });
    store.getState().setNotes({ [note.id]: note });
  }

  test('shows a missing issue', async () => {
    seed();
    await renderApp({ view: 'issue', number: 9 });
    expect(screen.getByText('Issue #9 does not exist.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back to issues' }));
    expect(viewState().view).toBe('issues');
  });

  test('edits title and body, comments, closes and reopens', async () => {
    seedDetail();
    await renderApp({ view: 'issue', number: 1 });
    const detail = screen.getByTestId('issue-detail');
    expect(detail).toHaveTextContent('Crash #1');
    expect(detail).toHaveTextContent('Open');
    // title
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const title = screen.getByLabelText('Issue title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Crash on start{Enter}');
    expect(data().issues[0].title).toBe('Crash on start');
    expect(screen.getByText('changed the title Crash → Crash on start')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    // body
    fireEvent.change(screen.getByLabelText(/Describe the issue/), { target: { value: 'new body' } });
    expect(data().issues[0].body).toBe('new body');
    // comment
    expect(screen.getByRole('button', { name: 'Comment' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Leave a comment'), { target: { value: 'first comment' } });
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));
    expect(screen.getAllByTestId('timeline-comment')).toHaveLength(1);
    expect(detail).toHaveTextContent('1 comment');
    // close with comment
    fireEvent.change(screen.getByLabelText('Leave a comment'), { target: { value: 'done' } });
    await userEvent.click(screen.getByRole('button', { name: 'Close with comment' }));
    expect(data().issues[0].state).toBe('closed');
    expect(screen.getByText('closed this issue')).toBeInTheDocument();
    expect(detail).toHaveTextContent('2 comments');
    await userEvent.click(screen.getByRole('button', { name: 'Reopen issue' }));
    expect(data().issues[0].state).toBe('open');
    expect(screen.getByText('reopened this issue')).toBeInTheDocument();
    // back to the list
    await userEvent.click(screen.getByRole('button', { name: 'Issues' }));
    expect(viewState().view).toBe('issues');
  });

  test('edits and deletes comments', async () => {
    seedDetail();
    act(() => issueStore.getState().apply((d) => ops.addComment(d, 1, 'old text')));
    await renderApp({ view: 'issue', number: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'Edit comment' }));
    const editor = screen.getAllByLabelText('editor').find((e) => !(e as HTMLTextAreaElement).readOnly)!;
    fireEvent.change(editor, { target: { value: 'new text' } });
    await userEvent.click(screen.getByRole('button', { name: 'Update comment' }));
    const c = data().issues[0].timeline.find((t) => t.kind === 'comment')!;
    expect(c).toMatchObject({ body: 'new text', updatedAt: expect.any(String) });
    expect(screen.getByText(/edited/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit comment' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete comment' }));
    expect(screen.queryAllByTestId('timeline-comment')).toHaveLength(0);
  });

  test('sidebar pickers: labels, milestone, projects, notes', async () => {
    seedDetail();
    await renderApp({ view: 'issue', number: 1 });
    // labels
    await userEvent.click(screen.getByRole('button', { name: 'Edit Labels' }));
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: /bug/ }));
    expect(data().issues[0].labels).toEqual([labelId('bug')]);
    expect(screen.getByText('added the bug label')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove label bug' }));
    expect(data().issues[0].labels).toEqual([]);
    // milestone
    await userEvent.click(screen.getByRole('button', { name: 'Edit Milestone' }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: /v1/ }));
    expect(data().issues[0].milestone).toBe(data().milestones[0].id);
    expect(screen.getByText('added this to the v1 milestone')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit Milestone' }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear milestone' }));
    expect(data().issues[0].milestone).toBeUndefined();
    // projects
    await userEvent.click(screen.getByRole('button', { name: 'Edit Projects' }));
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: /Default/ }));
    expect(data().projects[0].items).toHaveLength(1);
    fireEvent.mouseDown(document.body); // click outside closes
    const done = data().projects[0].statuses[2];
    fireEvent.change(screen.getByLabelText('Status in Default'), { target: { value: done.id } });
    expect(data().issues[0].state).toBe('closed');
    expect(screen.getByText('moved this to Default: Done')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit Projects' }));
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: /Default/ }));
    expect(data().projects[0].items).toHaveLength(0);
    fireEvent.mouseDown(document.body);
    // notes: the deleted one is greyed out
    expect(screen.getByTitle('Missing: /w/Gone.md')).toHaveClass('line-through');
    await userEvent.click(screen.getByRole('button', { name: 'Unlink Gone' }));
    expect(data().issues[0].notes).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Edit Linked notes' }));
    await userEvent.type(screen.getByPlaceholderText('Search notes'), 'Spec');
    await userEvent.click(within(screen.getByRole('menu')).getByRole('button', { name: 'Spec' }));
    expect(data().issues[0].notes).toEqual(['/w/Spec.md']);
    await userEvent.click(screen.getAllByRole('button', { name: 'Spec' })[0]);
    expect(viewState()).toEqual({ view: 'md', params: { noteId: '/w/Spec.md', hash: '' } });
  });

  test('shows notes mentioning the issue and deletes it', async () => {
    seedDetail();
    await renderApp({ view: 'issue', number: 1 });
    await waitFor(() => expect(screen.getByText('Mentioned in notes').parentElement).toHaveTextContent('Spec'));
    await userEvent.click(screen.getByRole('button', { name: 'Delete issue' }));
    expect(data().issues).toEqual([]);
    expect(viewState().view).toBe('issues');
  });

  test('issue editors handle note and issue links', async () => {
    seedDetail();
    act(() => issueStore.getState().apply((d) => ops.createIssue(d, { title: 'Second thing' })));
    await renderApp({ view: 'issue', number: 1 });
    const body = editors.props['Describe the issue… [[Note]] links a note'];
    let results: unknown;
    await act(async () => { results = await body.onSearchLink('Sec' as never); });
    expect(results).toEqual([{ title: '#2 Second thing', url: 'issue:2' }]);
    await act(async () => { results = await body.onSearchLink('Spec' as never); });
    expect(results).toEqual([{ title: 'Spec', url: 'Spec' }]);
    await act(async () => { await body.onOpenLink('issue:2' as never); });
    expect(viewState()).toEqual({ view: 'issue', issueNumber: 2 });
    await go({ view: 'issue', number: 1 });
    await act(async () => { await editors.props['Describe the issue… [[Note]] links a note'].onOpenLink('Spec' as never); });
    expect(viewState()).toEqual({ view: 'md', params: { noteId: '/w/Spec.md' } });
  });
});

describe('Project view', () => {
  function seedProject() {
    seed((d) => {
      const p = d.projects[0];
      d = ops.createIssue(d, { title: 'Todo item', project: { id: p.id } });
      d = ops.createIssue(d, { title: 'Doing item', project: { id: p.id, status: p.statuses[1].id }, labels: [d.labels[0].id] });
      return ops.createIssue(d, { title: 'Loose issue' });
    });
  }
  const columns = () => screen.getAllByTestId('project-column');

  test('needs a folder', async () => {
    await renderApp({ view: 'project' });
    expect(screen.getByText('Open a folder to use projects.')).toBeInTheDocument();
  });

  test('board shows columns and cards; add items', async () => {
    seedProject();
    await renderApp({ view: 'project' });
    expect(columns().map((c) => c.textContent?.slice(0, 12))).toHaveLength(3);
    expect(within(columns()[0]).getByText('Todo item')).toBeInTheDocument();
    expect(within(columns()[1]).getByText('Doing item')).toBeInTheDocument();
    expect(within(columns()[1]).getByText('bug')).toBeInTheDocument();
    // quick-create
    await userEvent.click(within(columns()[0]).getByRole('button', { name: /Add item/ }));
    await userEvent.type(screen.getByLabelText('Add item to Todo'), 'Brand new{Enter}');
    expect(data().issues.at(-1)!.title).toBe('Brand new');
    expect(within(columns()[0]).getByText('Brand new')).toBeInTheDocument();
    // add an existing issue by number, into the closing column
    await userEvent.click(within(columns()[2]).getByRole('button', { name: /Add item/ }));
    await userEvent.type(screen.getByLabelText('Add item to Done'), '#3{Enter}');
    expect(within(columns()[2]).getByText('Loose issue')).toBeInTheDocument();
    expect(ops.getIssue(data(), 3)!.state).toBe('closed');
    // escape cancels
    await userEvent.click(within(columns()[1]).getByRole('button', { name: /Add item/ }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByLabelText('Add item to In Progress')).not.toBeInTheDocument();
  });

  test('column rename, closes toggle, add and delete', async () => {
    seedProject();
    vi.spyOn(window, 'prompt').mockReturnValue('Review');
    await renderApp({ view: 'project' });
    await userEvent.click(screen.getByRole('button', { name: 'Todo' }));
    const input = screen.getByLabelText('Column name');
    await userEvent.clear(input);
    await userEvent.type(input, 'Backlog{Enter}');
    expect(data().projects[0].statuses[0].name).toBe('Backlog');
    await userEvent.click(screen.getAllByRole('button', { name: 'Moving here closes issues: off' })[0]);
    expect(data().projects[0].statuses[0].closes).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: /Add column/ }));
    expect(data().projects[0].statuses.map((s) => s.name)).toEqual(['Backlog', 'In Progress', 'Done', 'Review']);
    await userEvent.click(screen.getByRole('button', { name: 'Delete column In Progress' }));
    expect(data().projects[0].statuses).toHaveLength(3);
    expect(within(columns()[0]).getByText('Doing item')).toBeInTheDocument();
  });

  test('card opens the issue in a modal', async () => {
    seedProject();
    await renderApp({ view: 'project' });
    await userEvent.click(screen.getByText('Todo item'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByTestId('issue-detail')).toHaveTextContent('Todo item #1');
    expect(within(dialog).queryByRole('button', { name: 'Issues' })).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete issue' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(ops.getIssue(data(), 1)).toBeUndefined();
  });

  test('table layout with sortable columns and inline status', async () => {
    seedProject();
    await renderApp({ view: 'project' });
    await userEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(data().projects[0].layout).toBe('table');
    const titles = () => screen.getAllByTestId('project-row').map((r) => within(r).getAllByRole('button')[0].textContent);
    expect(titles()).toEqual(['Todo item', 'Doing item']);
    await userEvent.click(screen.getByRole('button', { name: /Title/ }));
    expect(titles()).toEqual(['Doing item', 'Todo item']);
    await userEvent.click(screen.getByRole('button', { name: /Title/ }));
    expect(titles()).toEqual(['Todo item', 'Doing item']);
    for (const name of ['#', 'Labels', 'Milestone', 'Updated']) {
      await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
    }
    fireEvent.change(screen.getByLabelText('Filter items'), { target: { value: 'label:bug' } });
    expect(titles()).toEqual(['Doing item']);
    fireEvent.change(screen.getByLabelText('Filter items'), { target: { value: '' } });
    const done = data().projects[0].statuses[2];
    fireEvent.change(screen.getByLabelText('Status of #1'), { target: { value: done.id } });
    expect(ops.getIssue(data(), 1)!.state).toBe('closed');
    await userEvent.click(screen.getByRole('button', { name: 'Remove #2 from project' }));
    expect(titles()).toEqual(['Todo item']);
    fireEvent.change(screen.getByLabelText('Filter items'), { target: { value: 'zzz' } });
    expect(screen.getByText('No items.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Board' }));
    expect(screen.getByTestId('project-board')).toBeInTheDocument();
  });

  test('create, switch, rename and delete projects', async () => {
    seedProject();
    vi.spyOn(window, 'prompt').mockReturnValue('Main');
    await renderApp({ view: 'project' });
    await userEvent.type(screen.getByLabelText('New project'), 'Roadmap{Enter}');
    expect(data().projects.map((p) => p.title)).toEqual(['Default', 'Roadmap']);
    expect(viewState().projectId).toBe(data().projects[1].id);
    expect(screen.getByRole('heading')).toHaveTextContent('Roadmap');
    await userEvent.click(screen.getByRole('button', { name: 'Default' }));
    expect(screen.getByRole('heading')).toHaveTextContent('Default');
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }));
    expect(data().projects[0].title).toBe('Main');
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(data().projects.map((p) => p.title)).toEqual(['Roadmap']);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText('No projects yet. Create one above.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Issues' }));
    expect(viewState().view).toBe('issues');
  });

  test('dropTarget and boardColumns', () => {
    let d = ops.defaultIssueData();
    const p0 = d.projects[0];
    for (const t of ['a', 'b', 'c']) d = ops.createIssue(d, { title: t, project: { id: p0.id } });
    d = ops.deleteIssue(d, 2);
    d = ops.createIssue(d, { title: 'x' });
    d = ops.moveProjectItem(d, p0.id, 4, p0.statuses[0].id, 9);
    const p = d.projects[0];
    const [todo, doing] = p.statuses;
    expect(boardColumns(p, d)[0].issues.map((i) => i.number)).toEqual([1, 3, 4]);
    expect(dropTarget(p, 1, { type: 'Card', issue: 4, status: todo.id })).toEqual({ status: todo.id, order: 2 });
    expect(dropTarget(p, 1, { type: 'Column', status: todo.id })).toEqual({ status: todo.id, order: 2 });
    expect(dropTarget(p, 1, { type: 'Column', status: doing.id })).toEqual({ status: doing.id, order: 0 });
    expect(dropTarget(p, 1, { type: 'Card', issue: 99, status: todo.id })).toEqual({ status: todo.id, order: 3 });
    expect(dropTarget(p, 1, {})).toBeUndefined();
  });

  test('dragEndOp moves cards and columns', () => {
    let d = ops.defaultIssueData();
    const p0 = d.projects[0];
    for (const t of ['a', 'b']) d = ops.createIssue(d, { title: t, project: { id: p0.id } });
    const [todo, doing, done] = p0.statuses;
    const run = (a: object | undefined, o: object | undefined) => {
      const op = dragEndOp(d.projects[0], a, o);
      if (op) d = op(d);
      return !!op;
    };
    expect(run(undefined, { status: todo.id })).toBe(false);
    expect(run({ type: 'Card', issue: 1, status: todo.id }, { type: 'Card', issue: 1, status: todo.id })).toBe(false);
    expect(run({ type: 'Card', issue: 1, status: todo.id }, {})).toBe(false);
    expect(run({ type: 'Other' }, { status: todo.id })).toBe(false);
    // card over card: reorder
    expect(run({ type: 'Card', issue: 1, status: todo.id }, { type: 'Card', issue: 2, status: todo.id })).toBe(true);
    expect(boardColumns(d.projects[0], d)[0].issues.map((i) => i.number)).toEqual([2, 1]);
    // card over a column: closes
    expect(run({ type: 'Card', issue: 1, status: todo.id }, { type: 'Column', status: done.id })).toBe(true);
    expect(ops.getIssue(d, 1)!.state).toBe('closed');
    // column over column / over a card in another column
    expect(run({ type: 'Column', status: done.id }, { type: 'Column', status: done.id })).toBe(false);
    expect(run({ type: 'Column', status: done.id }, { type: 'Column', status: 'nope' })).toBe(false);
    expect(run({ type: 'Column', status: done.id }, { type: 'Card', issue: 2, status: todo.id })).toBe(true);
    expect(d.projects[0].statuses.map((s) => s.id)).toEqual([done.id, todo.id, doing.id]);
  });
});

describe('sidebar navigation', () => {
  test('view reducer routes issues, issue and project', async () => {
    seed();
    await renderApp({ view: 'issues' });
    expect(viewState()).toEqual({ view: 'issues' });
    await go({ view: 'project', projectId: 'p' });
    expect(viewState()).toEqual({ view: 'project', projectId: 'p' });
    await go({ view: 'issue', number: 3 });
    expect(viewState()).toEqual({ view: 'issue', issueNumber: 3 });
  });
});
