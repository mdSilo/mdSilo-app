import { Blob as NodeBlob } from 'node:buffer';
import { invoke } from '@tauri-apps/api/core';
import { store } from '@/lib/store';
import { serializeAnnotations, type BookNote } from '@/reader/annotations';
import { readFeedBook } from '@/reader/feedBook';
import { bookIdOf, readLibrary, refreshLibrary } from '@/reader/library';
import type { ArticleType } from '@/types/model';
import { makeNote, useWebFs } from '../../testUtils';
import { inBookOrder, saveFeedBook } from './feedToBook';
import { SHORT_TEXT } from './fullText';

const WS = '/mdSilo';
const BOOK = `${WS}/reading/Example.epub`;
const read = (filePath: string) => invoke<string>('read_file', { filePath });
const longText = (n: number) => Array.from({ length: Math.ceil(SHORT_TEXT / 10) }, (_, i) => `<p>Paragraph ${i} of post ${n}.</p>`).join('');

const post = (n: number, extra: Partial<ArticleType> = {}): ArticleType => ({
  id: n,
  title: `Post ${n}`,
  url: `https://example.com/${n}`,
  feed_link: 'https://example.com/feed',
  audio_url: '',
  description: '',
  content: longText(n),
  published: new Date(`2026-01-0${n}T00:00:00Z`),
  read_status: 0,
  star_status: 1,
  ...extra,
});
const excerpt = (n: number) => post(n, { content: '', description: `<p>The start of post ${n}…</p>` });

const annotation = (cfi: string): BookNote => ({
  id: `n-${cfi}`, type: 'annotation', cfi, text: 'quoted', color: 'yellow', style: 'highlight',
  note: 'mine', chapter: 'Post', createdAt: 'c', updatedAt: 'u',
});

const bookData = async () => {
  const bytes = await invoke<Uint8Array | ArrayBuffer>('read_file_bytes', { filePath: BOOK });
  return (await readFeedBook(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)))!.data;
};

let pages: Record<string, string> = {};

beforeEach(async () => {
  await useWebFs();
  store.setState({ initDir: WS, layout: 'workspace' });
  pages = {};
  // the files written by the app: jsdom's Blob loses its methods in fake-indexeddb
  vi.stubGlobal('Blob', NodeBlob);
  // the pages of the articles: those given, the others failing
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (pages[url]
    ? new Response(pages[url])
    : Promise.reject(new TypeError('Failed to fetch')))));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('feed articles made a book', () => {
  test('the oldest first', () => {
    expect(inBookOrder([post(3), post(1), post(2, { published: undefined })]).map((a) => a.id)).toEqual([1, 3, 2]);
  });

  test('made, then the new articles added: the same book, its annotations and reading state kept', async () => {
    const made = await saveFeedBook('Example', [post(2), post(1)], { source: 'Example' });
    expect(made).toMatchObject({ path: BOOK, created: true, added: 2, total: 2, partial: 0 });
    const lib = await readLibrary(WS);
    expect(lib.books[made.hash]).toMatchObject({ file: 'reading/Example.epub', title: 'Example', feed: 'Example' });
    expect(lib.books[made.hash].fileHash).toBeUndefined();

    // annotated, read
    const [, second] = (await bookData()).articles;
    const cfi = `epubcfi(/6/4[${second.id}]!/4/6/2,/1:0,/1:5)`;
    const md = serializeAnnotations({ header: { hash: made.hash, title: 'Example' }, notes: [annotation(cfi)] });
    await invoke('write_file', { filePath: `${BOOK}.md`, text: md });
    await invoke('write_file', { filePath: `${WS}/.mdsilo/books/${made.hash}.json`, text: JSON.stringify({ location: cfi }) });

    const again = await saveFeedBook('Example', [post(3), post(1), post(2)]);
    expect(again).toMatchObject({ path: BOOK, hash: made.hash, created: false, added: 1, total: 3 });
    expect((await bookData()).articles.map((a) => a.title)).toEqual(['Post 1', 'Post 2', 'Post 3']);
    // the file another, the book the same
    const fileHash = await invoke<string>('book_hash', { filePath: BOOK });
    expect(fileHash).not.toBe(made.hash);
    const after = await refreshLibrary(WS);
    expect(Object.keys(after.books)).toEqual([made.hash]);
    expect(after.books[made.hash].fileHash).toBe(fileHash);
    expect(bookIdOf(after, fileHash)).toBe(made.hash);
    expect(await read(`${BOOK}.md`)).toBe(md);
    expect(JSON.parse(await read(`${WS}/.mdsilo/books/${made.hash}.json`)).location).toBe(cfi);

    // nothing new: not written
    expect(await saveFeedBook('Example', [post(1)])).toMatchObject({ added: 0, refreshed: 0, total: 3 });
    expect(await invoke('book_hash', { filePath: BOOK })).toBe(fileHash);
  });

  test('the full text of an excerpt from its page; made full later if nothing of the user is in it', async () => {
    const made = await saveFeedBook('Example', [excerpt(1), excerpt(2), excerpt(3)]);
    expect(made).toMatchObject({ added: 3, partial: 3, fromPage: 0 });
    const data = await bookData();
    expect(data.articles.every((a) => a.partial)).toBe(true);
    // post 2 annotated; a `book:` link to post 3 in a note
    const md = serializeAnnotations({ notes: [annotation(`epubcfi(/6/4[${data.articles[1].id}]!/4/2/1:0)`)] });
    await invoke('write_file', { filePath: `${BOOK}.md`, text: md });
    const link = `[quote](book:${made.hash}#${encodeURIComponent(`epubcfi(/6/6[${data.articles[2].id}]!/4/2/1:0)`)})`;
    await invoke('write_file', { filePath: `${WS}/writing/a.md`, text: link });
    store.getState().upsertNote(makeNote({ id: `${WS}/writing/a.md`, title: 'a', content: link }));

    for (const n of [1, 2, 3, 4]) {
      pages[`https://example.com/${n}`] = `<html><body><article><h1>Post ${n}</h1>${longText(n)}</article></body></html>`;
    }
    const again = await saveFeedBook('Example', [excerpt(1), excerpt(2), excerpt(3), excerpt(4)]);
    expect(again).toMatchObject({ added: 1, fromPage: 1, partial: 0 });
    // post 1 made full; post 2 annotated, as it was; post 3 linked, as it was
    expect((await bookData()).articles.map((a) => Boolean(a.partial))).toEqual([false, true, true, false]);
    expect(again.refreshed).toBe(1);
    expect(await read(`${BOOK}.md`)).toBe(md);
  });

  test('in the library but not on this device: not made anew', async () => {
    const made = await saveFeedBook('Example', [post(1)]);
    await invoke('delete_files', { paths: [BOOK] });
    await expect(saveFeedBook('Example', [post(2)])).rejects.toThrow('not on this device');
    expect(Object.keys((await readLibrary(WS)).books)).toEqual([made.hash]);
  });

  test('no workspace', async () => {
    store.setState({ initDir: undefined });
    await expect(saveFeedBook('Example', [post(1)])).rejects.toThrow('Open a folder');
  });
});
