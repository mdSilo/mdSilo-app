import { invoke } from '@tauri-apps/api/core';
import { joinPath } from '@/workspace/util';
import { dataRoot, localRoot } from '@/workspace/layout';
import type { ArticleType, ChannelType } from '@/types/model';

/**
 * The feed subscriptions and the starred articles are kept in the app's
 * database, out of the workspace. In the workspace layout they are also
 * written to `.mdsilo/feeds.json`, which syncs with the workspace, and merged
 * back from it: a three-way merge with the state last synced on this device
 * (`.mdsilo/local/feeds.base.json`), so removals carry over too.
 */
export const FEEDS_FILE = 'feeds.json';
export const FEEDS_BASE_FILE = 'feeds.base.json';
export const FEEDS_VERSION = 1;
export const SYNC_DELAY_MS = 1000;

export type SyncChannel = { link: string; title: string; ty: string };
export type SyncArticle = {
  url: string;
  title: string;
  feed_link: string;
  audio_url: string;
  description: string;
  published: string;
  author: string;
  image: string;
};

export type FeedsFile = {
  version: number;
  channels: SyncChannel[];
  starred: SyncArticle[];
};

type Merged<T> = {
  items: T[];
  /** in theirs only, to add here */
  add: T[];
  /** here only, removed there: to remove here */
  remove: T[];
};

/**
 * Merge by key. Without a base (never synced here), nothing is removed: the
 * union. An item one side lacks is removed if the base had it, else added.
 */
export function mergeByKey<T>(
  base: T[] | undefined,
  theirs: T[] | undefined,
  mine: T[],
  key: (item: T) => string,
): Merged<T> {
  if (!theirs) return { items: mine, add: [], remove: [] };
  const inBase = new Set((base ?? []).map(key));
  const theirKeys = new Map(theirs.map((item) => [key(item), item]));
  const myKeys = new Set(mine.map(key));
  const items: T[] = [];
  const add: T[] = [];
  const remove: T[] = [];
  for (const item of mine) {
    if (theirKeys.has(key(item)) || !inBase.has(key(item))) {
      items.push(item);
    } else {
      remove.push(item); // removed there
    }
  }
  for (const [k, item] of theirKeys) {
    if (myKeys.has(k) || inBase.has(k)) continue; // here, or removed here
    items.push(item);
    add.push(item);
  }
  const sorted = items.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  return { items: sorted, add, remove };
}

export const toSyncChannel = (c: ChannelType): SyncChannel => ({ link: c.link, title: c.title, ty: c.ty });

export const toSyncArticle = (a: ArticleType): SyncArticle => ({
  url: a.url,
  title: a.title,
  feed_link: a.feed_link,
  audio_url: a.audio_url ?? '',
  description: a.description ?? '',
  published: a.published ? String(a.published) : '',
  author: a.author ?? '',
  image: a.image ?? '',
});

/** The feeds file as written: sorted, so it only changes with the feeds. */
export function feedsFile(channels: SyncChannel[], starred: SyncArticle[]): FeedsFile {
  const byLink = (a: SyncChannel, b: SyncChannel) => (a.link < b.link ? -1 : a.link > b.link ? 1 : 0);
  const byUrl = (a: SyncArticle, b: SyncArticle) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0);
  return {
    version: FEEDS_VERSION,
    channels: [...channels].sort(byLink),
    starred: [...starred].sort(byUrl),
  };
}

export function parseFeedsFile(text: string | undefined): FeedsFile | undefined {
  if (!text?.trim()) return undefined;
  try {
    const raw = JSON.parse(text) as Partial<FeedsFile>;
    return {
      version: raw.version ?? FEEDS_VERSION,
      channels: Array.isArray(raw.channels) ? raw.channels.filter((c) => c?.link) : [],
      starred: Array.isArray(raw.starred) ? raw.starred.filter((a) => a?.url) : [],
    };
  } catch (e) {
    console.error(`${FEEDS_FILE} is not valid JSON`, e);
    return undefined;
  }
}

const readText = async (path: string) => {
  try {
    return await invoke<string>('read_file', { filePath: path });
  } catch {
    return '';
  }
};

const writeJson = async (path: string, data: FeedsFile) => {
  const text = `${JSON.stringify(data, null, 2)}\n`;
  if ((await readText(path)) === text) return;
  await invoke('write_file', { filePath: path, text });
};

let running: Promise<void> | undefined;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;

/**
 * Merge the feeds of the database and of the workspace both ways.
 * No-op outside the workspace layout. Runs one at a time.
 */
export function syncFeeds(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = doSync().finally(() => {
    running = undefined;
    if (again) {
      again = false;
      void syncFeeds();
    }
  });
  return running;
}

/** Sync once the changes made here pause. */
export function scheduleFeedSync() {
  if (!dataRoot()) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    void syncFeeds();
  }, SYNC_DELAY_MS);
}

async function doSync() {
  const data = dataRoot();
  const local = localRoot();
  if (!data || !local) return;
  const filePath = joinPath(data, FEEDS_FILE);
  const basePath = joinPath(local, FEEDS_BASE_FILE);
  try {
    const [channels, starred] = await Promise.all([
      invoke<ChannelType[]>('get_channels'),
      invoke<ArticleType[]>('get_articles', { feedLink: null, readStatus: null, starStatus: 1 }),
    ]);
    const theirs = parseFeedsFile(await readText(filePath));
    const base = parseFeedsFile(await readText(basePath));

    const chs = mergeByKey(
      base?.channels, theirs?.channels, (channels ?? []).map(toSyncChannel), (c) => c.link,
    );
    const stars = mergeByKey(
      base?.starred, theirs?.starred, (starred ?? []).map(toSyncArticle), (a) => a.url,
    );

    // apply here; a channel failing to load (offline) is tried again next time
    const failed = new Set<string>();
    for (const channel of chs.add) {
      const added = await invoke<number>('add_channel', {
        url: channel.link, ty: channel.ty || 'rss', title: channel.title || null,
      }).catch(() => 0);
      if (!added) failed.add(channel.link);
    }
    for (const channel of chs.remove) {
      await invoke('delete_channel', { link: channel.link });
    }
    if (stars.add.length > 0) {
      await invoke('add_starred_articles', {
        articles: stars.add.map((a) => ({ ...a, content: '' })),
      });
    }
    for (const article of stars.remove) {
      await invoke('update_article_star_status', { url: article.url, status: 0 });
    }

    const merged = feedsFile(chs.items, stars.items);
    await writeJson(filePath, merged);
    // what is here now: a failed channel is not, so it is added next time
    const synced = feedsFile(chs.items.filter((c) => !failed.has(c.link)), stars.items);
    await invoke('create_dir_recursive', { dirPath: local });
    await writeJson(basePath, synced);
  } catch (e) {
    console.error('Failed to sync the feeds', e);
  }
}

/** Reset module state; for tests. */
export function resetFeedSync() {
  if (timer) clearTimeout(timer);
  timer = undefined;
  running = undefined;
  again = false;
}
