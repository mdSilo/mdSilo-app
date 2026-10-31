import * as CFI from 'foliate-js/epubcfi.js';
import { openBook, type BookDoc } from '../document';
import {
  articleIdOf, articleOfCfi, imageExtOf, makeFeedBook, readFeedBook, spineIdOf, type FeedArticleInput,
} from './feedBook';
import { readZip } from '.';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

const article = (n: number, extra: Partial<FeedArticleInput> = {}): FeedArticleInput => ({
  url: `https://example.com/post/${n}`,
  title: `Post ${n}`,
  author: 'Ann',
  published: `2026-0${n}-01T10:00:00Z`,
  source: 'Example',
  html: `<p>The first paragraph of post ${n}.</p><p>The <em>second</em> paragraph of post ${n}, to highlight.</p>`,
  base: `https://example.com/post/${n}`,
  ...extra,
});

const open = async (epub: Uint8Array) => (await openBook(new File([epub as BlobPart], 'feed.epub'))).book;

/** The CFI of some text in a section, as the reader makes them. */
async function cfiOf(book: BookDoc, index: number, text: string): Promise<string> {
  const doc = await book.sections[index].createDocument();
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const at = node.nodeValue!.indexOf(text);
    if (at < 0) continue;
    const range = doc.createRange();
    range.setStart(node, at);
    range.setEnd(node, at + text.length);
    return CFI.joinIndir(book.sections[index].cfi!, CFI.fromRange(range));
  }
  throw new Error(`no ${text}`);
}

/** The text a CFI points at in a book. */
async function textAt(book: BookDoc, cfi: string): Promise<string> {
  const { index, anchor } = (book as unknown as { resolveCFI: (c: string) => { index: number; anchor: (d: Document) => Range } }).resolveCFI(cfi);
  const doc = await book.sections[index].createDocument();
  return anchor(doc).toString();
}

const filesOf = async (epub: Uint8Array) => new Map((await readZip(epub)).map((f) => [f.name, f.data]));

