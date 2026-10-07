import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { NoteMap } from 'lib/noteMap';
import { store } from 'lib/store';
import { makeNote } from '../../../testUtils';
import useBacklinks, { computeBacklinks, computeLinkedBacklinks } from './useBacklinks';

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
    expect(computeLinkedBacklinks(NoteMap.from([self]), 'self', self.id)).toEqual([]);
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
    // unlinked = text matches of the title, not in links
    expect(result.current.unlinkedBacklinks.map((b) => b.id).sort()).toEqual(['/n/mention.md', '/n/table.md']);
  });

  test('is empty for unknown notes', () => {
    store.getState().setNotes(NoteMap.from(notes));
    const { result } = renderHook(() => useBacklinks('/n/unknown.md'));
    expect(result.current).toEqual({ linkedBacklinks: [], unlinkedBacklinks: [] });
  });
});

describe('computeBacklinks', () => {
  test('finds wiki links whose title looks like emphasis', () => {
    const draft = makeNote({ id: '/n/_draft_.md', title: '_draft_' });
    const init = makeNote({ id: '/n/__init__.md', title: '__init__' });
    const linker = makeNote({
      id: '/n/linker.md',
      title: 'linker',
      content: 'see [[_draft_]], [[__init__|the init]] and [md](_draft_)',
    });
    const notes = NoteMap.from([draft, init, linker]);
    const drafts = computeBacklinks(notes, '_draft_', draft.id).linkedBacklinks;
    expect(drafts.map((b) => b.id)).toEqual([linker.id]);
    expect(drafts[0].matches.map((m) => m.text)).toEqual(['_draft_', 'md']);
    const inits = computeBacklinks(notes, '__init__', init.id).linkedBacklinks;
    expect(inits[0].matches.map((m) => m.text)).toEqual(['the init']);
  });

  test('matches have offsets in the plain text context of the block', () => {
    const notes = NoteMap.from([
      makeNote({ id: '/n/a.md', title: 'a', content: '# head\n\nfoo *x* [[t]]\nbar t baz t' }),
    ]);
    const { linkedBacklinks, unlinkedBacklinks } = computeBacklinks(notes, 't');
    const [link] = linkedBacklinks[0].matches;
    expect(link).toMatchObject({ text: 't', context: 'foo x t bar t baz t', block: 1 });
    expect(link.context.slice(link.from, link.to)).toBe('t');
    // every occurrence not in a link
    expect(unlinkedBacklinks[0].matches.map((m) => m.from)).toEqual([12, 18]);
  });

  test('excludes the note itself by id, not other notes of same title', () => {
    const self = makeNote({ id: '/n/x.md', title: 'x', content: '[[x]]' });
    const twin = makeNote({ id: '/m/x.md', title: 'x', content: '[[x]]' });
    const result = computeBacklinks(NoteMap.from([self, twin]), 'x', self.id);
    expect(result.linkedBacklinks.map((b) => b.id)).toEqual([twin.id]);
  });

  test('follows note changes', () => {
    const a = makeNote({ id: '/n/a.md', title: 'a', content: '[[t]]' });
    expect(computeLinkedBacklinks(NoteMap.from([a]), 't')).toHaveLength(1);
    const changed = NoteMap.from([{ ...a, content: 'no link' }]);
    expect(computeLinkedBacklinks(changed, 't')).toHaveLength(0);
    expect(computeLinkedBacklinks(NoteMap.from([a]), 't')).toHaveLength(1);
  });

  test('ignores links to urls and malformed hrefs', () => {
    const a = makeNote({ id: '/n/a.md', title: 'a', content: '[x](https://t) [y](100%) t' });
    const result = computeBacklinks(NoteMap.from([a]), '100%');
    expect(result.linkedBacklinks.map((b) => b.id)).toEqual([a.id]);
    expect(computeBacklinks(NoteMap.from([a]), 'https://t').linkedBacklinks).toEqual([]);
  });
});
