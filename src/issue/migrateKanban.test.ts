import { describe, expect, test } from 'vitest';
import * as ops from './issueOps';
import { migrateKanbans, parseLegacyKanbans } from './migrateKanban';

const legacy = {
  default: {
    columns: [
      { id: 1, title: 'Todo', hdColor: '#ff0000' },
      { id: 'c2', title: 'Done' },
    ],
    cards: [
      { id: 10, columnId: 'c2', content: 'Write docs\nmore detail', bgColor: '#000' },
      {
        id: 11, columnId: 1, content: 'Read book',
        items: [
          { name: 'Book.md', uri: '/w/Book.md', category: 'note' },
          { name: 'a b.pdf', uri: '/files/a b.pdf', category: 'attach' },
        ],
      },
      { id: 12, columnId: 'gone', content: '  ' },
      { id: 13, columnId: 1, content: 'Second todo' },
    ],
    bgColor: '#123456',
  },
  work: { columns: [], cards: [{ id: 1, columnId: 9, content: 'Orphan' }] },
  empty: { columns: [], cards: [] },
};

describe('parseLegacyKanbans', () => {
  test('keeps boards with columns or cards', () => {
    const parsed = parseLegacyKanbans(JSON.stringify(legacy))!;
    expect(Object.keys(parsed)).toEqual(['default', 'work']);
  });

  test('nothing to migrate', () => {
    expect(parseLegacyKanbans('')).toBeUndefined();
    expect(parseLegacyKanbans('{}')).toBeUndefined();
    expect(parseLegacyKanbans('{broken')).toBeUndefined();
    expect(parseLegacyKanbans('[1]')).toBeUndefined();
    expect(parseLegacyKanbans('{"x": null, "y": {"columns": "no"}}')).toBeUndefined();
  });
});

describe('migrateKanbans', () => {
  test('boards become projects, cards become issues in their columns', () => {
    const d = migrateKanbans(ops.defaultIssueData(), parseLegacyKanbans(JSON.stringify(legacy))!);
    expect(d.projects.map((p) => p.title)).toEqual(['Default', 'default', 'work']);
    const p = d.projects[1];
    expect(p.statuses.map((s) => [s.name, s.color])).toEqual([['Todo', '#ff0000'], ['Done', undefined]]);
    const [todo, done] = p.statuses;
    const col = (sid: string) =>
      p.items.filter((it) => it.status === sid).sort((a, b) => a.order - b.order)
        .map((it) => ops.getIssue(d, it.issue)!.title);
    expect(col(todo.id)).toEqual(['Read book', 'Untitled', 'Second todo']); // unknown column -> first
    expect(col(done.id)).toEqual(['Write docs']);
    const docs = d.issues.find((i) => i.title === 'Write docs')!;
    expect(docs.body).toBe('more detail');
    expect(docs.state).toBe('open');
    const book = d.issues.find((i) => i.title === 'Read book')!;
    expect(book.notes).toEqual(['/w/Book.md']);
    expect(book.body).toBe('Attachments:\n\n- [a b.pdf](/files/a%20b.pdf)');
    // a board without columns gets one
    const work = d.projects[2];
    expect(work.statuses.map((s) => s.name)).toEqual(['Todo']);
    expect(work.items).toHaveLength(1);
    expect(d.issues.map((i) => i.number)).toEqual([1, 2, 3, 4, 5]);
    expect(d.nextNumber).toBe(6);
  });

  test('replaces the untouched Default project of a fresh workspace', () => {
    const d = migrateKanbans(ops.defaultIssueData(), { default: legacy.default }, true);
    expect(d.projects.map((p) => p.title)).toEqual(['default']);
  });

  test('renames boards whose title is taken', () => {
    const d = migrateKanbans(ops.defaultIssueData(), { Default: legacy.default, ' ': legacy.work });
    expect(d.projects.map((p) => p.title)).toEqual(['Default', 'Default (2)', 'Kanban']);
  });

  test('keeps existing data', () => {
    let d = ops.createIssue(ops.defaultIssueData(), { title: 'existing', project: { id: ops.defaultIssueData().projects[0].id } });
    d = migrateKanbans(d, { b: { columns: [{ id: 1, title: 'X' }], cards: [{ id: 1, columnId: 1, content: 'card' }] } }, true);
    expect(d.projects.map((p) => p.title)).toEqual(['Default', 'b']);
    expect(d.issues.map((i) => [i.number, i.title])).toEqual([[1, 'existing'], [2, 'card']]);
  });
});
