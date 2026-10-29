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

  test('the text files made books when imported; the icons of the formats', async () => {
    const { convertibleFormatOf } = await import('./document');
    const { bookIconOf } = await import('./components/BookIcon');
    expect(convertibleFormatOf('/r/a.TXT')).toBe('TXT');
    expect(convertibleFormatOf('/r/a.markdown')).toBe('Markdown');
    expect(convertibleFormatOf('/r/a.epub')).toBeUndefined();
    const icons = 
      ['a.md', 'a.epub', 'a.pdf', 'a.azw3', 'a.fb2', 'a.cbz', 'a.txt', 'a.html', 'a.zip'].map(
        (p) => bookIconOf(p)
      );
    expect(
      icons.map(
        (i) => i?.label)
      )
      .toEqual(['Markdown', 'EPUB', 'PDF', 'AZW3', 'FB2', 'CBZ', 'TXT', 'HTML', 'ZIP']
    );
    // each its own
    expect(new Set(icons.map((i) => i?.icon)).size).toBe(icons.length);
    // the images as they are
    expect(bookIconOf('a.png')).toBeUndefined();
  });

  test('refuses what is not a book', async () => {
    await expect(openBook(new File([], 'a.epub'))).rejects.toThrow('empty');
    await expect(openBook(new File(['just text'], 'a.txt'))).rejects.toThrow('Unsupported');
  });
});

describe('the text of a book for the search', () => {
  test('by sections, labelled by the contents', async () => {
    const { indexBookText, sectionLabels } = await import('./bookIndex');
    const { invoke } = await import('@tauri-apps/api/core');
    const { mockInvoke } = await import('../testUtils');
    const { book } = await openBook(makeEpub());
    expect([...sectionLabels(book)]).toEqual([[0, 'Chapter One'], [1, 'Chapter Two']]);
    mockInvoke(invoke, { index_book_indexed: false, index_book: undefined });
    await indexBookText('h1', 'Tiny Book', book);
    const call = vi.mocked(invoke).mock.calls.find((c) => c[0] === 'index_book');
    expect(call?.[1]).toEqual({
      hash: 'h1',
      title: 'Tiny Book',
      sections: [
        { cfi: expect.stringMatching(/^epubcfi\(\/6\/2/), label: 'Chapter One', text: 'Chapter 1 It was a bright cold day in April.' },
        { cfi: expect.stringMatching(/^epubcfi\(\/6\/4/), label: 'Chapter Two', text: 'Chapter 2 The clocks were striking thirteen.' },
      ],
    });
    // indexed already: not again
    vi.mocked(invoke).mockClear();
    mockInvoke(invoke, { index_book_indexed: true });
    await indexBookText('h1', 'Tiny Book', book);
    expect(vi.mocked(invoke).mock.calls.some((c) => c[0] === 'index_book')).toBe(false);
  });
});
