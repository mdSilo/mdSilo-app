import { invoke } from '@tauri-apps/api/core';
import { decodeText } from 'reader/convert/text';
import type { ArticleType } from 'types/model';

/**
 * The full text of a feed article. Many feeds give a summary only, or the
 * first paragraphs: such an article is fetched from its page and the
 * article in the page taken out by Readability (as Firefox's reader view).
 *
 * Whether the text of the feed is the whole article can't be known for
 * sure; it is taken as partial if it is short, the same as the summary, or
 * ends as excerpts do ("…", "Read more"). The page is used if its text is
 * clearly longer than the feed's, so a full text in the feed is kept and a
 * page that fails (paywall, script-only site) does no harm.
 */

/** Shorter than this (letters, no spaces), the text of a feed is taken as an excerpt. */
export const SHORT_TEXT = 1500;
/** The text of the page used if it is longer than the feed's by this much. */
const LONGER = 1.2;
/**
 * Nor shorter than this, unless it begins as the feed's: a page of a paywall
 * or a sign in is longer than an excerpt of a line, but not an article.
 */
const MIN_PAGE_TEXT = 500;

// the ends of the excerpts of feeds
const EXCERPT_END = /(\.\.\.|…|\[…\]|\[\.\.\.\]|\(more…?\)|read more|continue reading|read the rest|阅读全文|查看全文|阅读更多|继续阅读|閱讀全文|繼續閱讀|全文を読む|続きを読む)\W*$/iu;

/** The text of some HTML: no tags, the spaces squeezed. */
export function textOfHtml(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

const lengthOf = (text: string) => text.replace(/\s/g, '').length;

/** The HTML of an article in the feed: its content, else its summary. */
export const feedHtmlOf = (article: Pick<ArticleType, 'content' | 'description'>) =>
  article.content?.trim() || article.description?.trim() || '';

/** The text of the feed is likely not the whole article. */
export function looksPartial(article: Pick<ArticleType, 'content' | 'description'>): boolean {
  const content = textOfHtml(article.content ?? '');
  const summary = textOfHtml(article.description ?? '');
  const text = content || summary;
  if (!text) return true;
  if (lengthOf(text) < SHORT_TEXT) return true;
  // the content no more than the summary
  if (!content || (summary && lengthOf(content) <= lengthOf(summary))) return true;
  return EXCERPT_END.test(text);
}

/** The text of a page by its bytes: the charset of its `<meta>`, else as decodeText guesses. */
export function decodeHtml(data: Uint8Array): string {
  const head = new TextDecoder('latin1').decode(data.subarray(0, 2048));
  const charset = head.match(/<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i)?.[1];
  if (charset && !/^utf-?8$/i.test(charset)) {
    try {
      return new TextDecoder(charset).decode(data);
    } catch {
      // not a charset the browser knows
    }
  }
  return decodeText(data);
}

const readBytes = async (url: string) => {
  const data = await invoke<ArrayBuffer | Uint8Array | number[]>('fetch_url', { url });
  return data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
};

/** The URL of the page, for its relative links: as the page says (canonical), else where it was fetched. */
function baseOf(doc: Document, url: string): string {
  const said = doc.querySelector('link[rel="canonical"]')?.getAttribute('href')
    || doc.querySelector('meta[property="og:url"]')?.getAttribute('content');
  try {
    return new URL(said || url, url).href;
  } catch {
    return url;
  }
}

export type PageArticle = { html: string; title?: string; author?: string; base: string };

/** The article in the HTML of a page, by Readability; undefined if none found. */
export async function articleOfPage(html: string, url: string): Promise<PageArticle | undefined> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const base = baseOf(doc, url);
  // the relative links and images resolved from it, by Readability
  const baseEl = doc.querySelector('base') ?? doc.head.appendChild(doc.createElement('base'));
  baseEl.setAttribute('href', base);
  const { Readability } = await import('@mozilla/readability');
  const parsed = new Readability(doc, { charThreshold: 200 }).parse();
  if (!parsed?.content) return undefined;
  return { html: parsed.content, title: parsed.title || undefined, author: parsed.byline || undefined, base };
}

export type FullText = {
  html: string;
  /** the URL relative links of the HTML are from */
  base: string;
  /** taken from the page of the article */
  fromPage: boolean;
  /** likely an excerpt still: the page could not be fetched or had no more */
  partial: boolean;
};

/**
 * The fullest text of an article: of the feed, or of its page if the
 * feed's looks partial and the page has more.
 */
export async function fullTextOf(
  article: Pick<ArticleType, 'url' | 'content' | 'description'>,
  fetchPage: (url: string) => Promise<Uint8Array> = readBytes,
): Promise<FullText> {
  const html = feedHtmlOf(article);
  const fromFeed = { html, base: article.url, fromPage: false, partial: false };
  if (!looksPartial(article)) return fromFeed;
  const partial = { ...fromFeed, partial: true };
  if (!/^https?:\/\//i.test(article.url)) return partial;
  try {
    const page = await articleOfPage(decodeHtml(await fetchPage(article.url)), article.url);
    if (!page) return partial;
    const feedText = textOfHtml(html);
    const pageText = textOfHtml(page.html);
    const [feedLength, pageLength] = [lengthOf(feedText), lengthOf(pageText)];
    // an excerpt is the start of the article, mostly
    const start = feedText.replace(/(\.\.\.|…)$/, '').slice(0, 60).trim();
    const isArticle = pageLength >= MIN_PAGE_TEXT || (start.length >= 20 && pageText.includes(start));
    if (!isArticle) return partial;
    if (pageLength > feedLength * LONGER) return { html: page.html, base: page.base, fromPage: true, partial: false };
    // the page has about as much: the feed has the whole article
    return pageLength >= feedLength * 0.8 ? fromFeed : partial;
  } catch (e) {
    console.warn('Failed to fetch the full text of', article.url, e);
    return partial;
  }
}

/** The bytes of an image of an article. */
export const fetchImage = readBytes;