describe('feed book', () => {
  test('a chapter an article, its spine item by an id of its URL', async () => {
    const { epub, data, added } = await makeFeedBook({ title: 'Example', articles: [article(1), article(2)] });
    expect(added).toEqual([articleIdOf(article(1).url), articleIdOf(article(2).url)]);
    const book = await open(epub);
    expect(book.sections).toHaveLength(2);
    expect(book.toc?.map((t) => t.label)).toEqual(['Post 1', 'Post 2']);
    // the CFIs foliate makes carry the id
    expect(book.sections[1].cfi).toBe(`epubcfi(/6/4[${data.articles[1].id}])`);
    const doc = await book.sections[0].createDocument();
    expect(doc.querySelector('h1')?.textContent).toBe('Post 1');
    expect(doc.body.textContent).toContain('2026-01-01');
    expect(doc.querySelector('a')?.getAttribute('href')).toBe('https://example.com/post/1');
    // read back from the book
    const read = await readFeedBook(epub);
    expect(read?.data.articles.map((a) => a.url)).toEqual([article(1).url, article(2).url]);
    expect(read?.data.uid).toMatch(/^uuid:/);
  });

  test('made again: the new articles at the end, the others as they were, the CFIs on them still right', async () => {
    const first = await makeFeedBook({ title: 'Example', articles: [article(1), article(2)] });
    const v1 = await open(first.epub);
    const cfi = await cfiOf(v1, 1, 'paragraph of post 2, to highlight');
    expect(spineIdOf(cfi)).toBe(first.data.articles[1].id);

    // post 1 gone from the feed, the order changed, post 2 changed: none of it shows in the book
    const second = await makeFeedBook({
      title: 'Example',
      existing: await readFeedBook(first.epub),
      articles: [article(4), article(2, { html: '<p>Edited by the author.</p>' }), article(3)],
    });
    expect(second.added).toEqual([articleIdOf(article(4).url), articleIdOf(article(3).url)]);
    expect(second.data.articles.map((a) => a.title)).toEqual(['Post 1', 'Post 2', 'Post 4', 'Post 3']);
    expect(second.data.uid).toBe(first.data.uid);

    // the pages of the articles there before: byte for byte
    const [before, after] = [await filesOf(first.epub), await filesOf(second.epub)];
    for (const a of first.data.articles) expect(after.get(`OEBPS/${a.file}`)).toEqual(before.get(`OEBPS/${a.file}`));

    const v2 = await open(second.epub);
    expect(v2.sections).toHaveLength(4);
    expect(await textAt(v2, cfi)).toBe('paragraph of post 2, to highlight');
    expect(articleOfCfi(second.data, cfi)?.title).toBe('Post 2');
  });

  test('the id in the CFI finds the article where it is', async () => {
    const { epub, data } = await makeFeedBook({ title: 'Example', articles: [article(1), article(2)] });
    const cfi = await cfiOf(await open(epub), 1, 'of post 2, to');
    // as if at another place in the spine
    const moved = cfi.replace('/6/4[', '/6/2[');
    expect(moved).not.toBe(cfi);
    expect(await textAt(await open(epub), moved)).toBe('of post 2, to');
    // without the id, the place: the other article
    expect(await textAt(await open(epub), moved.replace(/\[a[0-9a-f]+\]/, ''))).not.toBe('of post 2, to');
    expect(articleOfCfi(data, moved)?.title).toBe('Post 2');
  });

  test('an excerpt made full only if nothing of the user is in it', async () => {
    const first = await makeFeedBook({
      title: 'Example',
      articles: [article(1, { partial: true, html: '<p>Just the start…</p>' }), article(2, { partial: true, html: '<p>Also the start…</p>' })],
    });
    const v1Text = await (await open(first.epub)).sections[0].createDocument();
    expect(v1Text.body.textContent).toContain('An excerpt, as the feed gives it');
    const [id1, id2] = first.data.articles.map((a) => a.id);
    const second = await makeFeedBook({
      title: 'Example',
      existing: await readFeedBook(first.epub),
      articles: [article(1, { html: '<p>The whole of post one.</p>' }), article(2, { html: '<p>The whole of post two.</p>' })],
      // post 2 annotated
      canRefresh: (id) => id !== id2,
    });
    expect(second.refreshed).toEqual([id1]);
    expect(second.added).toEqual([]);
    expect(second.data.articles.map((a) => Boolean(a.partial))).toEqual([false, true]);
    const v2 = await open(second.epub);
    expect((await v2.sections[0].createDocument()).body.textContent).toContain('The whole of post one.');
    expect((await v2.sections[1].createDocument()).body.textContent).toContain('Also the start');
    // the annotated one byte for byte
    const file2 = `OEBPS/${first.data.articles[1].file}`;
    expect((await filesOf(second.epub)).get(file2)).toEqual((await filesOf(first.epub)).get(file2));
  });

  test('the images in the book; those that fail, a link', async () => {
    const fetched: string[] = [];
    const { epub, data } = await makeFeedBook({
      title: 'Example',
      articles: [article(1, {
        html: '<p>Look:</p><img src="/a.png"><img data-src="b.png" src="lazy.gif" alt="B"><img src="https://t.example/p.gif" width="1" height="1"><img src="missing.png" alt="Gone">',
      })],
      fetchImage: async (url) => {
        fetched.push(url);
        return url.endsWith('missing.png') ? undefined : PNG;
      },
    });
    // the tracking pixel not fetched; the lazy one by its real source
    expect(fetched).toEqual(['https://example.com/a.png', 'https://example.com/post/b.png', 'https://example.com/post/missing.png']);
    const id = data.articles[0].id;
    expect(data.articles[0].resources).toEqual([`articles/${id}/1.png`, `articles/${id}/2.png`]);
    expect((await filesOf(epub)).get(`OEBPS/articles/${id}/1.png`)).toEqual(PNG);
    const doc = await (await open(epub)).sections[0].createDocument();
    expect(Array.from(doc.querySelectorAll('img')).map((i) => i.getAttribute('src'))).toEqual([`${id}/1.png`, `${id}/2.png`]);
    expect(doc.body.textContent).toContain('[Gone]');
    // kept as the book is made again
    const again = await makeFeedBook({ title: 'Example', existing: await readFeedBook(epub), articles: [article(2)] });
    expect((await filesOf(again.epub)).get(`OEBPS/articles/${id}/2.png`)).toEqual(PNG);
  });

  test('scripts and styles out', async () => {
    const { epub } = await makeFeedBook({
      title: 'Example',
      articles: [article(1, { html: '<p style="color:red" class="x" onclick="alert(1)">Hi<script>alert(2)</script></p><iframe src="https://e.com"></iframe>' })],
    });
    const xhtml = new TextDecoder().decode([...(await filesOf(epub)).entries()].find(([n]) => n.includes('/articles/'))![1]);
    expect(xhtml).not.toMatch(/script|onclick|style="|class="x"|iframe/);
  });

  test('a page missing from the book: not made, the CFIs would move', async () => {
    const { epub } = await makeFeedBook({ title: 'Example', articles: [article(1)] });
    const existing = (await readFeedBook(epub))!;
    existing.files.delete(existing.data.articles[0].file);
    await expect(makeFeedBook({ title: 'Example', existing, articles: [article(2)] })).rejects.toThrow('not in the book');
  });

  test('not a feed book; images by their bytes', async () => {
    const { buildEpub } = await import('./epub');
    const plain = await buildEpub({ title: 'T', language: 'en', chapters: [{ path: 't/1.xhtml', title: 'One', body: '<p>x</p>' }] });
    expect(await readFeedBook(plain)).toBeUndefined();
    expect(imageExtOf(PNG)).toBe('png');
    expect(imageExtOf(new TextEncoder().encode('<!doctype html><html>'))).toBeUndefined();
  });
});
