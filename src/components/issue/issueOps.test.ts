import { describe, expect, test } from 'vitest';
import * as ops from './issueOps';
import type { EventItem, IssueData } from './types';

const base = () => ops.defaultIssueData();
const events = (d: IssueData, num: number) =>
  ops.getIssue(d, num)!.timeline.filter((t): t is EventItem => t.kind === 'event').map((t) => t.event);
const labelId = (d: IssueData, name: string) => d.labels.find((l) => l.name === name)!.id;

describe('defaults and normalize', () => {
  test('a new workspace has default labels and a Default project', () => {
    const d = base();
    expect(d.labels.map((l) => l.name)).toEqual(['bug', 'enhancement', 'question', 'idea']);
    expect(d.projects).toHaveLength(1);
    expect(d.projects[0].title).toBe('Default');
    expect(d.projects[0].statuses.map((s) => [s.name, !!s.closes])).toEqual([
      ['Todo', false], ['In Progress', false], ['Done', true],
    ]);
    expect(d.nextNumber).toBe(1);
  });

  test('normalize fills missing fields and fixes nextNumber', () => {
    const d = ops.normalizeIssueData({
      nextNumber: 2,
      issues: [{ number: 5, title: 'x', state: 'weird' }, { title: 'no number' }],
      milestones: [{ id: 'm', title: 'v1' }],
      projects: [{ id: 'p', title: 'P', layout: 'nope' }],
    });
    expect(d.version).toBe(1);
    expect(d.issues).toHaveLength(1);
    expect(d.issues[0]).toMatchObject({ number: 5, body: '', state: 'open', labels: [], notes: [], timeline: [] });
    expect(d.nextNumber).toBe(6);
    expect(d.labels).toEqual([]);
    expect(d.milestones[0].state).toBe('open');
    expect(d.projects[0]).toMatchObject({ statuses: [], items: [], layout: 'board' });
  });

  test('normalize falls back to defaults on garbage', () => {
    expect(ops.normalizeIssueData(null).projects[0].title).toBe('Default');
    expect(ops.normalizeIssueData('x').labels).toHaveLength(4);
  });
});

