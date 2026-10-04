/**
 * RSS / Atom feed on web, stored in IndexedDB.
 * Port of src-tauri/src/feed.rs and db.rs.
 * NOTE: fetching a feed from browser is subject to CORS, many feeds may fail.
 */
import { ARTICLES, CHANNELS, get, getAll, put, reqToPromise, tx } from './idb';

export interface NewChannel {
  title: string;
  link: string;
  description: string;
  published: string;
  ty: string;
}

export interface Channel extends NewChannel {
  id: number;
}

export interface NewArticle {
  title: string;
  url: string;
  feed_link: string;
  audio_url: string;
  description: string;
  published: string;
  content: string;
  author: string;
  image: string;
}

export interface Article extends NewArticle {
  id: number;
  read_status: number;
  star_status: number;
}

export interface FeedResult {
  channel: NewChannel;
  articles: NewArticle[];
}

const childText = (el: Element | Document, ...names: string[]): string => {
  for (const name of names) {
    const found = Array.from(el.children).find((c) => c.localName === name || c.nodeName === name);
    if (found) return (found.textContent ?? '').trim();
  }
  return '';
};

export function parseFeed(xml: string, url: string, ty: string, title?: string | null): FeedResult | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return null;
  const root = doc.documentElement;
  const customTitle = title?.trim();

  // RSS 2.0 / 0.9x, RSS 1.0 (rdf)
  if (root.localName === 'rss' || root.localName === 'RDF') {
    const chan = Array.from(root.children).find((c) => c.localName === 'channel');
    if (!chan) return null;
    const items = root.localName === 'rss'
      ? Array.from(chan.children).filter((c) => c.localName === 'item')
      : Array.from(root.children).filter((c) => c.localName === 'item');
    const channel: NewChannel = {
      title: customTitle || childText(chan, 'title'),
      link: url,
      description: childText(chan, 'description'),
      published: childText(chan, 'pubDate', 'date'),
      ty,
    };
    const articles = items.map((item) => {
      const description = childText(item, 'description');
      const enclosure = Array.from(item.children).find((c) => c.localName === 'enclosure');
      const mime = enclosure?.getAttribute('type') ?? '';
      return {
        title: childText(item, 'title'),
        url: childText(item, 'link'),
        feed_link: url,
        audio_url: mime.startsWith('audio/') ? enclosure?.getAttribute('url') ?? '' : '',
        description,
        published: childText(item, 'pubDate', 'date'),
        content: childText(item, 'encoded') || description,
        author: childText(item, 'author', 'creator'),
        image: '',
      };
    });
    return { channel, articles };
  }

  // Atom
  if (root.localName === 'feed') {
    const channel: NewChannel = {
      title: customTitle || childText(root, 'title'),
      link: url,
      description: childText(root, 'subtitle'),
      published: childText(root, 'updated'),
      ty,
    };
    const entries = Array.from(root.children).filter((c) => c.localName === 'entry');
    const articles = entries.map((entry) => {
      const linkEl = Array.from(entry.children).find((c) => c.localName === 'link');
      const description = childText(entry, 'summary');
      const updated = childText(entry, 'updated', 'published');
      const date = new Date(updated);
      return {
        title: childText(entry, 'title'),
        url: linkEl?.getAttribute('href') ?? '',
        feed_link: url,
        audio_url: '',
        description,
        published: isNaN(date.getTime()) ? updated : date.toUTCString(),
        content: childText(entry, 'content') || description,
        author: '',
        image: '',
      };
    });
    return { channel, articles };
  }

  return null;
}

async function processFeed(url: string, ty: string, title?: string | null): Promise<FeedResult | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return parseFeed(await resp.text(), url, ty, title);
  } catch (e) {
    console.error(`Failed to fetch feed ${url}:`, e);
    return null;
  }
}

async function nextId(store: typeof CHANNELS | typeof ARTICLES): Promise<number> {
  const all = await getAll<{ id: number }>(store);
  return all.reduce((max, item) => Math.max(max, item.id), 0) + 1;
}

