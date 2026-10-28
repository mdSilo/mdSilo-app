import { md5 } from 'js-md5';
import { buildEpub, escapeXml, hrefOf, type EpubChapter, type EpubResource } from './convert/epub';
import { bodyOfHtml, cleanHtml } from './convert/html';
import { readZip } from './convert';
import { guessLanguage } from './convert/text';

/**
 * A book of feed articles: the articles of a channel, or the
 * starred ones, as an EPUB in reading/, read and annotated as any book, and
 * made again with the new articles from time to time.
 *
 * The annotations (and bookmarks, `book:` links, the words of the
 * vocabulary) are kept by their CFIs, `epubcfi(/6/14[a1b2…]!/4/2/1:20)`:
 * the place of the chapter in the spine, then the place in its page. So, as
 * the book grows, both stay as they were:
 *
 * - An article is a chapter, written once: its page (XHTML) is kept as it is
 *   in the book, byte for byte, never made again from the article; the
 *   only exception is an excerpt for the full text, with nothing of the user
 *   in it (see `canRefresh`).
 * - New articles are added at the end of the spine; none is removed or moved,
 *   unstarred or gone from the feed.
 * - The spine item of an article has an id of its URL, in the CFIs foliate
 *   makes: the CFIs find the chapter by it before its place.
 * - The contents (nav.xhtml) and the style are not in the spine: made anew.
 *
 * What is in the book, in the book: OEBPS/mdsilo-feed.json. It goes where
 * the book goes; the book is made again from its own files, the pages read
 * from it.
 */

/** In the book, next to content.opf: what is in it. */
export const FEED_DATA = 'mdsilo-feed.json';
const ROOT = 'OEBPS/';
const DIR = 'articles';
const FEED_DATA_VERSION = 1;

export type FeedBookArticle = {
  /** of the URL: the id of its spine item, in the CFIs */
  id: string;
  url: string;
  title: string;
  /** its page, in OEBPS/ */
  file: string;
  /** its images, in OEBPS/ */
  resources?: string[];
  addedAt: string;
  /** an excerpt, as the feed gives it: the full text could not be fetched */
  partial?: boolean;
};

export type FeedBookData = {
  version: number;
  /** of the book, kept as it is made again */
  uid: string;
  title: string;
  language: string;
  createdAt: string;
  /** in the order of the spine */
  articles: FeedBookArticle[];
};

/** An article to add, its text as fetched (see feed/fullText.ts). */
export type FeedArticleInput = {
  url: string;
  title: string;
  author?: string;
  /** ISO */
  published?: string;
  /** e.g. the channel */
  source?: string;
  /** HTML, from outside: cleaned here */
  html: string;
  /** the URL its relative links are from */
  base: string;
  partial?: boolean;
};

/** A feed book read: what is in it, and its files (paths in OEBPS/). */
export type FeedBookFiles = { data: FeedBookData; files: Map<string, Uint8Array> };

/** The id of an article in the book, of its URL: a name of XML (a letter first). */
export const articleIdOf = (url: string) => `a${md5(url.trim()).slice(0, 16)}`;

/** The id of the spine item in a CFI, if any: `[a1b2…]` of `/6/14[a1b2…]!`. */
export const spineIdOf = (cfi: string) => cfi.match(/^epubcfi\(\/6\/\d+\[([^\]]+)\]/)?.[1];

