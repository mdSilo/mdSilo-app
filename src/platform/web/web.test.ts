import 'fake-indexeddb/auto';
import { vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { closeDB } from './idb';
import { resetFsInit } from './fs';
import { invoke, convertFileSrc } from './core';
import { getCurrentWindow } from './window';
import { normalize, join, parent, basename, isWithin } from './path';
import { parseFeed, proxiedUrl, getCorsProxy } from './feed';

beforeEach(async () => {
  await closeDB();
  resetFsInit();
  globalThis.indexedDB = new IDBFactory();
});

const flush = () => new Promise((r) => setTimeout(r, 10));

describe('path', () => {
  it('normalizes and joins', () => {
    expect(normalize('a\\b//c/')).toBe('/a/b/c');
    expect(normalize('/a/./b/../c')).toBe('/a/c');
    expect(normalize('')).toBe('/');
    expect(join('/a/', '/b/', 'c.md')).toBe('/a/b/c.md');
    expect(parent('/a/b')).toBe('/a');
    expect(parent('/a')).toBe('/');
    expect(parent('/')).toBe('/');
    expect(basename('/a/b.md')).toBe('b.md');
    expect(isWithin('/a/b', '/a')).toBe(true);
    expect(isWithin('/ab', '/a')).toBe(false);
  });
});

describe('web invoke: files', () => {
  it('seeds the default workspace', async () => {
    expect(await invoke('is_dir', { path: '/mdSilo' })).toBe(true);
    expect(await invoke('read_file', { filePath: '/mdSilo/Welcome.md' })).toContain('web version');
    expect(await invoke('create_mdsilo_dir')).toBe('/mdSilo');
  });

  it('writes, reads and lists files', async () => {
    expect(await invoke('write_file', { filePath: '/w/sub/a.md', text: '# A' })).toBe(true);
    expect(await invoke('is_dir', { path: '/w/sub' })).toBe(true);
    expect(await invoke('is_file', { path: '/w/sub/a.md' })).toBe(true);
    expect(await invoke('file_exist', { filePath: '/w/none.md' })).toBe(false);
    expect(await invoke('read_file', { filePath: '/w/sub/a.md' })).toBe('# A');
    expect(await invoke('read_file', { filePath: '/w/none.md' })).toBe('');

    await invoke('create_file', { filePath: '/w/.hidden.md' });
    const list = await invoke<{ file_name: string; is_dir: boolean }[]>('list_directory', { dir: '/w' });
    expect(list.map((f) => [f.file_name, f.is_dir])).toEqual([['sub', true]]);
    const all = await invoke<{ files: { file_name: string; is_hidden: boolean }[] }>('read_directory', { dir: '/w' });
    expect(all.files.find((f) => f.file_name === '.hidden.md')?.is_hidden).toBe(true);

    const meta = await invoke<Record<string, unknown>>('get_file_meta', { filePath: '/w/sub/a.md' });
    expect(meta).toMatchObject({ file_path: '/w/sub/a.md', file_name: 'a.md', file_text: '# A', is_file: true, is_dir: false });
    expect((meta.last_modified as { secs_since_epoch: number }).secs_since_epoch).toBeGreaterThan(0);
    await expect(invoke('get_file_meta', { filePath: '/w/none.md' })).rejects.toThrow();
  });

  it('handles path commands like the rust end', async () => {
    await invoke('write_file', { filePath: '/w/a.md', text: '' });
    expect(await invoke('join_paths', { root: '/w/', parts: ['/x/', 'y.md'] })).toBe('/w/x/y.md');
    expect(await invoke('get_parent_dir', { path: '/w/a.md' })).toBe('/w');
    expect(await invoke('get_dirpath', { path: '/w/a.md' })).toBe('/w');
    expect(await invoke('get_dirpath', { path: '/w/' })).toBe('/w');
    expect(await invoke('get_dirpath', { path: '/none' })).toBe('');
    expect(await invoke('get_basename', { filePath: '/w/a.md' })).toEqual(['a.md', true]);
    expect(await invoke('get_basename', { filePath: '/w' })).toEqual(['w', false]);
  });

  it('renames, copies and deletes', async () => {
    await invoke('write_file', { filePath: '/w/d/a.md', text: 'a' });
    await invoke('write_file', { filePath: '/w/d/e/b.md', text: 'b' });
    expect(await invoke('rename_file', { fromPath: '/w/d', toPath: '/w/n' })).toBe(true);
    expect(await invoke('file_exist', { filePath: '/w/d/a.md' })).toBe(false);
    expect(await invoke('read_file', { filePath: '/w/n/e/b.md' })).toBe('b');
    expect(await invoke('rename_file', { fromPath: '/w/n', toPath: '/w/n/x' })).toBe(false);

    expect(await invoke('copy_file', { srcPath: '/w/n/a.md', toPath: '/w/c/a.md' })).toBe(true);
    expect(await invoke('read_file', { filePath: '/w/c/a.md' })).toBe('a');
    expect(await invoke('copy_file_to_assets', { srcPath: '/w/c/a.md', workDir: '/w' }))
      .toEqual(['/w/assets/a.md', './assets/a.md']);

    expect(await invoke('delete_files', { paths: ['/w/n'] })).toBe(true);
    expect(await invoke('file_exist', { filePath: '/w/n/e/b.md' })).toBe(false);
    expect(await invoke('file_exist', { filePath: '/w/c/a.md' })).toBe(true);
  });

  it('emits changes on watched dir', async () => {
    const events: unknown[] = [];
    const unlisten = await getCurrentWindow().listen('changes', (e) => events.push(e.payload));
    await invoke('listen_dir', { dir: '/w' });
    await invoke('write_file', { filePath: '/w/a.md', text: '1' });
    await invoke('write_file', { filePath: '/w/a.md', text: '2' });
    await invoke('write_file', { filePath: '/other/b.md', text: '' });
    await flush();
    expect(events).toEqual([
      { paths: ['/w'], event: 'create' },
      { paths: ['/w/a.md'], event: 'create' },
      { paths: ['/w/a.md'], event: 'write' },
    ]);
    await getCurrentWindow().emit('unlisten_dir');
    await invoke('write_file', { filePath: '/w/c.md', text: '' });
    await flush();
    expect(events).toHaveLength(3);
    unlisten();
  });

  it('writes mdsilo.json and emits loaded', async () => {
    await invoke('write_file', { filePath: '/w/a.md', text: '# A' });
    await invoke('write_file', { filePath: '/w/sub/b.md', text: '# B' });
    await invoke('write_file', { filePath: '/w/.git/c.md', text: '' });
    const events: unknown[] = [];
    const unlisten = await getCurrentWindow().listen('changes', (e) => events.push(e.payload));
    expect(await invoke('write_json', { dir: '/w' })).toBe(true);
    await flush();
    expect(events).toContainEqual({ paths: ['/w'], event: 'loaded' });
    const json = JSON.parse(await invoke<string>('read_file', { filePath: '/w/mdsilo.json' }));
    expect(Object.keys(json.notesobj).sort()).toEqual(['/w/a.md', '/w/sub', '/w/sub/b.md']);
    expect(json.notesobj['/w/a.md']).toMatchObject({ title: 'a', content: '# A', is_dir: false });
    expect(json.notetree['/w'].map((i: { id: string }) => i.id)).toEqual(['/w/a.md', '/w/sub']);
    expect(json.notetree['/w/sub'].map((i: { id: string }) => i.id)).toEqual(['/w/sub/b.md']);
    unlisten();
  });

  it('converts file path to url', () => {
    expect(convertFileSrc('/w/a b.png')).toBe('/__mdsilo_fs__/w/a%20b.png');
  });

  it('rejects unknown command', async () => {
    await expect(invoke('no_such_cmd')).rejects.toThrow('not supported');
  });
});

describe('web invoke: storage', () => {
  it('sets, gets and deletes data', async () => {
    expect(await invoke('get_data', { key: 'k' })).toEqual({ status: false, data: null });
    await invoke('set_data', { key: 'k', value: { a: 1 } });
    expect(await invoke('get_data', { key: 'k' })).toEqual({ status: true, data: { a: 1 } });
    await invoke('delete_data', { key: 'k' });
    expect(await invoke('get_data', { key: 'k' })).toEqual({ status: false, data: null });
  });

  it('keeps logs newest first', async () => {
    await invoke('set_log', { logData: [{ ty: 'Error', info: '1', timestamp: 't1' }] });
    await invoke('set_log', { logData: [{ ty: 'Error', info: '2', timestamp: 't2' }] });
    expect((await invoke<{ info: string }[]>('get_log')).map((l) => l.info)).toEqual(['2', '1']);
    await invoke('del_log');
    expect(await invoke('get_log')).toEqual([]);
  });
});

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>Blog</title><description>d</description>
<item><title>P1</title><link>https://b.com/1</link><description>s1</description>
<enclosure url="https://b.com/1.mp3" type="audio/mpeg" length="1"/></item>
<item><title>P2</title><link>https://b.com/2</link><description>s2</description></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title>
<updated>2024-01-01T00:00:00Z</updated><entry><title>E1</title><link href="https://a.com/1"/>
<updated>2024-01-01T00:00:00Z</updated><summary>sum</summary></entry></feed>`;

describe('web invoke: feed', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('parses rss and atom', () => {
    const rss = parseFeed(RSS, 'https://b.com/feed', 'podcast');
    expect(rss?.channel).toMatchObject({ title: 'Blog', link: 'https://b.com/feed', ty: 'podcast' });
    expect(rss?.articles[0]).toMatchObject({ title: 'P1', url: 'https://b.com/1', audio_url: 'https://b.com/1.mp3', content: 's1' });
    const atom = parseFeed(ATOM, 'https://a.com/feed', 'rss', 'Mine');
    expect(atom?.channel.title).toBe('Mine');
    expect(atom?.articles[0]).toMatchObject({ title: 'E1', url: 'https://a.com/1', content: 'sum' });
    expect(parseFeed('<html></html>', 'u', 'rss')).toBeNull();
  });

  it('adds channel and manages articles', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(RSS)));
    expect(await invoke('add_channel', { url: 'https://b.com/feed', ty: 'rss', title: null })).toBe(2);
    expect(await invoke('add_channel', { url: 'https://b.com/feed', ty: 'rss', title: null })).toBe(0);
    expect(await invoke<{ title: string }[]>('get_channels')).toMatchObject([{ title: 'Blog' }]);
    expect(await invoke('get_unread_num')).toEqual({ 'https://b.com/feed': 2 });

    await invoke('update_article_read_status', { url: 'https://b.com/1', status: 1 });
    await invoke('update_article_star_status', { url: 'https://b.com/2', status: 1 });
    expect(await invoke('get_unread_num')).toEqual({ 'https://b.com/feed': 1 });
    const starred = await invoke<{ url: string }[]>('get_articles', { feedLink: null, readStatus: null, starStatus: 1 });
    expect(starred.map((a) => a.url)).toEqual(['https://b.com/2']);
    expect(await invoke('get_article_by_url', { url: 'https://b.com/1' })).toMatchObject({ read_status: 1 });

    expect(await invoke('update_all_read_status', { feedLink: 'https://b.com/feed', readStatus: 1 })).toBe(2);
    expect(await invoke('get_unread_num')).toEqual({});

    expect(await invoke('delete_channel', { link: 'https://b.com/feed' })).toBe(1);
    expect(await invoke('get_channels')).toEqual([]);
    expect(await invoke('get_articles', { feedLink: null, readStatus: null, starStatus: null })).toEqual([]);
  });

  it('returns 0 when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('CORS'); }));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await invoke('add_channel', { url: 'https://x.com/feed', ty: 'rss', title: null })).toBe(0);
    expect(await invoke('fetch_feed', { url: 'https://x.com/feed' })).toBeNull();
  });

  it('falls back to the CORS proxy', async () => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input.startsWith('https://b.com')) throw new TypeError('CORS');
      return new Response(RSS);
    });
    vi.stubGlobal('fetch', fetchMock);
    // default: the proxy of dev/preview server
    expect(await getCorsProxy()).toBe('/__cors_proxy__?url={url}');
    expect(await invoke('fetch_feed', { url: 'https://b.com/feed' })).toMatchObject({ channel: { title: 'Blog' } });
    expect(fetchMock).toHaveBeenLastCalledWith('/__cors_proxy__?url=https%3A%2F%2Fb.com%2Ffeed');

    // custom proxy in settings
    await invoke('set_data', { key: 'cors_proxy', value: 'https://p.com/' });
    expect(await invoke('add_channel', { url: 'https://b.com/feed', ty: 'rss', title: null })).toBe(2);
    expect(fetchMock).toHaveBeenLastCalledWith('https://p.com/https://b.com/feed');

    // disabled
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await invoke('set_data', { key: 'cors_proxy', value: 'none' });
    fetchMock.mockClear();
    expect(await invoke('fetch_feed', { url: 'https://b.com/feed' })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('builds proxied url', () => {
    expect(proxiedUrl('https://p.com/?url={url}', 'https://a.com/f?x=1'))
      .toBe('https://p.com/?url=https%3A%2F%2Fa.com%2Ff%3Fx%3D1');
    expect(proxiedUrl('https://p.com/', 'https://a.com/f')).toBe('https://p.com/https://a.com/f');
  });
});
