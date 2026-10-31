import {
  allGroups, breadcrumbs, countBooks, dropResult, filterBooks, formatSeries, hasGroup, isGroup, newGroupName, parseAuthors,
  plainText, shelfItems, sortShelf, withLibraryDefaults, type ShelfBook, type ShelfGroup, type ShelfItem,
} from './shelf';

const book = (title: string, more: Partial<ShelfBook> = {}): ShelfBook => ({
  hash: title, file: `reading/${title}.epub`, title, author: '', format: 'EPUB',
  addedAt: '2026-01-01T00:00:00Z', path: `/ws/reading/${title}.epub`, here: true, ...more,
});

const names = (items: ShelfItem[]) => items.map((i) => (isGroup(i) ? `[${i.name}]` : i.title));

describe('shelf', () => {
  test('filters by a regular expression or the words', () => {
    const books = [
      book('Dune', { author: 'Frank Herbert', series: 'Dune Chronicles' }),
      book('Emma', { author: 'Jane Austen', description: '<p>A <b>novel</b> of manners</p>', group: 'Classics' }),
      book('Notes', { format: 'PDF', status: 'Doing', subjects: ['Science'] }),
    ];
    expect(names(filterBooks(books, 'austen'))).toEqual(['Emma']);
    expect(names(filterBooks(books, '^d'))).toEqual(['Dune', 'Notes']);
    expect(names(filterBooks(books, '^du'))).toEqual(['Dune']);
    expect(names(filterBooks(books, 'novel of'))).toEqual(['Emma']);
    expect(names(filterBooks(books, 'classics'))).toEqual(['Emma']);
    expect(names(filterBooks(books, 'pdf'))).toEqual(['Notes']);
    expect(names(filterBooks(books, 'doing|science'))).toEqual(['Notes']);
    // not a regular expression: the text as is
    expect(names(filterBooks(books, '(dune'))).toEqual([]);
    expect(names(filterBooks(books, '  '))).toHaveLength(3);
  });

  test('the groups of the user, nested', () => {
    const books = [
      book('A', { group: 'Fiction' }),
      book('B', { group: 'Fiction/Classics' }),
      book('C', { group: 'Fiction/Classics/Old' }),
      book('D'),
      book('E', { group: 'Science' }),
    ];
    expect(names(shelfItems(books, 'group'))).toEqual(['[Fiction]', '[Science]', 'D']);
    expect((shelfItems(books, 'group')[0] as ShelfGroup).books).toHaveLength(3);
    expect(names(shelfItems(books, 'group', 'Fiction'))).toEqual(['[Classics]', 'A']);
    const classics = shelfItems(books, 'group', 'Fiction')[0] as ShelfGroup;
    expect(classics.key).toBe('Fiction/Classics');
    expect(names(shelfItems(books, 'group', 'Fiction/Classics'))).toEqual(['[Old]', 'B']);
    expect(hasGroup(books, 'group', 'Fiction/Classics')).toBe(true);
    expect(hasGroup(books, 'group', 'Fict')).toBe(false);
    expect(shelfItems(books, 'none')).toHaveLength(5);
  });

  test('by author, series, status', () => {
    const books = [
      book('A', { author: 'Jane Doe, John Roe', series: 'S', status: 'Done' }),
      book('B', { author: 'John Roe & Kim', series: 'S' }),
      book('C'),
    ];
    // a book of two authors in both
    expect(names(shelfItems(books, 'author'))).toEqual(['[Jane Doe]', '[John Roe]', '[Kim]', 'C']);
    expect(names(shelfItems(books, 'author', 'John Roe'))).toEqual(['A', 'B']);
    expect(names(shelfItems(books, 'series'))).toEqual(['[S]', 'C']);
    expect(names(shelfItems(books, 'status'))).toEqual(['[Done]', 'B', 'C']);
    expect(names(shelfItems(books, 'status', 'Todo'))).toEqual([]);
    expect(countBooks(shelfItems(books, 'author'))).toBe(5);
  });

  test('sorts the books and the groups among them', () => {
    const books = [
      book('Beta', { author: 'Zed', addedAt: '2026-03-01', state: { updatedAt: '2026-05-01' } }),
      book('alpha', { author: 'Amy', addedAt: '2026-01-01', state: { updatedAt: '2026-06-01' } }),
      book('Gamma', { group: 'G', addedAt: '2026-02-01', state: { updatedAt: '2026-07-01' } }),
      book('Delta', { group: 'G', addedAt: '2026-04-01' }),
    ];
    const items = shelfItems(books, 'group');
    expect(names(sortShelf(items, 'title', true, 'group'))).toEqual(['alpha', 'Beta', '[G]']);
    // the group as its latest read book
    expect(names(sortShelf(items, 'read', false, 'group'))).toEqual(['[G]', 'alpha', 'Beta']);
    expect(names(sortShelf(items, 'added', false, 'group'))).toEqual(['[G]', 'Beta', 'alpha']);
    const [group] = sortShelf(items, 'title', true, 'group').filter(isGroup);
    expect(names(group.books)).toEqual(['Delta', 'Gamma']);
    expect(names(sortShelf(shelfItems(books, 'none'), 'author', true, 'none'))).toEqual(['Delta', 'Gamma', 'alpha', 'Beta']);
  });

  test('the books of a series by their index, always ascending', () => {
    const books = [
      book('Three', { series: 'S', seriesIndex: 3 }),
      book('One', { series: 'S', seriesIndex: 1 }),
      book('Extra', { series: 'S' }),
      book('Two', { series: 'S', seriesIndex: 2 }),
    ];
    expect(names(sortShelf(shelfItems(books, 'series', 'S'), 'title', false, 'series', 'S')))
      .toEqual(['One', 'Two', 'Three', 'Extra']);
    const [group] = sortShelf(shelfItems(books, 'series'), 'title', false, 'series').filter(isGroup);
    expect(names(group.books)).toEqual(['One', 'Two', 'Three', 'Extra']);
    // by series: the name, then the index
    const mixed = [book('B2', { series: 'B', seriesIndex: 2 }), book('A1', { series: 'A', seriesIndex: 1 }), book('B1', { series: 'B', seriesIndex: 1 })];
    expect(names(sortShelf(mixed, 'series', true, 'none'))).toEqual(['A1', 'B1', 'B2']);
  });

  test('the bits', () => {
    expect(parseAuthors('Jane Doe and John Roe; Kim')).toEqual(['Jane Doe', 'John Roe', 'Kim']);
    expect(formatSeries({ series: 'Dune', seriesIndex: 2, seriesTotal: 6 })).toBe('Dune #2 of 6');
    expect(formatSeries({ series: 'Dune' })).toBe('Dune');
    expect(plainText('<p>A &amp; <b>B</b></p>')).toBe('A & B');
    expect(breadcrumbs('A/B/C').map((c) => c.path)).toEqual(['A', 'A/B', 'A/B/C']);
    expect(breadcrumbs('')).toEqual([]);
    expect(newGroupName({ title: 'Pride and Prejudice' }, { title: 'A/B' }, 'Fiction')).toBe('Fiction/Pride-A B');
    expect(allGroups([{ group: 'A/B' }, { group: 'C' }, {}])).toEqual(['A', 'A/B', 'C']);
    expect(withLibraryDefaults({ view: 'list', sortBy: 'nope' as never })).toEqual({
      view: 'list', groupBy: 'group', sortBy: 'read', ascending: false,
    });
  });

  test('a book dropped onto a book, a group, a breadcrumb', () => {
    const books = [book('Alpha'), book('Beta'), book('Gamma', { group: 'G/H' })];
    expect(dropResult(books, 'book:Alpha', 'book:Beta', 'none')).toEqual({ hashes: ['Alpha', 'Beta'], group: 'Alpha-Beta' });
    // in the group opened
    expect(dropResult(books, 'book:Alpha', 'book:Gamma', 'group', 'G')).toEqual({ hashes: ['Alpha', 'Gamma'], group: 'G/Alpha-Gamma' });
    expect(dropResult(books, 'book:Alpha', 'group:G/H', 'group')).toEqual({ hashes: ['Alpha'], group: 'G/H' });
    // not a group of the user
    expect(dropResult(books, 'book:Alpha', 'group:Jane', 'author')).toBeUndefined();
    expect(dropResult(books, 'book:Gamma', 'crumb:', 'group', 'G/H')).toEqual({ hashes: ['Gamma'], group: '' });
    expect(dropResult(books, 'book:Gamma', 'crumb:G/H', 'group', 'G/H')).toBeUndefined();
    expect(dropResult(books, 'book:Alpha', 'book:Alpha', 'none')).toBeUndefined();
    expect(dropResult(books, 'group:G', 'book:Alpha', 'group')).toBeUndefined();
  });
});
