import { describe, expect, test } from 'vitest';
import { NoteMap } from 'lib/noteMap';
import { makeNote } from '../../testUtils';
import * as ops from './issueOps';
import {
  computeNoteTasks, createIssueFromTask, extractTasks, issueOfTask, NoteTask, syncNoteTasks,
} from './noteTasks';
import type { EventItem, IssueData, TaskTag } from './types';

describe('extractTasks', () => {
  test('finds blocks tagged #todo#, #doing#, #done#', () => {
    const md = [
      '# Plan',
      '',
      'Write the spec #todo#',
      '',
      '- #doing# ship **v1** soon',
      '- plain item',
      '- #DONE# old thing',
      '',
      'not a #task# here',
      '',
      '`#todo#` in code',
    ].join('\n');
    expect(extractTasks(md)).toEqual([
      { kind: 'tag', tag: 'todo', text: 'Write the spec' },
      { kind: 'tag', tag: 'doing', text: 'ship v1 soon' },
      { kind: 'tag', tag: 'done', text: 'old thing' },
    ]);
    expect(extractTasks('')).toEqual([]);
    expect(extractTasks('no tasks')).toEqual([]);
  });

  test('finds checkbox tasks; tagged checkboxes count once', () => {
    const md = [
      '- [ ] buy milk',
      '- [x] call **Bob**',
      '- [ ] fix bug #doing#',
      '  - [ ] nested step',
    ].join('\n');
    expect(extractTasks(md)).toEqual([
      { kind: 'checkbox', tag: 'todo', text: 'buy milk' },
      { kind: 'checkbox', tag: 'done', text: 'call Bob' },
      { kind: 'tag', tag: 'doing', text: 'fix bug' },
      { kind: 'checkbox', tag: 'todo', text: 'nested step' },
    ]);
  });

  test('computeNoteTasks lists tasks of md notes, newest first', () => {
    const notes = NoteMap.from({
      a: makeNote({ id: '/w/a.md', title: 'A', content: 'one #todo#', updated_at: '2026-01-01T00:00:00Z' }),
      b: makeNote({ id: '/w/b.md', title: 'B', content: 'two #done#\n\n- [ ] three', updated_at: '2026-02-01T00:00:00Z' }),
      d: makeNote({ id: '/w/dir', title: 'dir', content: 'x #todo#', is_dir: true }),
      t: makeNote({ id: '/w/t.json', title: 't', content: 'x #todo#' }),
    });
    expect(computeNoteTasks(notes).map((t) => [t.id, t.noteTitle, t.kind, t.tag, t.text])).toEqual([
      ['/w/b.md::0', 'B', 'tag', 'done', 'two'],
      ['/w/b.md::1', 'B', 'checkbox', 'todo', 'three'],
      ['/w/a.md::0', 'A', 'tag', 'todo', 'one'],
    ]);
  });
});

const task = (tag: TaskTag, text = 'do it', kind: NoteTask['kind'] = 'tag'): NoteTask => ({
  id: 'x', noteId: '/w/N.md', noteTitle: 'N', kind, tag, text, updatedAt: '',
});

describe('createIssueFromTask', () => {
  test('creates a linked issue in the matching column, once', () => {
    const d0 = ops.defaultIssueData();
    const [todo, doing, done] = d0.projects[0].statuses;
    let d = createIssueFromTask(d0, task('todo'));
    expect(d.issues[0]).toMatchObject({
      title: 'do it', body: 'From [[N]]', notes: ['/w/N.md'], state: 'open',
      noteTask: { note: '/w/N.md', text: 'do it', kind: 'tag', tag: 'todo' },
    });
    expect(d.projects[0].items[0].status).toBe(todo.id);
    expect(createIssueFromTask(d, task('todo'))).toBe(d);
    expect(issueOfTask(d.issues, task('todo'))?.number).toBe(1);
    // same text but a checkbox is another task
    expect(issueOfTask(d.issues, task('todo', 'do it', 'checkbox'))).toBeUndefined();
    d = createIssueFromTask(d, task('doing', 'b'));
    expect(d.projects[0].items[1].status).toBe(doing.id);
    d = createIssueFromTask(d, task('done', 'c', 'checkbox'));
    expect(ops.getIssue(d, 3)!.state).toBe('closed');
    expect(d.projects[0].items[2].status).toBe(done.id);
    d = createIssueFromTask(d, task('todo', ''));
    expect(ops.getIssue(d, 4)!.title).toBe('N');
  });

  test('falls back to column positions and works without projects', () => {
    let d = ops.createProject({ ...ops.defaultIssueData(), projects: [] }, 'P');
    const p = d.projects[0];
    d = ops.updateStatus(d, p.id, p.statuses[2].id, { name: 'Shipped' });
    d = createIssueFromTask(d, task('done'));
    expect(d.projects[0].items[0].status).toBe(p.statuses[2].id);
    const empty = createIssueFromTask({ ...ops.defaultIssueData(), projects: [] }, task('doing'));
    expect(empty.issues).toHaveLength(1);
  });

  test('renaming the note keeps the task link', () => {
    let d = createIssueFromTask(ops.defaultIssueData(), task('todo'));
    d = ops.renameNoteRefs(d, '/w/N.md', '/w/M.md', 'N', 'M');
    expect(d.issues[0].noteTask).toMatchObject({ note: '/w/M.md', text: 'do it' });
    expect(d.issues[0].body).toBe('From [[M]]');
  });
});

