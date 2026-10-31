import { invoke } from '@tauri-apps/api/core';
import { useWebFs } from '../../testUtils';
import { importFolder, scanFolder, withImportDefaults } from './folderImport';
import { readLibrary, refreshLibrary, setBooksGroup } from './library';

const WS = '/mdSilo';
const write = (filePath: string, text: string) => invoke('write_file', { filePath, text });
const KB = 'x'.repeat(1024);

beforeEach(async () => {
  await useWebFs();
});

const groupsOf = async () =>
  Object.fromEntries(Object.values((await readLibrary(WS)).books).map((b) => [b.file, b.group ?? '']));

describe('import from a folder', () => {
  beforeEach(async () => {
    await write('/books/Top.epub', `top ${KB}`);
    await write('/books/Paper.pdf', `pdf ${KB}`);
    await write('/books/Fiction/Novel.epub', `novel ${KB}`);
    await write('/books/Fiction/Old/Classic.epub', `classic ${KB}`);
    await write('/books/Fiction/Tiny.epub', 'tiny');
    await write('/books/Comics/Strip.cbz', `strip ${KB}`);
    await write('/books/notes.txt', `notes ${KB}`);
    await write('/books/.hidden/Secret.epub', `secret ${KB}`);
  });

  test('finds the books of the formats, larger than the size', async () => {
    const found = await scanFolder({ dir: '/books', formats: ['epub'], minSizeKB: 1, flatten: false });
    expect(found.map((f) => [f.path, f.folder])).toEqual([
      ['/books/Fiction/Novel.epub', 'books/Fiction'],
      ['/books/Fiction/Old/Classic.epub', 'books/Fiction/Old'],
      ['/books/Top.epub', 'books'],
    ]);
    const all = await scanFolder({ dir: '/books', formats: ['epub', 'pdf', 'cbz'], minSizeKB: 0, flatten: false });
    expect(all.map((f) => f.path.split('/').pop())).toEqual(['Strip.cbz', 'Novel.epub', 'Classic.epub', 'Tiny.epub', 'Paper.pdf', 'Top.epub']);
  });

  test('copied into reading/, grouped by their folders', async () => {
    const found = await scanFolder({ dir: '/books', formats: ['epub', 'pdf'], minSizeKB: 1, flatten: false });
    const progress: number[] = [];
    const result = await importFolder(WS, found, { flatten: false }, (done) => progress.push(done));
    expect(result).toEqual({ added: 4, existing: 0, failed: [] });
    expect(progress).toEqual([0, 1, 2, 3, 4]);
    expect(await groupsOf()).toEqual({
      'reading/Novel.epub': 'books/Fiction',
      'reading/Classic.epub': 'books/Fiction/Old',
      'reading/Paper.pdf': 'books',
      'reading/Top.epub': 'books',
    });
    expect(await invoke<boolean>('file_exist', { filePath: '/books/Top.epub' })).toBe(true);
  });

  test('all in one group; the books there already not copied again, moved', async () => {
    await write(`${WS}/reading/Mine.epub`, `top ${KB}`);
    await write('/books/Fiction/Copy of Novel.epub', `novel ${KB}`);
    await refreshLibrary(WS);
    const lib = await readLibrary(WS);
    await setBooksGroup(WS, Object.keys(lib.books), 'Old group');

    const found = await scanFolder({ dir: '/books', formats: ['epub'], minSizeKB: 1, flatten: true });
    const result = await importFolder(WS, found, { flatten: true, group: 'Shelf' });
    // Top.epub is Mine.epub; the novel, the copy of it found first
    expect(result).toEqual({ added: 2, existing: 2, failed: [] });
    expect(await groupsOf()).toEqual({
      'reading/Mine.epub': 'Shelf',
      'reading/Copy of Novel.epub': 'Shelf',
      'reading/Classic.epub': 'Shelf',
    });
    expect(await invoke<boolean>('file_exist', { filePath: `${WS}/reading/Top.epub` })).toBe(false);
  });

  test('the options stored, valid ones', () => {
    expect(withImportDefaults()).toEqual({ dir: '', formats: ['epub', 'pdf'], minSizeKB: 20, flatten: false });
    expect(withImportDefaults({ dir: '/b', formats: ['nope'], minSizeKB: -1, flatten: true }))
      .toEqual({ dir: '/b', formats: ['epub', 'pdf'], minSizeKB: 20, flatten: true });
    expect(withImportDefaults({ formats: ['cbz'], minSizeKB: 0 })).toMatchObject({ formats: ['cbz'], minSizeKB: 0 });
  });
});