/** The article of the book a CFI is in: by the id in it, else by its place in the spine. */
export function articleOfCfi(data: FeedBookData, cfi: string): FeedBookArticle | undefined {
  const id = spineIdOf(cfi);
  if (id) return data.articles.find((a) => a.id === id);
  const match = cfi.match(/^epubcfi\(\/6\/(\d+)/);
  return match ? data.articles[Number(match[1]) / 2 - 1] : undefined;
}

/** The feed book in an EPUB file; undefined if it is not one. */
export async function readFeedBook(epub: Uint8Array): Promise<FeedBookFiles | undefined> {
  const files = new Map<string, Uint8Array>();
  for (const f of await readZip(epub)) {
    if (f.name.startsWith(ROOT)) files.set(f.name.slice(ROOT.length), f.data);
  }
  const json = files.get(FEED_DATA);
  if (!json) return undefined;
  try {
    const data = JSON.parse(new TextDecoder().decode(json)) as FeedBookData;
    if (!Array.isArray(data.articles) || typeof data.uid !== 'string') return undefined;
    return { data, files };
  } catch {
    return undefined;
  }
}

const latin1 = (d: Uint8Array, from: number, to: number) => new TextDecoder('latin1').decode(d.subarray(from, to));

const IMAGE_TYPES: [(d: Uint8Array) => boolean, string][] = [
  [(d) => d[0] === 0x89 && d[1] === 0x50 && d[2] === 0x4e && d[3] === 0x47, 'png'],
  [(d) => d[0] === 0xff && d[1] === 0xd8 && d[2] === 0xff, 'jpg'],
  [(d) => d[0] === 0x47 && d[1] === 0x49 && d[2] === 0x46, 'gif'],
  [(d) => latin1(d, 8, 12) === 'WEBP', 'webp'],
  [(d) => /^ftypavi[fs]/.test(latin1(d, 4, 12)), 'avif'],
  [(d) => /<svg[\s>]/i.test(new TextDecoder().decode(d.subarray(0, 1024))), 'svg'],
];

/** The extension of an image by its bytes; undefined if not an image (e.g. a page of an error). */
export function imageExtOf(data: Uint8Array): string | undefined {
  return IMAGE_TYPES.find(([test]) => test(data))?.[1];
}

/** The most images of an article read into the book. */
const MAX_IMAGES = 60;

const absolute = (value: string, base: string) => {
  try {
    return new URL(value, base).href;
  } catch {
    return undefined;
  }
};

const isoDate = (value?: string) => {
  const date = value ? new Date(value) : undefined;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : undefined;
};

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/**
 * The page of an article: its title and where from, its text cleaned, the
 * links absolute, the images read into the book (in `articles/<id>/`).
 */
async function articlePage(
  article: FeedArticleInput,
  id: string,
  fetchImage?: (url: string) => Promise<Uint8Array | undefined>,
): Promise<{ body: string; resources: EpubResource[] }> {
  const doc = cleanHtml(article.html);
  for (const el of Array.from(doc.querySelectorAll('noscript, picture > source, iframe, script'))) el.remove();
  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    for (const attr of ['style', 'class', 'srcset', 'sizes', 'loading', 'decoding']) el.removeAttribute(attr);
  }
  for (const a of Array.from(doc.querySelectorAll('a[href]'))) {
    const href = a.getAttribute('href')!;
    if (href.startsWith('#')) continue;
    const url = absolute(href, article.base);
    if (url) a.setAttribute('href', url);
    else a.removeAttribute('href');
  }
  const resources: EpubResource[] = [];
  const inBook = new Map<string, string | undefined>();
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    const width = img.getAttribute('width');
    const height = img.getAttribute('height');
    // a tracking pixel
    if (width === '0' || width === '1' || height === '0' || height === '1') {
      img.remove();
      continue;
    }
    // lazy loaded, the real one in data-*
    const raw = ['data-src', 'data-original', 'data-lazy-src', 'src'].map((a) => img.getAttribute(a)).find(Boolean);
    for (const attr of Array.from(img.attributes)) if (attr.name.startsWith('data-')) img.removeAttribute(attr.name);
    if (raw?.startsWith('data:image/')) {
      img.setAttribute('src', raw);
      continue;
    }
    const url = raw ? absolute(raw, article.base) : undefined;
    let at = url ? inBook.get(url) : undefined;
    if (url && !inBook.has(url) && fetchImage && inBook.size < MAX_IMAGES) {
      const data = await fetchImage(url).catch(() => undefined);
      const ext = data && imageExtOf(data);
      if (data && ext) {
        at = `${DIR}/${id}/${resources.length + 1}.${ext}`;
        resources.push({ path: at, data });
      }
      inBook.set(url, at);
    }
    if (at) {
      img.setAttribute('src', at.slice(DIR.length + 1));
      continue;
    }
    // not in the book: a link to it, by its text if any
    const alt = img.getAttribute('alt')?.trim();
    if (url && alt) {
      const a = doc.createElement('a');
      a.setAttribute('href', url);
      a.textContent = `[${alt}]`;
      img.replaceWith(a);
    } else {
      img.remove();
    }
  }
  const meta = [article.author, isoDate(article.published), article.source].filter(Boolean).map((s) => escapeXml(s!));
  const link = `<a href="${escapeXml(article.url)}">${escapeXml(hostOf(article.url))}</a>`;
  const body = [
    `<h1>${escapeXml(article.title || article.url)}</h1>`,
    `<p class="feed-meta">${[...meta, link].join(' · ')}</p>`,
    `<div class="feed-content">${bodyOfHtml(doc)}</div>`,
    article.partial
      ? `<p class="feed-partial">An excerpt, as the feed gives it. The full article: ${link}</p>`
      : '',
  ].join('\n');
  return { body, resources };
}

