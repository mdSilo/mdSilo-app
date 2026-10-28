import { describe, expect, test } from 'vitest';
import { makeNote } from '../testUtils';
import { LinkIndex } from './linkIndex';
import { NoteMap } from './noteMap';

const notesOf = (...notes: Parameters<typeof makeNote>[0][]) => NoteMap.from(notes.map((n) => makeNote(n)));

describe('LinkIndex', () => {
  test('finds the notes linking a title, and mentioning it', () => {
    const index = new LinkIndex();
    index.sync(notesOf(
      { id: '/a.md', title: 'a', content: 'see [[target]] and [x](other%20note)' },
      { id: '/b.md', title: 'b', content: 'the target, not linked' },
      { id: '/c.md', title: 'c', content: '`[[target]]` in code' },
    ));
    expect([...index.linking(['target'])]).toEqual(['/a.md']);
    expect([...index.linking(['other note'])]).toEqual(['/a.md']);
    expect([...index.mentioning('target')].sort()).toEqual(['/a.md', '/b.md', '/c.md']);
    expect(index.hasTitle('b')).toBe(true);
    expect(index.hasTitle('target')).toBe(false);
  });

  test('re-parses only the notes changed since the last sync', () => {
    const index = new LinkIndex();
    const notes = notesOf(
      { id: '/a.md', content: '[[t]]' },
      { id: '/b.md', content: '[[u]]' },
      { id: '/c.md', content: 'plain' },
    );
    index.sync(notes);
    index.linking(['t']);
    expect(index.parsed).toBe(3);

    // one note edited: the others are kept
    const edited = notes.set(makeNote({ id: '/b.md', content: '[[t]] now' }));
    index.sync(edited);
    expect([...index.linking(['t'])].sort()).toEqual(['/a.md', '/b.md']);
    expect([...index.linking(['u'])]).toEqual([]);
    expect(index.parsed).toBe(4);

    // the same notes again: nothing to do
    index.sync(NoteMap.from(edited.values().map((n) => ({ ...n }))));
    index.linking(['t']);
    expect(index.parsed).toBe(4);
  });

  test('forgets deleted notes', () => {
    const index = new LinkIndex();
    const notes = notesOf({ id: '/a.md', content: '[[t]] #tag# ' }, { id: '/b.md', content: '[[t]]' });
    index.sync(notes);
    expect(index.linking(['t']).size).toBe(2);
    index.sync(notes.delete('/a.md'));
    expect([...index.linking(['t'])]).toEqual(['/b.md']);
    expect(index.tags('/a.md')).toEqual([]);
  });

  test('tags, raw links and issue links per note', () => {
    const index = new LinkIndex();
    index.sync(notesOf({ id: '/a.md', content: 'x #one# #two words# [[n]] [i](issue:12) [j](issue:3) {{Dune}}' }));
    expect(index.tags('/a.md')).toEqual(['one', 'two words']);
    // as found in the raw text, not the links of the app (issue:, book:)
    expect(index.rawLinks('/a.md')).toEqual(['n']);
    expect([...index.issues('/a.md')].sort((x, y) => x - y)).toEqual([3, 12]);
    expect(index.books('/a.md')).toEqual(['Dune']);
  });
});
