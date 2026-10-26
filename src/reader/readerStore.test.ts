import { invoke } from '@tauri-apps/api/core';
import { store } from 'lib/store';
import { useWebFs } from '../testUtils';
import { serializeAnnotations, type BookNote } from './annotations';
import { readBookState, readLibrary } from './library';
import { readBookFile, resetReaderStore, useReaderStore } from './readerStore';

const book = vi.hoisted(() => ({
  destroy: vi.fn(),
  metadata: { title: { en: 'The Title' }, author: [{ name: 'An Author' }, 'Another'] },
  sections: [],
  toc: [{ label: 'One', href: 'one.xhtml' }],
  getCover: async () => null,
}));

vi.mock('./document', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./document')>()),
  openBook: vi.fn(async () => ({ book, format: 'EPUB' })),
}));

const WS = '/mdSilo';
const BOOK = `${WS}/reading/A.epub`;
const read = (filePath: string) => invoke<string>('read_file', { filePath });

const note = (partial: Partial<BookNote>): BookNote => ({
  id: 'n1', type: 'annotation', cfi: 'epubcfi(/6/4!/4/2,/1:0,/1:5)', text: 'quoted', color: 'yellow',
  style: 'highlight', note: '', createdAt: 'c', updatedAt: 'u', ...partial,
});

beforeEach(async () => {
  await useWebFs();
  store.setState({ initDir: WS, layout: 'workspace' });
  await invoke('write_file', { filePath: BOOK, text: 'epub bytes' });
});

afterEach(() => {
  resetReaderStore();
});

describe('readerStore', () => {
  test('reads a book file as binary', async () => {
    const file = await readBookFile(BOOK);
    expect(file.name).toBe('A.epub');
    expect(await file.text()).toBe('epub bytes');
  });

  test('opens a book with its annotations and adds it to the library', async () => {
    await invoke('write_file', {
      filePath: `${BOOK}.md`,
      text: serializeAnnotations({ notes: [note({ note: 'mine' })] }),
    });
    await useReaderStore.getState().open(BOOK);
    const state = useReaderStore.getState();
    expect(state.status).toBe('ready');
    expect(state.notes.map((n) => [n.id, n.note])).toEqual([['n1', 'mine']]);
    const hash = await invoke<string>('book_hash', { filePath: BOOK });
    expect(state.hash).toBe(hash);
    expect(state.entry).toMatchObject({ title: 'The Title', author: 'An Author, Another', file: 'reading/A.epub' });
    expect((await readLibrary(WS)).books[hash].title).toBe('The Title');
  });

  test('saves the annotations next to the book, as a note', async () => {
    await useReaderStore.getState().open(BOOK);
    useReaderStore.getState().addNote(note({ id: 'b', cfi: 'epubcfi(/6/6!/4/2,/1:0,/1:3)', chapter: 'Two' }));
    useReaderStore.getState().addNote(note({ id: 'a', chapter: 'One', note: 'first [[Note]]' }));
    await useReaderStore.getState().flush();
    const md = await read(`${BOOK}.md`);
    expect(md).toContain('# The Title');
    // in the order of the book
    expect(md.indexOf('## One')).toBeLessThan(md.indexOf('## Two'));
    expect(md).toContain('first [[Note]]');
    // in the store, for backlinks and search
    expect(store.getState().notes.get(`${BOOK}.md`)?.content).toBe(md);

    useReaderStore.getState().updateNote('a', { note: 'edited' });
    useReaderStore.getState().removeNote('b');
    await useReaderStore.getState().flush();
    const after = await read(`${BOOK}.md`);
    expect(after).toContain('edited');
    expect(after).not.toContain('## Two');
    expect(store.getState().notes.get(`${BOOK}.md`)?.content).toBe(after);
  });

  test('keeps the place read, and opens the book there', async () => {
    await useReaderStore.getState().open(BOOK);
    const hash = useReaderStore.getState().hash!;
    useReaderStore.getState().setLocation({ cfi: 'epubcfi(/6/8)', fraction: 0.4, tocLabel: 'Four' });
    await useReaderStore.getState().close();
    expect(book.destroy).toHaveBeenCalled();
    expect(useReaderStore.getState().status).toBe('idle');
    expect(await readBookState(WS, hash)).toMatchObject({ location: 'epubcfi(/6/8)', fraction: 0.4 });

    await useReaderStore.getState().open(BOOK);
    expect(useReaderStore.getState().initialCfi).toBe('epubcfi(/6/8)');
    // a link to a place wins
    await useReaderStore.getState().close();
    await useReaderStore.getState().open(BOOK, 'epubcfi(/6/2)');
    expect(useReaderStore.getState().initialCfi).toBe('epubcfi(/6/2)');
    // the same book again, to another place
    await useReaderStore.getState().open(BOOK, 'epubcfi(/6/10)');
    expect(useReaderStore.getState().initialCfi).toBe('epubcfi(/6/10)');
  });

  test('a book failing to open', async () => {
    const { openBook } = await import('./document');
    vi.mocked(openBook).mockRejectedValueOnce(new Error('Unsupported book format'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await useReaderStore.getState().open(BOOK);
    expect(err).toHaveBeenCalled();
    expect(useReaderStore.getState()).toMatchObject({ status: 'error', error: 'Unsupported book format' });
  });
});
