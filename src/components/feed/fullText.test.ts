import { articleOfPage, decodeHtml, fullTextOf, looksPartial, SHORT_TEXT } from './fullText';

const long = (word: string) => Array.from({ length: Math.ceil(SHORT_TEXT / 4) }, () => `<p>${word} ${word}.</p>`).join('');

const page = (body: string) => new TextEncoder().encode(`<!doctype html><html><head><title>A Post</title>
<link rel="canonical" href="https://blog.example/posts/a"></head><body>
<nav><a href="/">Home</a> <a href="/about">About</a></nav>
<article><h1>A Post</h1>${body}<img src="img/1.png" alt="One"></article>
<footer>© Example</footer></body></html>`);

describe('full text of feed articles', () => {
  test('partial: short, the summary only, or an excerpt by its end', () => {
    expect(looksPartial({ content: '', description: '' })).toBe(true);
    expect(looksPartial({ content: '<p>Short.</p>', description: '' })).toBe(true);
    expect(looksPartial({ content: '', description: long('summary') })).toBe(true);
    expect(looksPartial({ content: long('same'), description: long('same') })).toBe(true);
    expect(looksPartial({ content: `${long('text')}<p>Read more</p>`, description: '' })).toBe(true);
    expect(looksPartial({ content: `${long('文字')}<p>阅读全文</p>`, description: '' })).toBe(true);
    expect(looksPartial({ content: long('text'), description: '<p>A summary.</p>' })).toBe(false);
  });

  test('the full text from the page if the feed has an excerpt', async () => {
    const fetched: string[] = [];
    const text = await fullTextOf(
      { url: 'https://feeds.example/a', content: '', description: '<p>The start…</p>' },
      async (url) => {
        fetched.push(url);
        return page(long('whole'));
      },
    );
    expect(fetched).toEqual(['https://feeds.example/a']);
    expect(text.fromPage).toBe(true);
    expect(text.partial).toBe(false);
    expect(text.html).toContain('whole whole');
    // its relative links from the page as it says it is
    expect(text.base).toBe('https://blog.example/posts/a');
    expect(text.html).toContain('https://blog.example/posts/img/1.png');
  });

  test('the feed kept: full already, or the page has no more, or fails', async () => {
    const fetch = vi.fn(async () => page(long('whole')));
    const full = { url: 'https://e.com/a', content: long('feed'), description: '' };
    expect(await fullTextOf(full, fetch)).toMatchObject({ fromPage: false, partial: false });
    expect(fetch).not.toHaveBeenCalled();

    const excerpt = { url: 'https://e.com/a', content: '', description: '<p>Only the start of it…</p>' };
    const failed = await fullTextOf(excerpt, async () => {
      throw new Error('403');
    });
    expect(failed).toMatchObject({ fromPage: false, partial: true, html: '<p>Only the start of it…</p>' });
    // a page of no more text: an excerpt still
    expect(await fullTextOf(excerpt, async () => page('<p>Subscribe to read, or sign in with your account.</p>'))).toMatchObject({ partial: true });
    // a short article, its start the excerpt
    expect(await fullTextOf(excerpt, async () => page('<p>Only the start of it, and then the rest of this short note.</p>')))
      .toMatchObject({ fromPage: true, partial: false });
    // the page as much as the feed: the feed is the whole article
    const short = { url: 'https://e.com/a', content: `<p>${'word '.repeat(60)}</p>`, description: '' };
    expect(await fullTextOf(short, async () => page(`<p>${'word '.repeat(60)}</p>`))).toMatchObject({ fromPage: false, partial: false });
    // not a web page
    expect(await fullTextOf({ ...excerpt, url: 'file:///etc/passwd' }, fetch)).toMatchObject({ partial: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  test('a page by its charset; no article in it', async () => {
    const gbk = new Uint8Array([...new TextEncoder().encode('<meta charset="gbk"><p>'), 0xd6, 0xd0, 0xce, 0xc4]);
    expect(decodeHtml(gbk)).toContain('中文');
    expect(await articleOfPage('<html><body></body></html>', 'https://e.com')).toBeUndefined();
  });
});
