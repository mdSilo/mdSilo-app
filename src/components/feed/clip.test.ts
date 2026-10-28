import { beforeEach, describe, expect, test, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { store } from '@/lib/store';
import type { ArticleType } from '@/types/model';
import { writeFile } from '@/file/write';
import { openFilePaths } from '@/file/open';
import { mockInvoke } from '../../testUtils';
import { clipArticle, clipFileName, clipHeader, htmlToMarkdown, quote } from './clip';

vi.mock('@/file/write', () => ({ writeFile: vi.fn(async () => undefined) }));
vi.mock('@/file/open', () => ({ openFilePaths: vi.fn(async () => undefined) }));
// files on "disk"
const files: Record<string, string> = {};
vi.mock('@/file/files', () => ({
  default: class {
    constructor(private path: string) {}
    async exists() { return this.path in files; }
    async readFile() { return files[this.path]; }
  },
}));

const article = (over: Partial<ArticleType> = {}): ArticleType => ({
  id: 1,
  title: 'A: Post / about <things>?',
  url: 'https://blog.example/post',
  feed_link: 'https://blog.example/feed',
  audio_url: '',
  description: '',
  read_status: 0,
  star_status: 0,
  content: '<h2>Intro</h2><p>Some <b>bold</b> and a <a href="https://x.y">link</a>.</p><script>alert(1)</script>',
  author: 'Ann',
  ...over,
});

describe('htmlToMarkdown', () => {
  test('converts as the editor writes markdown, sanitized', () => {
    const md = htmlToMarkdown(
      '<h2>Intro</h2><p>Some <b>bold</b>, <em>em</em> and a <a href="https://x.y">link</a>.</p>' +
      '<ul><li>one</li><li>two</li></ul><pre><code>let a = 1;</code></pre>' +
      '<img src="https://x.y/a.png" alt="pic"><script>alert(1)</script>'
    );
    expect(md).toContain('## Intro');
    expect(md).toContain('**bold**');
    expect(md).toContain('[link](https://x.y)');
    expect(md).toMatch(/[-*] one/);
    expect(md).toContain('let a = 1;');
    expect(md).toContain('https://x.y/a.png');
    expect(md).not.toContain('alert');
  });
});

describe('clip helpers', () => {
  test('clipFileName has no path separators or reserved characters', () => {
    expect(clipFileName('A: Post / about <things>?')).toBe('A Post about things');
    expect(clipFileName('  ')).toBe('untitled');
    expect(clipFileName('x'.repeat(300))).toHaveLength(100);
  });

  test('clipHeader names the title and where it is from', () => {
    const header = clipHeader(article());
    expect(header).toMatch(/^# A: Post \/ about <things>\?\n/);
    expect(header).toContain('> From [https://blog.example/post](https://blog.example/post) · Ann');
  });

  test('quote quotes every line', () => {
    expect(quote('a\n\nb')).toBe('> a\n>\n> b');
  });
});

describe('clipArticle', () => {
  const notePath = '/w/clips/A Post about things.md';

  beforeEach(() => {
    for (const k of Object.keys(files)) delete files[k];
    mockInvoke(vi.mocked(invoke), {
      join_paths: ({ root, parts }: Record<string, unknown>) => [root, ...(parts as string[])].join('/'),
    });
    store.getState().setInitDir('/w');
  });

  test('needs a workspace', async () => {
    store.getState().setInitDir('');
    expect(await clipArticle(article())).toBeUndefined();
    expect(writeFile).not.toHaveBeenCalled();
  });

  test('saves the whole article once in clips/', async () => {
    expect(await clipArticle(article())).toBe(notePath);
    const content = vi.mocked(writeFile).mock.calls[0][1];
    expect(vi.mocked(writeFile).mock.calls[0][0]).toBe(notePath);
    expect(content).toMatch(/^# A: Post/);
    expect(content).toContain('## Intro');
    expect(content).not.toContain('alert');
    expect(openFilePaths).toHaveBeenCalledWith(['/w/clips', notePath]);

    // an existing clip is kept as is, maybe edited since
    files[notePath] = '# edited';
    vi.mocked(writeFile).mockClear();
    expect(await clipArticle(article())).toBe(notePath);
    expect(writeFile).not.toHaveBeenCalled();
  });

  test('adds a selection to the clip as a quote', async () => {
    await clipArticle(article(), '<p>first <b>pick</b></p>');
    const first = vi.mocked(writeFile).mock.calls[0][1];
    expect(first).toMatch(/^# A: Post[\s\S]*> From [\s\S]*\n\n> first \*\*pick\*\*\n$/);

    files[notePath] = first;
    await clipArticle(article(), '<p>second</p>');
    const second = vi.mocked(writeFile).mock.calls[1][1];
    expect(second).toBe(`${first.trimEnd()}\n\n> second\n`);
  });
});
