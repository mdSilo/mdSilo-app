import { createZip } from '../../platform/web/zip';
import { makeEpub } from '../testBook';
import { formatContributors, formatLanguageMap, openBook, type TOCItem } from '../document';
import { chaptersOf, decodeText, guessLanguage, headingOf, paragraphsOf, titleOfTextFile } from './text';
import { convertToBook, joinRelative } from '.';

const bytes = (s: string) => new TextEncoder().encode(s);
const open = async ({ name, data }: { name: string; data: Uint8Array }) => openBook(new File([data as BlobPart], name));
const labels = (toc: TOCItem[] = []): unknown[] =>
  toc.map((t) => (t.subitems?.length ? [t.label, labels(t.subitems)] : t.label));
const zipOf = async (files: Record<string, string | Uint8Array>) => new Uint8Array(await createZip(
  Object.entries(files).map(([name, data]) => ({ name, data: typeof data === 'string' ? bytes(data) : data })),
).arrayBuffer());

describe('text', () => {
  test('UTF-8, else GB18030', () => {
    expect(decodeText(bytes('第一章'))).toBe('第一章');
    // 第一章 in GBK
    expect(decodeText(new Uint8Array([0xb5, 0xda, 0xd2, 0xbb, 0xd5, 0xc2]))).toBe('第一章');
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...bytes('BOM')]))).toBe('BOM');
  });

  test('the headings of chapters and volumes', () => {
    expect(headingOf('第一章 风雪山神庙')).toBe('chapter');
    expect(headingOf('第一百二十回')).toBe('chapter');
    expect(headingOf('第三卷：江湖')).toBe('volume');
    expect(headingOf('楔子')).toBe('chapter');
    expect(headingOf('Chapter 12. The Storm')).toBe('chapter');
    expect(headingOf('CHAPTER ONE')).toBe('chapter');
    expect(headingOf('Part Two')).toBe('volume');
    // text, not headings
    expect(headingOf('第一次见到他，是在春天。')).toBeUndefined();
    expect(headingOf('第三回合他就输了')).toBeUndefined();
    expect(headingOf('Chapters of a life were written')).toBeUndefined();
  });

  test('the chapters under their volumes, a contents at the start kept as text', () => {
    const text = [
      '作者：施耐庵', '', '第一章 开端', '第二章 结局',
      '第一卷 上', '第一章 开端', '　　他走了。', '　　她来了。', '第二章 结局', '完。',
    ].join('\n');
    const chapters = chaptersOf(text, '书');
    expect(chapters.map((c) => [c.title, c.level, c.paragraphs])).toEqual([
      ['书', 2, ['作者：施耐庵', '第一章 开端', '第二章 结局']],
      ['第一卷 上', 1, []],
      ['第一章 开端', 2, ['他走了。', '她来了。']],
      ['第二章 结局', 2, ['完。']],
    ]);
  });

  test('without headings: parts of about the same length', () => {
    const text = Array.from({ length: 300 }, (_, i) => `${i} ${'字'.repeat(200)}`).join('\n');
    const parts = chaptersOf(text, 'Book');
    expect(parts.length).toBeGreaterThan(2);
    expect(parts[0].title).toBe('Book');
    expect(parts.flatMap((p) => p.paragraphs)).toHaveLength(300);
  });

  test('lines broken at a width: joined in paragraphs', () => {
    const line = 'It was the best of times, it was the worst of times, it was';
    const text = Array.from({ length: 10 }, () => `${line}\n${line}\n${line}\n`).join('\n');
    const paragraphs = paragraphsOf(text);
    expect(paragraphs).toHaveLength(10);
    expect(paragraphs[0]).toBe(`${line} ${line} ${line}`);
  });

  test('the title and author in the name of the file; the language', () => {
    expect(titleOfTextFile('《三国演义》作者：罗贯中.txt')).toEqual({ title: '三国演义', author: '罗贯中' });
    expect(titleOfTextFile('《红楼梦》[曹雪芹].txt')).toEqual({ title: '红楼梦', author: '曹雪芹' });
    expect(titleOfTextFile('Moby Dick.txt')).toEqual({ title: 'Moby Dick', author: undefined });
    expect(guessLanguage('滚滚长江东逝水')).toBe('zh');
    expect(guessLanguage('Call me Ishmael.')).toBe('en');
    expect(guessLanguage('吾輩は猫である。名前はまだ無い。')).toBe('ja');
  });
});

