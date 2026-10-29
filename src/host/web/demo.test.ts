import { vi } from 'vitest';
import { joinIssueData } from '@/issue/issueFiles';
import { parseAnnotations } from '@/reader/annotations';
import { demoLangOf, loadDemo, type DemoFile, type DemoLang } from './demo';

const text = (files: DemoFile[], path: string) => {
  const file = files.find((f) => f.path === path);
  return typeof file?.data === 'string' ? file.data : '';
};

afterEach(() => vi.unstubAllGlobals());

describe('demo language', () => {
  it('is Chinese for a Chinese browser', () => {
    expect(demoLangOf('zh-CN')).toBe('zh');
    expect(demoLangOf('zh-TW')).toBe('zh');
    expect(demoLangOf('en-US')).toBe('en');
    expect(demoLangOf('fr')).toBe('en');
  });
});

describe.each<[DemoLang, string]>([['en', 'Manual'], ['zh', '手册']])('demo workspace, %s', (lang, dir) => {
  it('has the manual, offline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const files = await loadDemo(lang);
    const notes = files.filter((f) => f.path.startsWith(`writing/${dir}/`));
    expect(notes).toHaveLength(10);
    // no book without the file
    expect(files.some((f) => f.path.startsWith('reading/'))).toBe(false);
  });

  it('links the chapters of the manual to each other', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const files = await loadDemo(lang);
    const titles = new Set(
      files.filter((f) => f.path.startsWith(`writing/${dir}/`)).map((f) => f.path.slice(`writing/${dir}/`.length, -3))
    );
    for (const file of files.filter((f) => f.path.endsWith('.md'))) {
      // links in code are examples
      const body = text(files, file.path).replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
      for (const [, target] of body.matchAll(/\[\[([^\]|\\]+)(?:\\?\|[^\]]*)?\]\]/g)) {
        expect(titles.has(target.trim()), `${file.path}: [[${target}]]`).toBe(true);
      }
    }
  });

  it('has issues the app can read', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const files = await loadDemo(lang);
    const meta = JSON.parse(text(files, '.mdsilo/issues/meta.json'));
    const issues = [1, 2, 3].map((n) => JSON.parse(text(files, `.mdsilo/issues/${n}.json`)));
    const data = joinIssueData(meta, issues);
    expect(data.issues.map((i) => i.number)).toEqual([1, 2, 3]);
    expect(data.nextNumber).toBe(4);
    const labels = new Set(data.labels.map((l) => l.id));
    expect(data.issues.every((i) => i.labels.every((l) => labels.has(l)))).toBe(true);
    const statuses = new Set(data.projects[0].statuses.map((s) => s.id));
    expect(data.projects[0].items.every((i) => statuses.has(i.status))).toBe(true);
  });

  it('adds the book to the library with its annotations', async () => {
    const book = new Blob([new Uint8Array(3000).fill(7)]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => book }));
    const files = await loadDemo(lang);
    expect(files.find((f) => f.path === 'reading/Alice in Wonderland.epub')?.data).toBe(book);
    const library = JSON.parse(text(files, '.mdsilo/books.json'));
    const [hash] = Object.keys(library.books);
    expect(library.books[hash]).toMatchObject({ hash, file: 'reading/Alice in Wonderland.epub', format: 'EPUB' });
    const doc = parseAnnotations(text(files, 'reading/Alice in Wonderland.epub.md'));
    expect(doc.header?.hash).toBe(hash);
    expect(doc.notes).toHaveLength(1);
  });
});
