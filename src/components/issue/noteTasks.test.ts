import { describe, expect, test } from 'vitest';
import { makeNote } from '../../testUtils';
import * as ops from './issueOps';
import { computeNoteTasks, createIssueFromTask, extractTasks, issueOfTask } from './noteTasks';

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
      { tag: 'todo', text: 'Write the spec' },
      { tag: 'doing', text: 'ship v1 soon' },
      { tag: 'done', text: 'old thing' },
    ]);
    expect(extractTasks('')).toEqual([]);
    expect(extractTasks('no tags')).toEqual([]);
  });

  test('computeNoteTasks lists tasks of md notes, newest first', () => {
    const notes = {
      a: makeNote({ id: '/w/a.md', title: 'A', content: 'one #todo#', updated_at: '2026-01-01T00:00:00Z' }),
      b: makeNote({ id: '/w/b.md', title: 'B', content: 'two #done#\n\nthree #doing#', updated_at: '2026-02-01T00:00:00Z' }),
      d: makeNote({ id: '/w/dir', title: 'dir', content: 'x #todo#', is_dir: true }),
      t: makeNote({ id: '/w/t.json', title: 't', content: 'x #todo#' }),
    };
    expect(computeNoteTasks(notes).map((t) => [t.id, t.noteTitle, t.tag, t.text])).toEqual([
      ['/w/b.md::0', 'B', 'done', 'two'],
      ['/w/b.md::1', 'B', 'doing', 'three'],
      ['/w/a.md::0', 'A', 'todo', 'one'],
    ]);
  });
});

describe('createIssueFromTask', () => {
  const task = (tag: 'todo' | 'doing' | 'done', text = 'do it') => ({
    id: 'x', noteId: '/w/N.md', noteTitle: 'N', tag, text, updatedAt: '',
  });

  test('creates a linked issue in the matching column, once', () => {
    const d0 = ops.defaultIssueData();
    const [todo, doing, done] = d0.projects[0].statuses;
    let d = createIssueFromTask(d0, task('todo'));
    expect(d.issues[0]).toMatchObject({
      title: 'do it', body: 'From [[N]]', notes: ['/w/N.md'], noteTask: { note: '/w/N.md', text: 'do it' }, state: 'open',
    });
    expect(d.projects[0].items[0].status).toBe(todo.id);
    expect(createIssueFromTask(d, task('todo'))).toBe(d);
    expect(issueOfTask(d.issues, task('todo'))?.number).toBe(1);
    d = createIssueFromTask(d, task('doing', 'b'));
    expect(d.projects[0].items[1].status).toBe(doing.id);
    d = createIssueFromTask(d, task('done', 'c'));
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
    expect(d.issues[0].noteTask).toEqual({ note: '/w/M.md', text: 'do it' });
    expect(d.issues[0].body).toBe('From [[M]]');
  });
});
