import { describe, expect, test } from 'vitest';
import { makeNote } from '../testUtils';
import { NoteMap } from './noteMap';

const many = (n: number) => Array.from({ length: n }, (_, i) => makeNote({ id: `/n/${i}.md`, title: `n${i}` }));

describe('NoteMap', () => {
  test('builds from notes, records and NoteMaps', () => {
    const [a, b] = many(2);
    expect(NoteMap.from().size).toBe(0);
    expect(NoteMap.from(null)).toBe(NoteMap.EMPTY);
    const fromList = NoteMap.from([a, b]);
    expect(fromList.size).toBe(2);
    expect(fromList.get(a.id)).toBe(a);
    const fromRecord = NoteMap.from({ [a.id]: a, [b.id]: b });
    expect(fromRecord.toRecord()).toEqual({ [a.id]: a, [b.id]: b });
    expect(NoteMap.from(fromRecord)).toBe(fromRecord);
  });

  test('reads notes', () => {
    const notes = NoteMap.from(many(300));
    expect(notes.size).toBe(300);
    expect(notes.has('/n/42.md')).toBe(true);
    expect(notes.has('/n/missing.md')).toBe(false);
    expect(notes.get('/n/299.md')?.title).toBe('n299');
    expect(notes.get('/n/missing.md')).toBeUndefined();
    expect(notes.values()).toHaveLength(300);
    expect(new Set(notes.keys())).toEqual(new Set(many(300).map((n) => n.id)));
    expect([...notes]).toEqual(notes.values());
    // cached
    expect(notes.values()).toBe(notes.values());
  });

  test('changes return a new map and leave the old one as is', () => {
    const [a, b] = many(2);
    const before = NoteMap.from([a]);
    const after = before.set(b);
    expect(after).not.toBe(before);
    expect(before.size).toBe(1);
    expect(before.has(b.id)).toBe(false);
    expect(after.size).toBe(2);
    expect(after.values()).not.toBe(before.values());
  });

  test('set replaces, upsert merges', () => {
    const a = makeNote({ id: '/a.md', title: 'a', content: 'one', cover: 'c' });
    const notes = NoteMap.from([a]);
    const replaced = notes.set(makeNote({ id: '/a.md', title: 'A' }));
    expect(replaced.get('/a.md')?.content).toBe('');
    const merged = notes.upsert({ ...a, content: 'two' });
    expect(merged.get('/a.md')).toMatchObject({ title: 'a', content: 'two', cover: 'c' });
    expect(merged.size).toBe(1);
  });

  test('setMany and upsertMany count each id once', () => {
    const [a, b] = many(2);
    const notes = NoteMap.EMPTY.setMany([a, b, { ...a, title: 'again' }]);
    expect(notes.size).toBe(2);
    expect(notes.get(a.id)?.title).toBe('again');
    expect(notes.upsertMany([]).size).toBe(2);
    expect(notes.upsertMany([])).toBe(notes);
  });

  test('update merges into known notes only', () => {
    const notes = NoteMap.from(many(3));
    const updated = notes.update('/n/1.md', { content: 'new' });
    expect(updated.get('/n/1.md')).toMatchObject({ id: '/n/1.md', title: 'n1', content: 'new' });
    expect(notes.get('/n/1.md')?.content).toBe('');
    expect(notes.update('/n/missing.md', { content: 'x' })).toBe(notes);
    // id cannot be changed by update
    expect(notes.update('/n/2.md', { id: '/other.md' }).get('/n/2.md')?.id).toBe('/n/2.md');
  });

  test('delete removes known notes only', () => {
    const notes = NoteMap.from(many(3));
    const deleted = notes.delete('/n/0.md');
    expect(deleted.size).toBe(2);
    expect(deleted.has('/n/0.md')).toBe(false);
    expect(notes.has('/n/0.md')).toBe(true);
    expect(notes.delete('/n/missing.md')).toBe(notes);
  });

  test('serializes to JSON as a record', () => {
    const [a] = many(1);
    expect(JSON.parse(JSON.stringify({ notes: NoteMap.from([a]) }))).toEqual({ notes: { [a.id]: a } });
  });
});
