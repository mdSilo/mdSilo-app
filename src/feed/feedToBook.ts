import { invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import { withContents } from "@/lib/contentCache";
import { indexOf } from "@/lib/linkIndex";
import { fromWorkspacePath, toWorkspacePath } from "@/workspace/util";
import {
  annotationsPathOf,
  parseAnnotations,
  parseBookHref,
} from "@/reader/annotations/annotations";
import { indexBookText, readsInRust } from "@/reader/bookIndex";
import { openBook } from "@/reader/document";
import {
  articleOfCfi,
  makeFeedBook,
  readFeedBook,
  type FeedArticleInput,
  type FeedBookData,
  type FeedBookFiles,
} from "@/reader/convert/feedBook";
import {
  bookHashOf,
  importBookData,
  readLibrary,
  saveBookEntry,
  writeBytes,
  type BookEntry,
  type Library,
} from "@/reader/library/library";
import { useReaderStore, useSideStore } from "@/reader/readerStore";
import { readVocabulary } from "@/reader/vocabulary/vocabulary";
import type { ArticleType } from "@/types/model";
import { fetchFeed } from "./dataAgent";
import { fetchImage, fullTextOf } from "./fullText";

/**
 * Feed articles made a book, see reader/convert/feedBook.ts: the book of
 * a name made, or the new articles added to it. The articles in the book
 * stay as they are, so do the annotations on them.
 */

export type FeedBookReport = {
  /** of the book file */
  path: string;
  /** the name of the book: found by the URL of the feed, maybe not the one given */
  name: string;
  /** of the book in the library */
  hash: string;
  created: boolean;
  added: number;
  /** of the added, the full text from the page of the article */
  fromPage: number;
  /** of the added, an excerpt still (as the feed gives it) */
  partial: number;
  /** the excerpts in the book made again with the full text */
  refreshed: number;
  /** the articles in the book */
  total: number;
};

/** The pages fetched at a time. */
const CONCURRENCY = 3;

// not in a file name on some systems; the control characters too
const fileNameOf = (name: string) =>
  `${
    Array.from(name, (c) => (c < " " || '\\/:*?"<>|'.includes(c) ? "_" : c))
      .join("")
      .trim() || "Feed"
  }.epub`;

const publishedTime = (a: ArticleType) => {
  const t = a.published ? new Date(a.published).getTime() : NaN;
  return Number.isNaN(t) ? Infinity : t;
};

/** The articles in the order to add them: the oldest first, as a book reads. */
export const inBookOrder = (articles: ArticleType[]) =>
  [...articles].sort((a, b) => publishedTime(a) - publishedTime(b));

async function mapLimited<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  onDone?: () => void,
) {
  const out: R[] = new Array(items.length);
  let next = 0;
  const work = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
      onDone?.();
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, work),
  );
  return out;
}

const BOOK_LINK = /book:[0-9a-f]{32}#[^\s)\]>"'`]+/gi;

/**
 * The articles of the book with something of the user in them: annotations
 * and bookmarks, words of the vocabulary, `book:` links in the notes.
 */
async function articlesInUse(
  ws: string,
  hash: string,
  path: string,
  data: FeedBookData,
): Promise<Set<string>> {
  const cfis: string[] = [];
  const md = await invoke<string>("read_file", {
    filePath: annotationsPathOf(path),
  }).catch(() => "");
  if (md) cfis.push(...parseAnnotations(md).notes.map((n) => n.cfi));
  for (const entry of await readVocabulary(ws).catch(() => [])) {
    if (entry.context?.book === hash && entry.context.cfi)
      cfis.push(entry.context.cfi);
  }
  // the notes not loaded (see Note.parsed) read only if the index has a
  // link to the book in them
  const notes = store.getState().notes;
  const index = indexOf(notes);
  const linking = notes
    .values()
    .filter((n) => !n.parsed || index.books(n.id).includes(hash));
  for (const note of await withContents(linking)) {
    for (const href of note.content.match(BOOK_LINK) ?? []) {
      const link = parseBookHref(href);
      if (link?.hash === hash && link.cfi) cfis.push(link.cfi);
    }
  }
  return new Set(
    cfis
      .map((cfi) => articleOfCfi(data, cfi)?.id)
      .filter((id): id is string => Boolean(id)),
  );
}

