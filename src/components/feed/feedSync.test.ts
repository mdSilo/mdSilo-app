import { invoke } from '@tauri-apps/api/core';
import { store } from '@/lib/store';
import { useWebFs } from '../../testUtils';
import { ARTICLES, CHANNELS, put } from '../../platform/web/idb';
import { mergeByKey, parseFeedsFile, resetFeedSync, syncFeeds } from './feedSync';

const key = (x: { k: string }) => x.k;
const items = (...ks: string[]) => ks.map((k) => ({ k }));

describe('mergeByKey', () => {
  test('without their side: mine as is', () => {
    expect(mergeByKey(undefined, undefined, items('a'), key)).toEqual({ items: items('a'), add: [], remove: [] });
  });

  test('never synced: the union', () => {
    const merged = mergeByKey(undefined, items('b', 'c'), items('a', 'b'), key);
    expect(merged.items).toEqual(items('a', 'b', 'c'));
    expect(merged.add).toEqual(items('c'));
    expect(merged.remove).toEqual([]);
  });

  test('removals carry over both ways', () => {
    // base a b c; they removed b and added d; I removed c and added e
    const merged = mergeByKey(items('a', 'b', 'c'), items('a', 'c', 'd'), items('a', 'b', 'e'), key);
    expect(merged.items).toEqual(items('a', 'd', 'e'));
    expect(merged.add).toEqual(items('d'));
    expect(merged.remove).toEqual(items('b'));
  });
});

describe('parseFeedsFile', () => {
  test('tolerates partial and broken files', () => {
    expect(parseFeedsFile('')).toBeUndefined();
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(parseFeedsFile('{x')).toBeUndefined();
    expect(err).toHaveBeenCalled();
    expect(parseFeedsFile('{"channels":[{"link":"l"},{}]}')).toEqual({
      version: 1, channels: [{ link: 'l' }], starred: [],
    });
  });
});

describe('syncFeeds', () => {
  const WS = '/mdSilo';
  const FILE = `${WS}/.mdsilo/feeds.json`;
  const BASE = `${WS}/.mdsilo/local/feeds.base.json`;
  const readJson = async (path: string) => JSON.parse(await invoke<string>('read_file', { filePath: path }));
  const article = (url: string, star: number) => ({
    id: url.length, title: url, url, feed_link: 'https://a.test/feed', audio_url: '', description: '',
    published: '', content: 'body', author: '', image: '', read_status: 0, star_status: star,
  });

  beforeEach(async () => {
    await useWebFs();
    // no network in tests: adding a channel fails
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    store.setState({ initDir: WS, layout: 'workspace' });
  });

  afterEach(() => {
    resetFeedSync();
    vi.unstubAllGlobals();
  });

  test('writes the feeds to the workspace and merges them back', async () => {
    await put(CHANNELS, { id: 1, title: 'A', link: 'https://a.test/feed', description: '', published: '', ty: 'rss' });
    await put(ARTICLES, article('https://a.test/1', 1));
    await put(ARTICLES, article('https://a.test/2', 0));

    await syncFeeds();
    const file = await readJson(FILE);
    expect(file.channels).toEqual([{ link: 'https://a.test/feed', title: 'A', ty: 'rss' }]);
    expect(file.starred.map((a: { url: string }) => a.url)).toEqual(['https://a.test/1']);
    // no content in the file
    expect(file.starred[0]).not.toHaveProperty('content');
    expect(await readJson(BASE)).toEqual(file);

    // elsewhere: channel A removed, an article starred, channel B added
    const starred = { ...file.starred[0], url: 'https://b.test/x', title: 'x' };
    await invoke('write_file', {
      filePath: FILE,
      text: JSON.stringify({
        version: 1,
        channels: [{ link: 'https://b.test/feed', title: 'B', ty: 'podcast' }],
        starred: [...file.starred, starred],
      }),
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await syncFeeds();
    error.mockRestore();

    const channels = await invoke<{ link: string }[]>('get_channels');
    expect(channels.map((c) => c.link)).toEqual([]);
    const stars = await invoke<{ url: string }[]>('get_articles', { feedLink: null, readStatus: null, starStatus: 1 });
    expect(stars.map((a) => a.url).sort()).toEqual(['https://b.test/x']);

    // B failed to load (offline): kept in the file, tried again next time
    expect((await readJson(FILE)).channels.map((c: { link: string }) => c.link)).toEqual(['https://b.test/feed']);
    expect((await readJson(BASE)).channels).toEqual([]);
  });

  test('does nothing in a legacy workspace', async () => {
    store.setState({ initDir: WS, layout: 'legacy' });
    await syncFeeds();
    expect(await invoke('file_exist', { filePath: FILE })).toBe(false);
  });
});
