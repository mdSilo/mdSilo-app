import { invoke } from '@tauri-apps/api/core';
import { gitignoreBlock, updateGitignore } from '@/workspace/gitignore';
import { useWebFs } from '../testUtils';
import type { BookDoc } from './document';
import {
  bookMetaOf, deleteBook, deleteBooks, importBookData, importBookFile, readBookState, readLibrary, refreshLibrary,
  renameGroup, saveBookEntry, setBookSynced, setBooksGroup, setBooksSynced, withBookMeta, writeBookState, type BookEntry,
} from './library';

const WS = '/mdSilo';
const write = (filePath: string, text: string) => invoke('write_file', { filePath, text });
const read = (filePath: string) => invoke<string>('read_file', { filePath });
const hashOf = (filePath: string) => invoke<string>('book_hash', { filePath });

beforeEach(async () => {
  await useWebFs();
});

describe('library', () => {
  test('finds the books in reading/ and follows them when moved', async () => {
    await write(`${WS}/reading/A Book.epub`, 'epub bytes');
    await write(`${WS}/reading/sub/B.pdf`, 'pdf bytes');
    await write(`${WS}/reading/A Book.epub.md`, 'notes');
    await write(`${WS}/reading/.hidden/C.epub`, 'hidden');
    const lib = await refreshLibrary(WS);
    const books = Object.values(lib.books);
    expect(books.map((b) => [b.file, b.title, b.format]).sort()).toEqual([
      ['reading/A Book.epub', 'A Book', 'EPUB'],
      ['reading/sub/B.pdf', 'B', 'PDF'],
    ]);
    const hash = await hashOf(`${WS}/reading/A Book.epub`);
    expect(lib.books[hash].file).toBe('reading/A Book.epub');
    expect(JSON.parse(await read(`${WS}/.mdsilo/books.json`)).books[hash].title).toBe('A Book');
    // not synced by default
    expect(await read(`${WS}/reading/.gitignore`)).toContain('*.epub');

    // renamed: the same book
    await invoke('rename_file', { fromPath: `${WS}/reading/A Book.epub`, toPath: `${WS}/reading/Renamed.epub` });
    const moved = await refreshLibrary(WS);
    expect(Object.keys(moved.books)).toHaveLength(2);
    expect(moved.books[hash].file).toBe('reading/Renamed.epub');
    expect(moved.books[hash].title).toBe('A Book');
  });

  test('keeps the books not on this device', async () => {
    await write(`${WS}/.mdsilo/books.json`, JSON.stringify({
      version: 1,
      books: { ['f'.repeat(32)]: { file: 'reading/Elsewhere.epub', title: 'Elsewhere', author: '', format: 'EPUB', addedAt: '' } },
    }));
    const lib = await refreshLibrary(WS);
    expect(lib.books['f'.repeat(32)].title).toBe('Elsewhere');
  });

  test('imports a book file into reading/, once', async () => {
    await write('/downloads/X.epub', 'x bytes');
    const path = await importBookFile(WS, '/downloads/X.epub');
    expect(path).toBe(`${WS}/reading/X.epub`);
    expect(await read(path!)).toBe('x bytes');
    // the same book again: the copy there
    expect(await importBookFile(WS, '/downloads/X.epub')).toBe(path);
    // another book of the same name
    await write('/other/X.epub', 'other bytes');
    expect(await importBookFile(WS, '/other/X.epub')).toBe(`${WS}/reading/X-1.epub`);
    // in reading/ already
    expect(await importBookFile(WS, path!)).toBe(path);
  });

  test('a book chosen to sync is in the .gitignore', async () => {
    await write(`${WS}/reading/sub/My #1.epub`, 'bytes');
    await write(`${WS}/reading/.gitignore`, '# mine\n*.tmp\n');
    const lib = await refreshLibrary(WS);
    const hash = Object.keys(lib.books)[0];
    await setBookSynced(WS, hash, true);
    expect((await readLibrary(WS)).books[hash].synced).toBe(true);
    const gitignore = await read(`${WS}/reading/.gitignore`);
    expect(gitignore.startsWith('# mine\n*.tmp\n\n# >>> mdSilo')).toBe(true);
    expect(gitignore).toContain('!/sub/My \\#1.epub');
    await setBookSynced(WS, hash, false);
    expect(await read(`${WS}/reading/.gitignore`)).not.toContain('My');
  });

  test('the reading state of a book', async () => {
    expect(await readBookState(WS, 'a'.repeat(32))).toBeUndefined();
    await writeBookState(WS, 'a'.repeat(32), { location: 'epubcfi(/6/2)', fraction: 0.5, updatedAt: 'x' });
    expect(await readBookState(WS, 'a'.repeat(32))).toEqual({ location: 'epubcfi(/6/2)', fraction: 0.5, updatedAt: 'x' });
  });
});

