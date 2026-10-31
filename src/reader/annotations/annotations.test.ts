import {
  bookHref, bookPathOfAnnotations, parseAnnotations, parseBookHref, serializeAnnotations,
  type AnnotationsDoc, type BookNote,
} from './annotations';

const note = (partial: Partial<BookNote>): BookNote => ({
  id: 'n1',
  type: 'annotation',
  cfi: 'epubcfi(/6/4!/4/2,/1:0,/1:5)',
  note: '',
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z',
  ...partial,
});

const doc: AnnotationsDoc = {
  header: { hash: 'a'.repeat(32), title: 'A Book', author: 'Someone', file: 'A Book.epub' },
  notes: [
    note({ id: 'n1', chapter: 'One', text: 'First line\nsecond line', color: 'yellow', style: 'highlight', note: 'My **note** with [[Other]]' }),
    note({ id: 'n2', chapter: 'One', text: 'more', color: 'green', style: 'underline' }),
    note({ id: 'n3', chapter: 'Two', type: 'bookmark', cfi: 'epubcfi(/6/8!/4/2)', note: '## a heading\n\nin a note' }),
  ],
};

describe('annotations file', () => {
  test('is markdown to read', () => {
    const md = serializeAnnotations(doc);
    expect(md).toContain('# A Book\n\n*Someone*');
    expect(md).toContain('## One\n\n<!-- mdsilo:note');
    // the quote links back to its place in the book
    const back = `[↗ in book](${bookHref('a'.repeat(32), 'epubcfi(/6/4!/4/2,/1:0,/1:5)')})`;
    expect(md).toContain(`> First line\n> second line ${back}\n\nMy **note** with [[Other]]`);
    expect(md).toContain(`> more ${back}`);
    expect(md.match(/## One/g)).toHaveLength(1);
    expect(md).toContain('## Two');
  });

  test('round trips', () => {
    const parsed = parseAnnotations(serializeAnnotations(doc));
    expect(parsed.header).toEqual(doc.header);
    expect(parsed.notes).toEqual(doc.notes);
  });

  test('the quotes link back to their place, if the book is known; files without the links still read', () => {
    const md = serializeAnnotations({ notes: [note({ text: 'Some text' })] });
    expect(md).toContain('> Some text\n');
    expect(md).not.toContain('book:');
    const old = serializeAnnotations(doc).replace(/ \[↗ in book\]\(book:\S*\)/g, '');
    expect(old).not.toContain('↗');
    expect(parseAnnotations(old).notes).toEqual(doc.notes);
    // a bare ↗, as first written
    const bare = serializeAnnotations(doc).replace(/\[↗ in book\]/g, '[↗]');
    expect(parseAnnotations(bare).notes).toEqual(doc.notes);
  });

  test('keeps the notes as edited in the file', () => {
    const md = serializeAnnotations(doc).replace('My **note** with [[Other]]', 'Edited\n\n- a list');
    expect(parseAnnotations(md).notes[0].note).toBe('Edited\n\n- a list');
  });

  test('ignores broken markers and what is before the first note', () => {
    const md = [
      'Some intro',
      '<!-- mdsilo:note {broken} -->',
      `<!-- mdsilo:note ${JSON.stringify({ id: 'x', cfi: 'epubcfi(/6/2)', type: 'bookmark' })} -->`,
      'body',
      '<!-- mdsilo:note {"no":"id"} -->',
      'more body',
    ].join('\n');
    const parsed = parseAnnotations(md);
    expect(parsed.header).toBeUndefined();
    expect(parsed.notes).toEqual([{ id: 'x', cfi: 'epubcfi(/6/2)', type: 'bookmark', note: 'body\n<!-- mdsilo:note {"no":"id"} -->\nmore body' }]);
  });

  test('a comment end in the data does not break the file', () => {
    const md = serializeAnnotations({ notes: [note({ chapter: 'a --> b' })] });
    expect(md).not.toMatch(/a --> b"/);
    expect(parseAnnotations(md).notes[0].chapter).toBe('a --> b');
  });
});

describe('book links', () => {
  test('href of a place in a book', () => {
    const hash = '0123456789abcdef0123456789abcdef';
    const href = bookHref(hash, 'epubcfi(/6/4!/4/2,/1:0,/1:5)');
    expect(href).toBe(`book:${hash}#epubcfi(%2F6%2F4!%2F4%2F2%2C%2F1%3A0%2C%2F1%3A5)`);
    expect(parseBookHref(href)).toEqual({ hash, cfi: 'epubcfi(/6/4!/4/2,/1:0,/1:5)' });
    expect(parseBookHref(`book:${hash.toUpperCase()}`)).toEqual({ hash, cfi: undefined });
    expect(parseBookHref('book:nothex')).toBeUndefined();
    expect(parseBookHref('https://x')).toBeUndefined();
  });

  test('the book of an annotations file', () => {
    expect(bookPathOfAnnotations('/w/reading/A.epub.md')).toBe('/w/reading/A.epub');
    expect(bookPathOfAnnotations('/w/reading/A.PDF.md')).toBe('/w/reading/A.PDF');
    expect(bookPathOfAnnotations('/w/writing/A.md')).toBeUndefined();
  });
});