/**
 * The feed book to add the articles to: the one of the feed URL, else the
 * one of the name. Undefined if none, to be made.
 * @throws if the book of the name is of another feed
 */
export function feedBookOf(
  lib: Library,
  name: string,
  feedUrl?: string,
): BookEntry | undefined {
  const books = Object.values(lib.books).filter((b) => b.feed);
  const url = feedUrl?.trim();
  const byUrl = url ? books.find((b) => b.feedUrl === url) : undefined;
  if (byUrl) return byUrl;
  const byName = books.find((b) => b.feed === name);
  if (byName?.feedUrl && url && byName.feedUrl !== url)
    throw new Error(
      `The book "${name}" is of another feed (${byName.feedUrl}): choose another name`,
    );
  return byName;
}

/**
 * Make the book of a name of the articles, or add the new ones to it: the
 * book of the feed URL if any, else the one of the name (see feedBookOf).
 * @param source e.g. the channel, shown in each article
 * @param feedUrl of the articles, if of a feed: kept with the book
 * @throws if no workspace, or the book is in the library but not on this device
 */
export async function saveFeedBook(
  name: string,
  articles: ArticleType[],
  options: {
    source?: string;
    feedUrl?: string;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<FeedBookReport> {
  const ws = store.getState().initDir;
  if (!ws)
    throw new Error("Open a folder first: the book is saved in its reading/");
  const lib = await readLibrary(ws);
  const feedUrl = options.feedUrl?.trim() || undefined;
  const entry = feedBookOf(lib, name, feedUrl);
  if (entry?.feed) name = entry.feed;
  let path: string | undefined;
  let existing: FeedBookFiles | undefined;
  if (entry) {
    path = fromWorkspacePath(ws, entry.file);
    if (!(await invoke<boolean>("file_exist", { filePath: path }))) {
      // made here anew, it would be another book: the annotations made on the other one misplaced
      throw new Error(
        `The book "${name}" is not on this device. Sync its file (in the library), then add to it here.`,
      );
    }
    // the annotations being written: in the md before it is read
    for (const reader of [useReaderStore, useSideStore]) {
      if (reader.getState().path === path) await reader.getState().flush();
    }
    const bytes = await invoke<ArrayBuffer | Uint8Array | number[]>(
      "read_file_bytes",
      { filePath: path },
    );
    existing = await readFeedBook(
      bytes instanceof Uint8Array
        ? bytes
        : new Uint8Array(bytes as ArrayBuffer),
    );
    if (!existing)
      throw new Error(`${entry.file} is not a book of feed articles`);
  }

  const inBook = new Map(
    (existing?.data.articles ?? []).map((a) => [a.url, a]),
  );
  const ordered = inBookOrder(articles).filter((a) => a.url?.trim());
  const fresh = ordered.filter((a) => !inBook.has(a.url.trim()));
  // the excerpts in the book: made again with the full text, if nothing of the user is in them
  const excerpts = ordered.filter((a) => inBook.get(a.url.trim())?.partial);
  const inUse =
    entry && path && existing && excerpts.length
      ? await articlesInUse(ws, entry.hash, path, existing.data)
      : new Set<string>();
  const toRefresh = excerpts.filter(
    (a) => !inUse.has(inBook.get(a.url.trim())!.id),
  );
  const toFetch = [...fresh, ...toRefresh];

  let done = 0;
  options.onProgress?.(0, toFetch.length);
  const texts = await mapLimited(
    toFetch,
    CONCURRENCY,
    (a) => fullTextOf(a),
    () => options.onProgress?.(++done, toFetch.length),
  );
  const inputs: FeedArticleInput[] = toFetch.map((a, i) => ({
    url: a.url.trim(),
    title: a.title,
    author: a.author,
    published: a.published ? String(a.published) : undefined,
    source: options.source,
    html: texts[i].html,
    base: texts[i].base,
    partial: texts[i].partial,
  }));

  const result = await makeFeedBook({
    title: existing?.data.title ?? name,
    feedUrl,
    existing,
    articles: inputs,
    canRefresh: (id) => !inUse.has(id),
    fetchImage: (url) => fetchImage(url).catch(() => undefined),
  });
  const addedTexts = texts.slice(0, fresh.length);
  const report = {
    name,
    created: !entry,
    added: result.added.length,
    fromPage: addedTexts.filter((t) => t.fromPage).length,
    partial: addedTexts.filter((t) => t.partial).length,
    refreshed: result.refreshed.length,
    total: result.data.articles.length,
  };
  if (
    entry &&
    path &&
    result.added.length === 0 &&
    result.refreshed.length === 0
  ) {
    // a book made before the URL was kept: found by it from now on
    if (feedUrl && !entry.feedUrl)
      await saveBookEntry(ws, { hash: entry.hash, feedUrl });
    return { ...report, path, hash: entry.hash };
  }

  // the book open in the reader: closed, its annotations saved; opened again it is the new one
  for (const reader of [useReaderStore, useSideStore]) {
    if (path && reader.getState().path === path)
      await reader.getState().close();
  }
  if (entry && path) {
    if (!(await writeBytes(path, result.epub)))
      throw new Error(`Failed to write ${entry.file}`);
  } else {
    path = await importBookData(ws, fileNameOf(name), result.epub);
    if (!path) throw new Error(`Failed to write the book "${name}"`);
  }
  const fileHash = await bookHashOf(path);
  // a book written again keeps its id: its annotations, links, reading state with it
  const hash = entry?.hash ?? fileHash;
  if (entry) {
    await saveBookEntry(ws, {
      hash,
      fileHash: fileHash !== hash ? fileHash : undefined,
      ...(feedUrl && !entry.feedUrl ? { feedUrl } : {}),
    });
  } else {
    await saveBookEntry(ws, {
      hash,
      file: toWorkspacePath(ws, path),
      title: name,
      author: "",
      format: "EPUB",
      addedAt: new Date().toISOString(),
      feed: name,
      ...(feedUrl ? { feedUrl } : {}),
    });
  }
  void reindex(hash, name, result.epub, path);
  return { ...report, path, hash };
}

/**
 * The feed of a feed book fetched again, its new articles added to the end
 * of the book.
 * @throws if the book is not of a feed URL, or the feed could not be fetched
 */
export async function updateFeedBook(
  hash: string,
  onProgress?: (done: number, total: number) => void,
): Promise<FeedBookReport> {
  const ws = store.getState().initDir;
  if (!ws) throw new Error("Open a folder first");
  const entry = (await readLibrary(ws)).books[hash];
  if (!entry?.feed || !entry.feedUrl)
    throw new Error(
      "The book is not of a feed, or of one made before its URL was kept",
    );
  const fetched = await fetchFeed(entry.feedUrl).catch(() => null);
  if (!fetched?.articles)
    throw new Error(`Failed to fetch the feed ${entry.feedUrl}`);
  return saveFeedBook(entry.feed, fetched.articles, {
    feedUrl: entry.feedUrl,
    source: fetched.channel?.title,
    onProgress,
  });
}

/** The text of the book in the search again: the new articles found. */
async function reindex(
  hash: string,
  title: string,
  epub: Uint8Array,
  path: string,
) {
  try {
    // of the file written, if Rust reads it: the book not opened here
    if (readsInRust(path))
      return await indexBookText(hash, title, undefined, true, path);
    const { book } = await openBook(new File([epub as BlobPart], "feed.epub"));
    await indexBookText(hash, title, book, true);
    await book.destroy?.();
  } catch (e) {
    console.warn("Failed to index the feed book", e);
  }
}