describe('text files as books', () => {
  test('a TXT: an EPUB, its chapters in the contents, the same bytes again', async () => {
    const text = '作者：罗贯中\n第一回 宴桃园\n滚滚长江东逝水。\n第二回 张翼德\n浪花淘尽英雄。';
    const converted = await convertToBook('《三国演义》.txt', bytes(text));
    expect(converted.name).toBe('《三国演义》.epub');
    expect(await convertToBook('《三国演义》.txt', bytes(text))).toEqual(converted);
    const { book, format } = await open(converted);
    expect(format).toBe('EPUB');
    expect(formatLanguageMap(book.metadata.title)).toBe('三国演义');
    expect(formatContributors(book.metadata.author)).toBe('罗贯中');
    expect(book.metadata.language).toBe('zh');
    expect(labels(book.toc)).toEqual(['三国演义', '第一回 宴桃园', '第二回 张翼德']);
    const doc = await book.sections[2].createDocument();
    expect(doc.querySelector('h2')?.textContent).toBe('第二回 张翼德');
    expect(doc.querySelector('p')?.textContent).toBe('浪花淘尽英雄。');
  });

  test('Markdown: its front matter, split at its headings', async () => {
    const md = '---\ntitle: The Guide\nauthor: Ann\n---\n# One\nHello **there**.\n## Detail\nMore.\n# Two\nBye.';
    const { book } = await open(await convertToBook('notes.md', bytes(md)));
    expect(formatLanguageMap(book.metadata.title)).toBe('The Guide');
    expect(formatContributors(book.metadata.author)).toBe('Ann');
    expect(labels(book.toc)).toEqual([['One', ['Detail']], 'Two']);
    const doc = await book.sections[0].createDocument();
    expect(doc.querySelector('strong')?.textContent).toBe('there');
  });

  test('Markdown from a path: its local images in the book, as the notes find them', async () => {
    const files: Record<string, Uint8Array> = {
      '/ws/notes/img/a.png': bytes('A'),
      '/ws/writing/assets/b.png': bytes('B'),
      '/pics/c.jpg': bytes('C'),
    };
    const read = vi.fn(async (path: string) => files[path]);
    const md = '# Pics\n![a](img/a.png) ![a again](img/a.png?x=1)\n![b](./assets/b.png) ![c](/pics/c.jpg)\n'
      + '![web](https://example.com/w.png) ![gone](none.png)';
    const converted = await convertToBook('/ws/notes/pics.md', bytes(md), {
      path: '/ws/notes/pics.md', notesRoots: ['/ws/writing'], readFile: read,
    });
    const { book } = await open(converted);
    const doc = await book.sections[0].createDocument();
    expect(Array.from(doc.querySelectorAll('img')).map((img) => img.getAttribute('src'))).toEqual([
      '../images/1.png', '../images/1.png', '../images/2.png', '../images/3.jpg',
      'https://example.com/w.png', 'none.png',
    ]);
    // read once each, in the book
    expect(read.mock.calls.filter(([p]) => p === '/ws/notes/img/a.png')).toHaveLength(1);
    const names = new TextDecoder().decode(converted.data);
    for (const name of ['images/1.png', 'images/2.png', 'images/3.jpg']) expect(names).toContain(`OEBPS/${name}`);
    // not from a path: as it is
    const { book: plain } = await open(await convertToBook('pics.md', bytes(md)));
    expect((await plain.sections[0].createDocument()).querySelector('img')?.getAttribute('src')).toBe('img/a.png');
  });

  test('paths joined', () => {
    expect(joinRelative('/ws/notes', '../a/./b.png')).toBe('/ws/a/b.png');
    expect(joinRelative('C:\\ws\\notes', 'img\\a.png')).toBe('C:/ws/notes/img/a.png');
    expect(joinRelative('/', '../../a.png')).toBe('/a.png');
  });

  test('HTML: cleaned, the links between its chapters followed', async () => {
    const html = `<html lang="fr"><head><title>Page</title><script>alert(1)</script></head><body>
      <h2 id="a">A</h2><p onclick="x()">See <a href="#b">B</a>.</p><h2 id="b">B</h2><p>Fin<br>!</p></body></html>`;
    const { book } = await open(await convertToBook('page.html', bytes(html)));
    expect(formatLanguageMap(book.metadata.title)).toBe('Page');
    expect(book.metadata.language).toBe('fr');
    expect(labels(book.toc)).toEqual(['A', 'B']);
    const doc = await book.sections[0].createDocument();
    expect(doc.querySelector('script')).toBeNull();
    expect(doc.querySelector('p')?.hasAttribute('onclick')).toBe(false);
    expect(doc.querySelector('a')?.getAttribute('href')).toBe('2.xhtml#b');
  });

  test('a ZIP of pages and images: an EPUB, a chapter a page in order', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const data = await zipOf({
      'site/10-end.md': '# End\nDone.',
      'site/2-start.html': '<title>Start</title><p><img src="img/a.png"><a href="10-end.md">next</a></p>',
      'site/img/a.png': png,
      '__MACOSX/site/._2-start.html': 'x',
    });
    const { book } = await open(await convertToBook('Site.zip', data));
    expect(formatLanguageMap(book.metadata.title)).toBe('Site');
    expect(labels(book.toc)).toEqual(['Start', 'End']);
    const doc = await book.sections[0].createDocument();
    expect(doc.querySelector('a')?.getAttribute('href')).toBe('10-end.xhtml');
    expect(doc.querySelector('img')?.getAttribute('src')).toBe('img/a.png');
  });

  test('a ZIP of a book: kept as it is', async () => {
    const epub = new Uint8Array(await makeEpub().arrayBuffer());
    expect(await convertToBook('Tiny.zip', epub)).toEqual({ name: 'Tiny.epub', data: epub });
    const comic = await zipOf({ '01.jpg': 'a', '02.png': 'b' });
    expect((await convertToBook('Comic.zip', comic)).name).toBe('Comic.cbz');
    await expect(convertToBook('Empty.zip', await zipOf({ 'a.bin': 'x' }))).rejects.toThrow('No book in the zip');
  });
});