const FEED_CSS = `
.feed-meta { font-size: 0.85em; opacity: 0.7; }
.feed-partial { margin-top: 2em; font-size: 0.9em; font-style: italic; opacity: 0.8; }
`;

export type FeedBookOptions = {
  title: string;
  /** the book as it is, if made before */
  existing?: FeedBookFiles;
  /** in the order to add them; those in the book already are not added again */
  articles: FeedArticleInput[];
  /**
   * An article in the book as an excerpt, its page to be made again with the
   * full text: only if nothing of the user is in it (annotations, links,
   * words), its CFIs pointing nowhere else.
   */
  canRefresh?: (id: string) => boolean;
  fetchImage?: (url: string) => Promise<Uint8Array | undefined>;
  now?: Date;
};

export type FeedBookResult = {
  epub: Uint8Array;
  data: FeedBookData;
  /** ids of the articles added */
  added: string[];
  /** ids of the articles in the book made again with the full text */
  refreshed: string[];
};

/**
 * The feed book, with the articles not in it yet at the end; the articles
 * in it as they are (see above).
 * @throws if a page of the book is missing: it can't be kept as it was
 */
export async function makeFeedBook(options: FeedBookOptions): Promise<FeedBookResult> {
  const { existing, fetchImage, canRefresh } = options;
  const now = (options.now ?? new Date()).toISOString();
  const old = existing?.data;
  const files = existing?.files ?? new Map<string, Uint8Array>();
  const articles = (old?.articles ?? []).map((a) => ({ ...a }));
  const byId = new Map(articles.map((a) => [a.id, a]));
  const byUrl = new Map(articles.map((a) => [a.url, a]));
  // the pages made now; the others are read from the book
  const pages = new Map<string, { body: string; resources: EpubResource[] }>();
  const added: string[] = [];
  const refreshed: string[] = [];

  for (const input of options.articles) {
    const url = input.url.trim();
    const known = byUrl.get(url);
    if (known) {
      if (known.partial && !input.partial && !pages.has(known.id) && canRefresh?.(known.id)) {
        const page = await articlePage(input, known.id, fetchImage);
        pages.set(known.id, page);
        Object.assign(known, { partial: undefined, resources: page.resources.map((r) => r.path) });
        refreshed.push(known.id);
      }
      continue;
    }
    // the same id of another URL (unlikely): another id
    let id = articleIdOf(url);
    for (let n = 2; byId.has(id); n++) id = `${articleIdOf(url)}-${n}`;
    const page = await articlePage({ ...input, url }, id, fetchImage);
    const article: FeedBookArticle = {
      id,
      url,
      title: input.title || url,
      file: `${DIR}/${id}.xhtml`,
      ...(page.resources.length ? { resources: page.resources.map((r) => r.path) } : {}),
      addedAt: now,
      ...(input.partial ? { partial: true } : {}),
    };
    pages.set(id, page);
    articles.push(article);
    byId.set(id, article);
    byUrl.set(url, article);
    added.push(id);
  }

  const language = old?.language
    || guessLanguage(options.articles.map((a) => a.title).join('\n') + Array.from(pages.values()).map((p) => p.body).join('\n'));
  const decoder = new TextDecoder();
  const chapters: EpubChapter[] = articles.map((a) => {
    const made = pages.get(a.id);
    if (made) return { id: a.id, path: a.file, title: a.title, body: made.body };
    const page = files.get(a.file);
    if (!page) throw new Error(`The page of "${a.title}" is not in the book: ${a.file}`);
    return { id: a.id, path: a.file, title: a.title, body: '', xhtml: decoder.decode(page) };
  });
  const resources: EpubResource[] = articles.flatMap((a) => pages.get(a.id)?.resources
    ?? (a.resources ?? []).flatMap((path) => {
      const data = files.get(path);
      return data ? [{ path, data }] : [];
    }));

  const data: FeedBookData = {
    version: FEED_DATA_VERSION,
    uid: old?.uid ?? `uuid:${crypto.randomUUID()}`,
    title: options.title,
    language,
    createdAt: old?.createdAt ?? now,
    articles,
  };
  const epub = await buildEpub({
    title: options.title,
    language,
    chapters,
    toc: articles.map((a) => ({ label: a.title, href: hrefOf(a.file) })),
    resources,
    css: FEED_CSS,
    identifier: data.uid,
    modified: `${now.slice(0, 19)}Z`,
    files: [{ path: FEED_DATA, data: new TextEncoder().encode(`${JSON.stringify(data, null, 2)}\n`) }],
  });
  return { epub, data, added, refreshed };
}
