import { Blob as NodeBlob } from 'node:buffer';
import { invoke } from '@tauri-apps/api/core';
import { store } from '@/lib/store';
import { getStrDate } from '@/lib/helper';
import { useWebFs } from '../testUtils';
import { writeFile } from '../platform/web/fs';
import { serializeAnnotations, type BookNote } from './annotations';
import { readBookState, readLibrary } from './library';
import { IDLE_MS, readBookFile, resetReaderStore, TICK_MS, useReaderStore, useSideStore } from './readerStore';
import { formatDuration, readingTimeByDay, totalSeconds } from './stats';
import { cacheCover, coverPathOf, coverUrl } from './covers';
import type { BookDoc } from './document';

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

  test('closed while it opens: not left open', async () => {
    const opening = useReaderStore.getState().open(BOOK);
    await useReaderStore.getState().close();
    await opening;
    expect(useReaderStore.getState()).toMatchObject({ status: 'idle', path: undefined, book: undefined });
  });

  test('another book opened meanwhile: that one open', async () => {
    const other = `${WS}/reading/B.epub`;
    await invoke('write_file', { filePath: other, text: 'other bytes' });
    const first = useReaderStore.getState().open(BOOK);
    const second = useReaderStore.getState().open(other);
    await Promise.all([first, second]);
    expect(useReaderStore.getState()).toMatchObject({ status: 'ready', path: other });
  });

  test('the book beside: a store of its own, its own annotations', async () => {
    const other = `${WS}/reading/B.epub`;
    await invoke('write_file', { filePath: other, text: 'other bytes' });
    await useReaderStore.getState().open(BOOK);
    await useSideStore.getState().open(other);
    useSideStore.getState().addNote(note({ id: 'side' }));
    await useSideStore.getState().flush();
    expect(useReaderStore.getState().notes).toEqual([]);
    expect(await read(`${other}.md`)).toContain('> quoted');
    expect(await read(`${BOOK}.md`).catch(() => '')).toBe('');
    // closed alone: the book read stays
    await useSideStore.getState().close();
    expect(useReaderStore.getState()).toMatchObject({ status: 'ready', path: BOOK });
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

  test('a book written again (a feed book) opens by its first id, its place kept', async () => {
    const id = 'f'.repeat(32);
    const fileHash = await invoke<string>('book_hash', { filePath: BOOK });
    const entry = { file: 'reading/A.epub', title: 'A', author: '', format: 'EPUB', addedAt: '', feed: 'A' };
    const writeLibrary = (extra: object) => invoke('write_file', {
      filePath: `${WS}/.mdsilo/books.json`,
      text: JSON.stringify({ version: 1, books: { [id]: { ...entry, ...extra } } }),
    });
    await invoke('write_file', { filePath: `${WS}/.mdsilo/books/${id}.json`, text: JSON.stringify({ location: 'epubcfi(/6/6)' }) });
    await writeLibrary({ fileHash });
    await useReaderStore.getState().open(BOOK);
    expect(useReaderStore.getState()).toMatchObject({ hash: id, initialCfi: 'epubcfi(/6/6)' });
    await useReaderStore.getState().close();

    // its hash not up to date (the file synced, the library not yet): by its file
    await writeLibrary({ fileHash: '0'.repeat(32) });
    await useReaderStore.getState().open(BOOK);
    expect(useReaderStore.getState().hash).toBe(id);
    const lib = await readLibrary(WS);
    expect(Object.keys(lib.books)).toEqual([id]);
    expect(lib.books[id].fileHash).toBe(fileHash);
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

describe('the time read', () => {
  test('is counted while reading, and kept', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    try {
      await useReaderStore.getState().open(BOOK);
      const hash = useReaderStore.getState().hash!;
      await vi.advanceTimersByTimeAsync(TICK_MS * 2);
      const day = getStrDate(new Date().toString());
      expect(useReaderStore.getState().time[day]).toBe(60);
      // away: no page turned for long
      await vi.advanceTimersByTimeAsync(IDLE_MS + TICK_MS * 2);
      const away = useReaderStore.getState().time[day];
      await vi.advanceTimersByTimeAsync(TICK_MS * 2);
      expect(useReaderStore.getState().time[day]).toBe(away);
      // back
      useReaderStore.getState().touch();
      await vi.advanceTimersByTimeAsync(TICK_MS);
      expect(useReaderStore.getState().time[day]).toBe(away + 30);
      await useReaderStore.getState().close();
      expect((await readBookState(WS, hash))?.time?.[day]).toBe(away + 30);
      expect(await readingTimeByDay(WS)).toEqual({ [day]: away + 30 });
    } finally {
      vi.useRealTimers();
    }
  });

  test('formats', () => {
    expect(formatDuration(20)).toBe('<1m');
    expect(formatDuration(300)).toBe('5m');
    expect(formatDuration(4800)).toBe('1h 20m');
    expect(formatDuration(7200)).toBe('2h');
    expect(totalSeconds({ a: 60, b: 30, c: -5 })).toBe(90);
  });
});

describe('covers', () => {
  test('cached on this device, if the browser can draw them', async () => {
    const hash = 'a'.repeat(32);
    const fake = { getCover: async () => new Blob(['img']) } as unknown as BookDoc;
    // no createImageBitmap in jsdom
    expect(await cacheCover(WS, hash, fake)).toBe(false);
    expect(await coverUrl(WS, hash)).toBeUndefined();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:cover') }));
    // as write_file_bytes does, with a Blob the fake IndexedDB keeps
    await writeFile(coverPathOf(WS, hash), new NodeBlob([new Uint8Array([1, 2, 3])]) as unknown as Blob);
    expect(coverPathOf(WS, hash)).toBe(`${WS}/.mdsilo/local/covers/${hash}.jpg`);
    expect(await cacheCover(WS, hash, fake)).toBe(true);
    expect(await coverUrl(WS, hash)).toBe('blob:cover');
    vi.unstubAllGlobals();
  });
});