describe('issues', () => {
  test('numbers are monotonic and never reused', () => {
    let d = ops.createIssue(base(), { title: ' first ' });
    d = ops.createIssue(d, { title: '' });
    expect(d.issues.map((i) => [i.number, i.title])).toEqual([[1, 'first'], [2, 'Untitled']]);
    d = ops.deleteIssue(d, 2);
    d = ops.createIssue(d, { title: 'third' });
    expect(d.issues.map((i) => i.number)).toEqual([1, 3]);
    expect(events(d, 1)).toEqual(['opened']);
  });

  test('ops do not mutate their input', () => {
    const d0 = base();
    const d1 = ops.createIssue(d0, { title: 'a' });
    expect(d0.issues).toHaveLength(0);
    expect(d1).not.toBe(d0);
  });

  test('create keeps only known labels/milestones and can add to a project', () => {
    let d = ops.createMilestone(base(), { title: 'v1' });
    const m = d.milestones[0].id;
    const p = d.projects[0];
    d = ops.createIssue(d, {
      title: 'a', labels: [labelId(d, 'bug'), 'zzz'], milestone: m, notes: ['/n.md', '/n.md'],
      project: { id: p.id, status: p.statuses[1].id },
    });
    const issue = ops.getIssue(d, 1)!;
    expect(issue.labels).toEqual([labelId(d, 'bug')]);
    expect(issue.milestone).toBe(m);
    expect(issue.notes).toEqual(['/n.md']);
    expect(d.projects[0].items).toEqual([{ issue: 1, status: p.statuses[1].id, order: 0 }]);
    d = ops.createIssue(d, { title: 'b', milestone: 'unknown', project: { id: p.id } });
    expect(ops.getIssue(d, 2)!.milestone).toBeUndefined();
    expect(d.projects[0].items[1]).toEqual({ issue: 2, status: p.statuses[0].id, order: 0 });
  });

  test('rename logs an event, body edit does not', () => {
    let d = ops.createIssue(base(), { title: 'old' });
    d = ops.updateIssue(d, 1, { title: 'new', body: 'text' });
    d = ops.updateIssue(d, 1, { title: '  ' });
    const issue = ops.getIssue(d, 1)!;
    expect(issue.title).toBe('new');
    expect(issue.body).toBe('text');
    expect(events(d, 1)).toEqual(['opened', 'renamed']);
    expect((issue.timeline[1] as EventItem).detail).toBe('old → new');
    expect(ops.updateIssue(d, 99, { title: 'x' })).toBe(d);
  });

  test('close and reopen', () => {
    let d = ops.createIssue(base(), { title: 'a' });
    d = ops.setState(d, 1, 'closed');
    expect(ops.getIssue(d, 1)!.closedAt).toBeDefined();
    expect(ops.setState(d, 1, 'closed')).toBe(d);
    d = ops.setState(d, 1, 'open');
    expect(ops.getIssue(d, 1)!.closedAt).toBeUndefined();
    expect(events(d, 1)).toEqual(['opened', 'closed', 'reopened']);
  });

  test('closing moves the project item to the closing column and back on reopen', () => {
    const d0 = base();
    const p = d0.projects[0];
    let d = ops.createIssue(d0, { title: 'a', project: { id: p.id, status: p.statuses[1].id } });
    d = ops.setState(d, 1, 'closed');
    expect(d.projects[0].items[0].status).toBe(p.statuses[2].id);
    d = ops.setState(d, 1, 'open');
    expect(d.projects[0].items[0].status).toBe(p.statuses[0].id);
  });

  test('labels and milestones log events', () => {
    let d = ops.createMilestone(ops.createIssue(base(), { title: 'a' }), { title: 'v1' });
    const bug = labelId(d, 'bug');
    const m = d.milestones[0].id;
    d = ops.addLabel(d, 1, bug);
    expect(ops.addLabel(d, 1, bug)).toBe(d);
    expect(ops.addLabel(d, 1, 'nope')).toBe(d);
    d = ops.removeLabel(d, 1, bug);
    expect(ops.removeLabel(d, 1, bug)).toBe(d);
    d = ops.setMilestone(d, 1, m);
    expect(ops.setMilestone(d, 1, m)).toBe(d);
    expect(ops.setMilestone(d, 1, 'nope')).toBe(ops.setMilestone(d, 1, 'nope'));
    d = ops.setMilestone(d, 1);
    expect(events(d, 1)).toEqual(['opened', 'labeled', 'unlabeled', 'milestoned', 'demilestoned']);
    const details = ops.getIssue(d, 1)!.timeline.map((t) => (t.kind === 'event' ? t.detail : ''));
    expect(details).toEqual([undefined, 'bug', 'bug', 'v1', 'v1']);
  });

  test('comments', () => {
    let d = ops.createIssue(base(), { title: 'a' });
    d = ops.addComment(d, 1, 'hello');
    expect(ops.addComment(d, 1, '   ')).toBe(d);
    const c = ops.getIssue(d, 1)!.timeline[1];
    expect(c).toMatchObject({ kind: 'comment', body: 'hello' });
    d = ops.editComment(d, 1, c.id, 'edited');
    expect(ops.getIssue(d, 1)!.timeline[1]).toMatchObject({ body: 'edited', updatedAt: expect.any(String) });
    expect(ops.editComment(d, 1, ops.getIssue(d, 1)!.timeline[0].id, 'x')).toBe(d); // events are not comments
    expect(ops.commentCount(ops.getIssue(d, 1)!)).toBe(1);
    d = ops.deleteComment(d, 1, c.id);
    expect(ops.commentCount(ops.getIssue(d, 1)!)).toBe(0);
  });

  test('link and unlink notes', () => {
    let d = ops.createIssue(base(), { title: 'a' });
    d = ops.linkNote(d, 1, '/a.md');
    expect(ops.linkNote(d, 1, '/a.md')).toBe(d);
    expect(ops.getIssue(d, 1)!.notes).toEqual(['/a.md']);
    d = ops.unlinkNote(d, 1, '/a.md');
    expect(ops.getIssue(d, 1)!.notes).toEqual([]);
    expect(ops.unlinkNote(d, 1, '/a.md')).toBe(d);
  });

  test('renameNoteRefs updates paths and links in body and comments', () => {
    let d = ops.createIssue(base(), {
      title: 'a', body: 'see [[Old Note]] and [[Old Note|alias]] and [x](Old%20Note) but not [[Old Notes]]',
      notes: ['/w/Old Note.md', '/w/other.md'],
    });
    d = ops.addComment(d, 1, 'also [[Old Note]]');
    d = ops.renameNoteRefs(d, '/w/Old Note.md', '/w/New $& Note.md', 'Old Note', 'New $& Note');
    const issue = ops.getIssue(d, 1)!;
    expect(issue.notes).toEqual(['/w/New $& Note.md', '/w/other.md']);
    expect(issue.body).toBe(
      'see [[New $& Note]] and [[New $& Note|alias]] and [x](New%20$&%20Note) but not [[Old Notes]]'
    );
    expect(issue.timeline[1]).toMatchObject({ body: 'also [[New $& Note]]' });
  });
});