describe('gitignore', () => {
  test('replaces its block only', () => {
    const once = updateGitignore('', ['a.epub']);
    expect(once).toBe(`${gitignoreBlock(['a.epub'])}\n`);
    const edited = `top\n${once}bottom\n`;
    expect(updateGitignore(edited, [])).toBe(`top\n${gitignoreBlock([])}\nbottom\n`);
  });

  test('the metadata of a book file, unless edited', () => {
    const book = {
      metadata: {
        title: { en: 'Dune' }, author: [{ name: 'Frank Herbert' }], subtitle: 'A novel',
        publisher: { name: 'Chilton' }, published: '1965', language: ['en'], identifier: 'urn:isbn:9780441013593',
        subject: [{ name: 'Science fiction' }, 'Deserts, arid'], description: '<p>Arrakis</p>',
        belongsTo: { series: [{ name: 'Dune Chronicles', position: '1' }] },
      },
    } as unknown as BookDoc;
    const meta = bookMetaOf(book, '/ws/reading/file.epub');
    expect(meta).toEqual({
      title: 'Dune', author: 'Frank Herbert', subtitle: 'A novel', series: 'Dune Chronicles', seriesIndex: 1,
      publisher: 'Chilton', published: '1965', language: ['en'], identifier: '9780441013593',
      subjects: ['Science fiction', 'Deserts, arid'], description: '<p>Arrakis</p>',
    });
    expect(bookMetaOf({ metadata: {} } as BookDoc, '/ws/reading/file.epub').title).toBe('file');
    const entry: BookEntry = { hash: 'h', file: 'reading/file.epub', title: 'file', author: '', format: 'EPUB', addedAt: '', group: 'G' };
    expect(withBookMeta(entry, meta)).toMatchObject({ title: 'Dune', group: 'G', metaRead: true });
    // the edits of the user kept
    const edited = { ...entry, title: 'My Dune', edited: true };
    expect(withBookMeta(edited, meta)).toEqual({ ...edited, metaRead: true });
  });

  test('groups: set, renamed with the sub groups, removed', async () => {
    await write(`${WS}/reading/A.epub`, 'a');
    await write(`${WS}/reading/B.epub`, 'b');
    await write(`${WS}/reading/C.epub`, 'c');
    const [a, b, c] = await Promise.all(['A', 'B', 'C'].map((n) => hashOf(`${WS}/reading/${n}.epub`)));
    await refreshLibrary(WS);
    await setBooksGroup(WS, [a, b], ' Fiction / Old ');
    await setBooksGroup(WS, [c], 'Fiction');
    const groups = async () => {
      const lib = await readLibrary(WS);
      return [a, b, c].map((h) => lib.books[h].group);
    };
    expect(await groups()).toEqual(['Fiction/Old', 'Fiction/Old', 'Fiction']);
    await renameGroup(WS, 'Fiction', 'Novels');
    expect(await groups()).toEqual(['Novels/Old', 'Novels/Old', 'Novels']);
    // ungrouped: up to the parent
    await renameGroup(WS, 'Novels/Old', '');
    expect(await groups()).toEqual(['Novels', 'Novels', 'Novels']);
    await setBooksGroup(WS, [a], '');
    expect((await readLibrary(WS)).books[a].group).toBeUndefined();
  });

  test('deletes a book, its notes if asked', async () => {
    await write(`${WS}/reading/A.epub`, 'a');
    await write(`${WS}/reading/A.epub.md`, 'notes');
    await write(`${WS}/reading/B.epub`, 'b');
    await write(`${WS}/reading/B.epub.md`, 'notes');
    const [a, b] = await Promise.all(['A', 'B'].map((n) => hashOf(`${WS}/reading/${n}.epub`)));
    await refreshLibrary(WS);
    await setBookSynced(WS, a, true);
    await writeBookState(WS, a, { location: 'x', updatedAt: '' });
    await deleteBook(WS, a);
    await deleteBook(WS, b, true);
    const exists = (p: string) => invoke<boolean>('file_exist', { filePath: `${WS}/${p}` });
    expect(await exists('reading/A.epub')).toBe(false);
    expect(await exists('reading/A.epub.md')).toBe(true);
    expect(await exists(`.mdsilo/books/${a}.json`)).toBe(false);
    expect(await exists('reading/B.epub.md')).toBe(false);
    expect(Object.keys((await readLibrary(WS)).books)).toEqual([]);
    expect(await read(`${WS}/reading/.gitignore`)).not.toContain('A.epub');
  });

  test('writes a book dropped in, not over another one', async () => {
    await write(`${WS}/reading/A.epub`, 'a');
    expect(await importBookData(WS, 'A.epub', new Uint8Array([1, 2]))).toBe(`${WS}/reading/A-1.epub`);
    await saveBookEntry(WS, { hash: 'x', file: 'reading/A-1.epub', title: 'A', author: '', format: 'EPUB', addedAt: '' });
    expect((await readLibrary(WS)).books.x.title).toBe('A');
  });

  test('the files of some books synced at once', async () => {
    await write(`${WS}/reading/A.epub`, 'a');
    await write(`${WS}/reading/B.epub`, 'b');
    await write(`${WS}/reading/C.epub`, 'c');
    const [a, b, c] = await Promise.all(['A', 'B', 'C'].map((n) => hashOf(`${WS}/reading/${n}.epub`)));
    await refreshLibrary(WS);
    await setBooksSynced(WS, [a, b, 'gone'], true);
    const gitignore = await read(`${WS}/reading/.gitignore`);
    expect(gitignore).toContain('!/A.epub');
    expect(gitignore).toContain('!/B.epub');
    expect(gitignore).not.toContain('!/C.epub');
    await setBooksSynced(WS, [a, c], false);
    const lib = await readLibrary(WS);
    expect([a, b, c].map((h) => Boolean(lib.books[h].synced))).toEqual([false, true, false]);
  });

  test('deletes some books at once', async () => {
    for (const n of ['A', 'B', 'C']) {
      await write(`${WS}/reading/${n}.epub`, n);
      await write(`${WS}/reading/${n}.epub.md`, 'notes');
    }
    const [a, b, c] = await Promise.all(['A', 'B', 'C'].map((n) => hashOf(`${WS}/reading/${n}.epub`)));
    await refreshLibrary(WS);
    await deleteBooks(WS, [a, b, 'gone'], true);
    const exists = (p: string) => invoke<boolean>('file_exist', { filePath: `${WS}/reading/${p}` });
    expect(await Promise.all(['A.epub', 'A.epub.md', 'B.epub', 'C.epub', 'C.epub.md'].map(exists)))
      .toEqual([false, false, false, true, true]);
    expect(Object.keys((await readLibrary(WS)).books)).toEqual([c]);
  });
});
