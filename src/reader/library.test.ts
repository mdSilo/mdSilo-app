import { invoke } from '@tauri-apps/api/core';
import { gitignoreBlock, updateGitignore } from 'workspace/gitignore';
import { useWebFs } from '../testUtils';
import {
  importBookFile, readBookState, readLibrary, refreshLibrary, setBookSynced, writeBookState,
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
});
