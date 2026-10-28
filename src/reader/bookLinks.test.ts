import { beforeEach, describe, expect, test } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { NoteMap } from '@/lib/noteMap';
import { store } from '@/state/store';
import { makeNote, mockInvoke } from '@/testUtils';
import type { Issue } from '@/issue/types';
import { bookHref, serializeAnnotations } from './annotations';
import {
  findBook, issuesLinkingBook, linkedBookIds, notesLinkingBook, parseBookLink, searchBookItems,
} from './bookLinks';
import { setLibraryBooks } from './books';
import type { BookEntry } from './library';

const ID = '0123456789abcdef0123456789abcdef';
const OTHER = 'fedcba9876543210fedcba9876543210';
const book = (hash: string, title: string, author = '') =>
  ({ hash, file: `reading/${title}.epub`, title, author, format: 'EPUB', addedAt: '' }) as BookEntry;
const books = { [ID]: book(ID, 'Dune', 'Frank Herbert'), [OTHER]: book(OTHER, 'Emma', 'Jane Austen') };

describe('book links', () => {
  test('by id with a place, or by title', () => {
    expect(parseBookLink(`book:${ID.toUpperCase()}#epubcfi(%2F6%2F4)`)).toEqual({ ref: ID, cfi: 'epubcfi(/6/4)' });
    expect(parseBookLink('book:Dune%20Messiah')).toEqual({ ref: 'Dune Messiah' });
    expect(parseBookLink('issue:1')).toBeUndefined();
    expect(findBook(books, ID)?.title).toBe('Dune');
    expect(findBook(books, 'emma')?.hash).toBe(OTHER);
    expect(findBook(books, 'Nope')).toBeUndefined();
    expect(linkedBookIds(books, `{{emma}} [x](${bookHref(ID, 'epubcfi(/6)')}) {{Nope}}`)).toEqual([OTHER, ID]);
  });

  test('the notes and issues linking a book', () => {
    const a = makeNote({ id: '/ws/a.md', title: 'A', content: '{{Dune}}' });
    const b = makeNote({ id: '/ws/b.md', title: 'B', content: `[x](${bookHref(OTHER)})` });
    store.getState().setNotes(NoteMap.from({ [a.id]: a, [b.id]: b }));
    expect(notesLinkingBook(books, ID)).toEqual([{ id: a.id, title: 'A' }]);
    const issue = (number: number, body: string, comment = '') =>
      ({ number, body, timeline: [{ id: 'c', kind: 'comment', body: comment, createdAt: '' }] }) as Issue;
    const issues = [issue(1, 'none'), issue(2, '', `see [p](${bookHref(ID, 'x')})`), issue(3, '{{Emma}}')];
    expect(issuesLinkingBook(books, issues, ID).map((i) => i.number)).toEqual([2]);
  });
});

describe('searchBookItems', () => {
  beforeEach(() => {
    store.getState().setInitDir('/ws');
    setLibraryBooks('/ws', books);
  });

  test('books by title or author, then annotations by text or note', async () => {
    const annotations = serializeAnnotations({
      header: { hash: ID, title: 'Dune' },
      notes: [
        { id: '1', type: 'annotation', cfi: 'epubcfi(/6/4!/2)', text: 'Fear is the mind-killer.', note: '', chapter: 'One', createdAt: '', updatedAt: '' },
        { id: '2', type: 'annotation', cfi: 'epubcfi(/6/6!/2)', text: 'The spice must flow.', note: 'about fear too', createdAt: '', updatedAt: '' },
        { id: '3', type: 'bookmark', cfi: 'epubcfi(/6/8)', note: 'fear', createdAt: '', updatedAt: '' },
      ],
    });
    const notes = makeNote({ id: '/ws/reading/Dune.epub.md', title: 'Dune.epub', content: '' });
    store.getState().setNotes(NoteMap.from({ [notes.id]: notes }));
    mockInvoke(invoke, { read_file: annotations });

    expect(await searchBookItems('austen')).toEqual([{ title: 'Emma', subtitle: 'Jane Austen', url: bookHref(OTHER) }]);
    expect(await searchBookItems('fear')).toEqual([
      { title: 'Fear is the mind-killer.', subtitle: 'Dune · One', url: bookHref(ID, 'epubcfi(/6/4!/2)') },
      { title: 'The spice must flow.', subtitle: 'Dune', url: bookHref(ID, 'epubcfi(/6/6!/2)') },
    ]);
    expect(await searchBookItems(' ')).toEqual([]);
  });
});