/** insert or ignore, return the number of inserted articles */
async function addArticles(articles: NewArticle[]): Promise<number> {
  let id = await nextId(ARTICLES);
  return tx(ARTICLES, 'readwrite', async (t) => {
    const s = t.objectStore(ARTICLES);
    let num = 0;
    for (const article of articles) {
      if (!article.url) continue;
      const old = await reqToPromise(s.getKey(article.url));
      if (old !== undefined) continue;
      await reqToPromise(s.put({ ...article, id: id++, read_status: 0, star_status: 0 }));
      num += 1;
    }
    return num;
  });
}

async function saveChannel(channel: NewChannel, articles: NewArticle[]): Promise<number> {
  const old = await get<Channel>(CHANNELS, channel.link);
  if (!old) {
    await put(CHANNELS, { ...channel, id: await nextId(CHANNELS) });
  }
  return addArticles(articles);
}

export async function fetchFeed(url: string): Promise<FeedResult | null> {
  return processFeed(url, 'rss');
}

export async function addChannel(url: string, ty: string, title: string | null): Promise<number> {
  const res = await processFeed(url, ty, title);
  return res ? saveChannel(res.channel, res.articles) : 0;
}

export async function importChannels(list: string[]): Promise<number> {
  let num = 0;
  for (const url of list ?? []) {
    num += await addChannel(url, 'rss', null);
  }
  return num;
}

export async function getChannels(): Promise<Channel[]> {
  const channels = await getAll<Channel>(CHANNELS);
  return channels.sort((a, b) => a.id - b.id);
}

export async function deleteChannel(link: string): Promise<number> {
  return tx([CHANNELS, ARTICLES], 'readwrite', async (t) => {
    const keys = await reqToPromise(t.objectStore(ARTICLES).index('feed_link').getAllKeys(link));
    for (const key of keys) {
      await reqToPromise(t.objectStore(ARTICLES).delete(key));
    }
    const had = await reqToPromise(t.objectStore(CHANNELS).getKey(link));
    await reqToPromise(t.objectStore(CHANNELS).delete(link));
    return had !== undefined ? 1 : 0;
  });
}

export async function addArticlesWithChannel(link: string): Promise<number> {
  const channel = await get<Channel>(CHANNELS, link);
  if (!channel) return 0;
  const res = await processFeed(channel.link, 'rss');
  return res ? addArticles(res.articles) : 0;
}

export async function getArticles(
  feedLink: string | null,
  readStatus: number | null,
  starStatus: number | null,
): Promise<Article[]> {
  const articles = feedLink
    ? await getAll<Article>(ARTICLES, feedLink, 'feed_link')
    : await getAll<Article>(ARTICLES);
  return articles
    .filter((a) => readStatus === null || readStatus === undefined || a.read_status === readStatus)
    .filter((a) => starStatus === null || starStatus === undefined || a.star_status === starStatus)
    .sort((a, b) => a.id - b.id);
}

export async function getArticleByUrl(url: string): Promise<Article | null> {
  return (await get<Article>(ARTICLES, url)) ?? null;
}

export async function getUnreadNum(): Promise<Record<string, number>> {
  const articles = await getAll<Article>(ARTICLES);
  const result: Record<string, number> = {};
  for (const a of articles) {
    if (a.read_status === 0) result[a.feed_link] = (result[a.feed_link] ?? 0) + 1;
  }
  return result;
}

async function updateArticles(
  match: (a: Article) => boolean,
  update: Partial<Article>,
  feedLink?: string,
): Promise<number> {
  return tx(ARTICLES, 'readwrite', async (t) => {
    const s = t.objectStore(ARTICLES);
    const articles = await reqToPromise<Article[]>(
      feedLink !== undefined ? s.index('feed_link').getAll(feedLink) : s.getAll()
    );
    let num = 0;
    for (const a of articles.filter(match)) {
      await reqToPromise(s.put({ ...a, ...update }));
      num += 1;
    }
    return num;
  });
}

export function updateArticleReadStatus(url: string, status: number): Promise<number> {
  return updateArticles((a) => a.url === url, { read_status: status });
}

export function updateArticleStarStatus(url: string, status: number): Promise<number> {
  return updateArticles((a) => a.url === url, { star_status: status });
}

export function updateAllReadStatus(feedLink: string, readStatus: number): Promise<number> {
  return updateArticles(() => true, { read_status: readStatus }, feedLink);
}