describe('syncNoteTasks', () => {
  const notes = NoteMap.from({ '/w/N.md': makeNote({ id: '/w/N.md', title: 'N' }) });
  const status = (d: IssueData) => {
    const p = d.projects[0];
    return p.statuses.find((s) => s.id === p.items[0].status)?.name;
  };
  const lastEvent = (d: IssueData) => {
    const ev = d.issues[0].timeline.filter((t): t is EventItem => t.kind === 'event' && t.event === 'task');
    return ev.at(-1)?.detail;
  };

  test('follows tag changes made in the note', () => {
    let d = createIssueFromTask(ops.defaultIssueData(), task('todo'));
    expect(syncNoteTasks(d, [task('todo')], notes)).toBe(d); // nothing changed
    d = syncNoteTasks(d, [task('doing')], notes);
    expect(status(d)).toBe('In Progress');
    expect(d.issues[0].state).toBe('open');
    expect(lastEvent(d)).toBe('#todo → #doing in N');
    d = syncNoteTasks(d, [task('done')], notes);
    expect(status(d)).toBe('Done');
    expect(d.issues[0].state).toBe('closed');
    d = syncNoteTasks(d, [task('todo')], notes);
    expect(status(d)).toBe('Todo');
    expect(d.issues[0].state).toBe('open');
    expect(d.issues[0].noteTask?.tag).toBe('todo');
  });

  test('checkboxes: checking closes, unchecking reopens', () => {
    let d = createIssueFromTask(ops.defaultIssueData(), task('todo', 'buy', 'checkbox'));
    d = syncNoteTasks(d, [task('done', 'buy', 'checkbox')], notes);
    expect(d.issues[0].state).toBe('closed');
    expect(lastEvent(d)).toBe('[ ] → [x] in N');
    d = syncNoteTasks(d, [task('todo', 'buy', 'checkbox')], notes);
    expect(d.issues[0].state).toBe('open');
  });

  test('changes made in the tracker stay until the task changes', () => {
    let d = createIssueFromTask(ops.defaultIssueData(), task('todo'));
    d = ops.setState(d, 1, 'closed');
    expect(syncNoteTasks(d, [task('todo')], notes)).toBe(d);
  });

  test('a removed task closes the issue once; a returning task is followed again', () => {
    let d = createIssueFromTask(ops.defaultIssueData(), task('doing'));
    d = syncNoteTasks(d, [task('doing', 'other text')], notes);
    expect(d.issues[0].state).toBe('closed');
    expect(d.issues[0].noteTask?.missing).toBe(true);
    expect(lastEvent(d)).toBe('the task was removed from N');
    expect(d.issues).toHaveLength(1); // never deleted
    expect(syncNoteTasks(d, [], notes)).toBe(d); // already handled
    d = syncNoteTasks(d, [task('doing')], notes);
    expect(d.issues[0].state).toBe('open');
    expect(d.issues[0].noteTask?.missing).toBeUndefined();
    expect(status(d)).toBe('In Progress');
    expect(lastEvent(d)).toBe('the task is back in N as #doing');
  });

  test('a deleted note closes its task issues', () => {
    let d = createIssueFromTask(ops.defaultIssueData(), task('todo'));
    d = syncNoteTasks(d, [], NoteMap.EMPTY);
    expect(d.issues[0].state).toBe('closed');
    expect(lastEvent(d)).toBe('the task was removed from N.md');
  });

  test('first sync of an older link only records the tag', () => {
    let d = ops.createIssue(ops.defaultIssueData(), {
      title: 'old', noteTask: { note: '/w/N.md', text: 'do it' },
    });
    d = syncNoteTasks(d, [task('done')], notes);
    expect(d.issues[0].state).toBe('open');
    expect(d.issues[0].noteTask?.tag).toBe('done');
    expect(syncNoteTasks(ops.defaultIssueData(), [task('todo')], notes).issues).toEqual([]);
  });
});
