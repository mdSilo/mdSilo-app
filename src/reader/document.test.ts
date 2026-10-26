import { makeEpub } from './testBook';
import {
  bookFormatOf, formatContributors, formatLanguageMap, isBookFile, openBook,
} from './document';

describe('book files', () => {
  test('by extension', () => {
    expect(isBookFile('/r/a.EPUB')).toBe(true);
    expect(isBookFile('/r/a.azw3')).toBe(true);
    expect(isBookFile('/r/a.epub.md')).toBe(false);
    expect(isBookFile('/r/epub')).toBe(false);
    expect(bookFormatOf('/r/x.fb2')).toBe('FB2');
  });

  test('metadata values', () => {
    expect(formatLanguageMap({ en: 'Title', fr: 'Titre' })).toBe('Title');
    expect(formatLanguageMap(undefined)).toBe('');
    expect(formatContributors([{ name: 'A' }, 'B', { name: { en: 'C' } }])).toBe('A, B, C');
  });

  test('opens an EPUB', async () => {
    const { book, format } = await openBook(makeEpub());
    expect(format).toBe('EPUB');
    expect(formatLanguageMap(book.metadata.title)).toBe('Tiny Book');
    expect(formatContributors(book.metadata.author)).toBe('Jane Doe');
    expect(book.sections).toHaveLength(2);
    expect(book.toc?.map((t) => t.label)).toEqual(['Chapter One', 'Chapter Two']);
    const doc = await book.sections[1].createDocument();
    expect(doc.body.textContent).toContain('striking thirteen');
  });

  test('refuses what is not a book', async () => {
    await expect(openBook(new File([], 'a.epub'))).rejects.toThrow('empty');
    await expect(openBook(new File(['just text'], 'a.txt'))).rejects.toThrow('Unsupported');
  });
});