describe('labels, milestones, projects', () => {
  test('label CRUD; delete removes it from issues', () => {
    let d = ops.createLabel(base(), { name: ' docs ', color: '#000' });
    expect(ops.createLabel(d, { name: 'docs', color: '#fff' })).toBe(d);
    expect(ops.createLabel(d, { name: ' ', color: '#fff' })).toBe(d);
    const docs = labelId(d, 'docs');
    d = ops.updateLabel(d, docs, { name: 'documentation', color: '#111' });
    expect(d.labels.find((l) => l.id === docs)).toMatchObject({ name: 'documentation', color: '#111' });
    expect(ops.updateLabel(d, docs, { name: 'bug' })).toBe(d);
    d = ops.createIssue(d, { title: 'a', labels: [docs] });
    d = ops.deleteLabel(d, docs);
    expect(d.labels.some((l) => l.id === docs)).toBe(false);
    expect(ops.getIssue(d, 1)!.labels).toEqual([]);
  });

  test('milestone CRUD and progress', () => {
    let d = ops.createMilestone(base(), { title: 'v1', dueOn: '2026-01-01' });
    expect(ops.createMilestone(d, { title: '' })).toBe(d);
    const m = d.milestones[0].id;
    d = ops.updateMilestone(d, m, { title: 'v1.0', dueOn: '', state: 'closed' });
    expect(d.milestones[0]).toEqual({ id: m, title: 'v1.0', state: 'closed' });
    d = ops.createIssue(d, { title: 'a', milestone: m });
    d = ops.createIssue(d, { title: 'b', milestone: m });
    d = ops.setState(d, 1, 'closed');
    expect(ops.milestoneProgress(d, m)).toEqual({ open: 1, closed: 1, total: 2, percent: 50 });
    d = ops.deleteMilestone(d, m);
    expect(ops.getIssue(d, 2)!.milestone).toBeUndefined();
    expect(ops.milestoneProgress(d, m).percent).toBe(0);
  });

  test('project and column CRUD', () => {
    let d = ops.createProject(base(), 'Roadmap', 'desc');
    expect(ops.createProject(d, ' ')).toBe(d);
    const p = d.projects[1];
    d = ops.updateProject(d, p.id, { title: 'Road', layout: 'table' });
    expect(d.projects[1]).toMatchObject({ title: 'Road', layout: 'table', description: 'desc' });
    d = ops.addStatus(d, p.id, 'Blocked');
    const blocked = d.projects[1].statuses[3];
    d = ops.updateStatus(d, p.id, blocked.id, { name: 'Waiting', closes: true });
    expect(d.projects[1].statuses[3]).toMatchObject({ name: 'Waiting', closes: true });
    d = ops.moveStatus(d, p.id, blocked.id, 0);
    expect(d.projects[1].statuses[0].id).toBe(blocked.id);
    d = ops.createIssue(d, { title: 'a', project: { id: p.id, status: blocked.id } });
    d = ops.createIssue(d, { title: 'b', project: { id: p.id, status: p.statuses[0].id } });
    d = ops.deleteStatus(d, p.id, blocked.id);
    expect(d.projects[1].items).toEqual([
      { issue: 1, status: p.statuses[0].id, order: 1 },
      { issue: 2, status: p.statuses[0].id, order: 0 },
    ]);
    d = ops.removeProjectItem(d, p.id, 1);
    d = ops.addProjectItem(d, p.id, 1);
    expect(ops.addProjectItem(d, p.id, 1)).toBe(d);
    expect(ops.issueProjects(d, 1).map((x) => x.project.title)).toEqual(['Road']);
    for (const s of d.projects[1].statuses) d = ops.deleteStatus(d, p.id, s.id);
    expect(d.projects[1].items).toEqual([]);
    d = ops.deleteProject(d, p.id);
    expect(d.projects).toHaveLength(1);
  });

  test('moveProjectItem reorders, logs status and closes/reopens', () => {
    const d0 = base();
    const p = d0.projects[0];
    const [todo, doing, done] = p.statuses;
    let d = d0;
    for (const t of ['a', 'b', 'c']) d = ops.createIssue(d, { title: t, project: { id: p.id } });
    // reorder within the column: no event
    d = ops.moveProjectItem(d, p.id, 3, todo.id, 0);
    const col = (s: string) =>
      d.projects[0].items.filter((i) => i.status === s).sort((a, b) => a.order - b.order).map((i) => i.issue);
    expect(col(todo.id)).toEqual([3, 1, 2]);
    expect(events(d, 3)).toEqual(['opened']);
    // to another column
    d = ops.moveProjectItem(d, p.id, 1, doing.id, 5);
    expect(col(doing.id)).toEqual([1]);
    expect(events(d, 1)).toEqual(['opened', 'status']);
    // closes
    d = ops.moveProjectItem(d, p.id, 1, done.id, 0);
    expect(ops.getIssue(d, 1)!.state).toBe('closed');
    expect(events(d, 1)).toEqual(['opened', 'status', 'status', 'closed']);
    // back out reopens
    d = ops.moveProjectItem(d, p.id, 1, todo.id, 1);
    expect(ops.getIssue(d, 1)!.state).toBe('open');
    expect(col(todo.id)).toEqual([3, 1, 2]);
    // items not yet in the project get added
    d = ops.createIssue(d, { title: 'd' });
    d = ops.moveProjectItem(d, p.id, 4, doing.id, 0);
    expect(col(doing.id)).toEqual([4]);
    expect(events(d, 4)).toEqual(['opened', 'status']);
    expect(ops.moveProjectItem(d, p.id, 99, doing.id, 0)).toBe(d);
  });
});
