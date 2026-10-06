import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { NoteMap } from 'lib/noteMap';
import { store } from 'lib/store';
import { makeNote } from '../../../testUtils';
import useBacklinks, { computeLinkedBacklinks } from './useBacklinks';

const target = makeNote({ id: '/n/target note.md', title: 'target note', content: 'I am the target' });
const wiki = makeNote({ id: '/n/wiki.md', title: 'wiki', content: 'Links to [[target note]] here' });
const md = makeNote({ id: '/n/md.md', title: 'md', content: 'A [label](target%20note) link' });
const web = makeNote({ id: '/n/web.md', title: 'web', content: 'A [label](https://target.note) url' });
const mention = makeNote({ id: '/n/mention.md', title: 'mention', content: 'Just says target note in text' });
const table = makeNote({
  id: '/n/table.md',
  title: 'table',
  content: '| Link | Mention |\n| --- | --- |\n| [label](target%20note) | target note |',
});
const notes = NoteMap.from([target, wiki, md, web, mention, table]);

describe('computeLinkedBacklinks', () => {
  test('finds wiki and markdown links to the title', () => {
    const result = computeLinkedBacklinks(notes, 'target note');
    expect(result.map((b) => b.id).sort()).toEqual(['/n/md.md', '/n/table.md', '/n/wiki.md']);
    const wikiMatch = result.find((b) => b.id === '/n/wiki.md')?.matches[0];
    expect(wikiMatch).toMatchObject({ text: 'target note', from: expect.any(Number), to: expect.any(Number) });
    expect(result.find((b) => b.id === '/n/md.md')?.matches[0].text).toBe('label');
  });

  test('returns nothing for blank titles', () => {
    expect(computeLinkedBacklinks(notes, '')).toEqual([]);
    expect(computeLinkedBacklinks(notes, '   ')).toEqual([]);
  });

  test('skips the note itself', () => {
    const self = makeNote({ id: '/n/self.md', title: 'self', content: '[[self]]' });
    expect(computeLinkedBacklinks(NoteMap.from([self]), 'self')).toEqual([]);
  });

  test('finds backlinks in markdown tables', () => {
    expect(computeLinkedBacklinks(notes, 'target note').map((b) => b.id)).toContain(table.id);
  });
});

describe('useBacklinks', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('returns linked and unlinked backlinks after debounce', () => {
    store.getState().setNotes(NoteMap.from(notes));
    const { result } = renderHook(() => useBacklinks(target.id));
    act(() => vi.advanceTimersByTime(1000));

    expect(result.current.linkedBacklinks.map((b) => b.id).sort()).toEqual(['/n/md.md', '/n/table.md', '/n/wiki.md']);
    // unlinked = text matches of the title, which also includes the wiki link text
    expect(result.current.unlinkedBacklinks.map((b) => b.id).sort()).toEqual(['/n/mention.md', '/n/table.md', '/n/wiki.md']);
  });

  test('is empty for unknown notes', () => {
    store.getState().setNotes(NoteMap.from(notes));
    const { result } = renderHook(() => useBacklinks('/n/unknown.md'));
    expect(result.current).toEqual({ linkedBacklinks: [], unlinkedBacklinks: [] });
  });
});
