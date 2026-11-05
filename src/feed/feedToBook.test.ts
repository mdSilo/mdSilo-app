import { Blob as NodeBlob } from "node:buffer";
import { invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import {
  serializeAnnotations,
  type BookNote,
} from "@/reader/annotations/annotations";
import { readFeedBook } from "@/reader/convert/feedBook";
import {
  bookIdOf,
  readLibrary,
  refreshLibrary,
} from "@/reader/library/library";
import type { ArticleType } from "@/types/model";
import { makeNote, useWebFs } from "@/testUtils";
import {
  inBookOrder,
  limited,
  saveFeedBook,
  updateFeedBook,
} from "./feedToBook";
import { SHORT_TEXT } from "./fullText";

const WS = "/mdSilo";
const BOOK = `${WS}/reading/Example.epub`;
const read = (filePath: string) => invoke<string>("read_file", { filePath });
const longText = (n: number) =>
  Array.from(
    { length: Math.ceil(SHORT_TEXT / 10) },
    (_, i) => `<p>Paragraph ${i} of post ${n}.</p>`,
  ).join("");

const post = (n: number, extra: Partial<ArticleType> = {}): ArticleType => ({
  id: n,
  title: `Post ${n}`,
  url: `https://example.com/${n}`,
  feed_link: "https://example.com/feed",
  audio_url: "",
  description: "",
  content: longText(n),
  published: new Date(`2026-01-0${n}T00:00:00Z`),
  read_status: 0,
  star_status: 1,
  ...extra,
});
const excerpt = (n: number) =>
  post(n, { content: "", description: `<p>The start of post ${n}…</p>` });

const FEED = "https://example.com/feed";
const rss = (...ns: number[]) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>Example</title><link>https://example.com</link>${ns
    .map(
      (n) =>
        `<item><title>Post ${n}</title><link>https://example.com/${n}</link><pubDate>${new Date(`2026-01-0${n}T00:00:00Z`).toUTCString()}</pubDate><description><![CDATA[${longText(n)}]]></description></item>`,
    )
    .join("")}</channel></rss>`;

const annotation = (cfi: string): BookNote => ({
  id: `n-${cfi}`,
  type: "annotation",
  cfi,
  text: "quoted",
  color: "yellow",
  style: "highlight",
  note: "mine",
  chapter: "Post",
  createdAt: "c",
  updatedAt: "u",
});

const bookData = async () => {
  const bytes = await invoke<Uint8Array | ArrayBuffer>("read_file_bytes", {
    filePath: BOOK,
  });
  return (await readFeedBook(
    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
  ))!.data;
};

let pages: Record<string, string> = {};

beforeEach(async () => {
  await useWebFs();
  store.setState({ initDir: WS, layout: "workspace" });
  pages = {};
  // the files written by the app: jsdom's Blob loses its methods in fake-indexeddb
  vi.stubGlobal("Blob", NodeBlob);
  // the pages of the articles: those given, the others failing
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      pages[url]
        ? new Response(pages[url])
        : Promise.reject(new TypeError("Failed to fetch")),
    ),
  );
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("feed articles made a book", () => {
  test("the oldest first", () => {
    expect(
      inBookOrder([post(3), post(1), post(2, { published: undefined })]).map(
        (a) => a.id,
      ),
    ).toEqual([1, 3, 2]);
  });

  test("made, then the new articles added: the same book, its annotations and reading state kept", async () => {
    const made = await saveFeedBook("Example", [post(2), post(1)], {
      source: "Example",
    });
    expect(made).toMatchObject({
      path: BOOK,
      created: true,
      added: 2,
      total: 2,
      partial: 0,
    });
    const lib = await readLibrary(WS);
    expect(lib.books[made.hash]).toMatchObject({
      file: "reading/Example.epub",
      title: "Example",
      feed: "Example",
    });
    expect(lib.books[made.hash].fileHash).toBeUndefined();

    // annotated, read
    const [, second] = (await bookData()).articles;
    const cfi = `epubcfi(/6/4[${second.id}]!/4/6/2,/1:0,/1:5)`;
    const md = serializeAnnotations({
      header: { hash: made.hash, title: "Example" },
      notes: [annotation(cfi)],
    });
    await invoke("write_file", { filePath: `${BOOK}.md`, text: md });
    await invoke("write_file", {
      filePath: `${WS}/.mdsilo/books/${made.hash}.json`,
      text: JSON.stringify({ location: cfi }),
    });

    const again = await saveFeedBook("Example", [post(3), post(1), post(2)]);
    expect(again).toMatchObject({
      path: BOOK,
      hash: made.hash,
      created: false,
      added: 1,
      total: 3,
    });
    expect((await bookData()).articles.map((a) => a.title)).toEqual([
      "Post 1",
      "Post 2",
      "Post 3",
    ]);
    // the file another, the book the same
    const fileHash = await invoke<string>("book_hash", { filePath: BOOK });
    expect(fileHash).not.toBe(made.hash);
    const after = await refreshLibrary(WS);
    expect(Object.keys(after.books)).toEqual([made.hash]);
    expect(after.books[made.hash].fileHash).toBe(fileHash);
    expect(bookIdOf(after, fileHash)).toBe(made.hash);
    expect(await read(`${BOOK}.md`)).toBe(md);
    expect(
      JSON.parse(await read(`${WS}/.mdsilo/books/${made.hash}.json`)).location,
    ).toBe(cfi);

    // nothing new: not written
    expect(await saveFeedBook("Example", [post(1)])).toMatchObject({
      added: 0,
      refreshed: 0,
      total: 3,
    });
    expect(await invoke("book_hash", { filePath: BOOK })).toBe(fileHash);
  });

  test("the full text of an excerpt from its page; made full later if nothing of the user is in it", async () => {
    const made = await saveFeedBook("Example", [
      excerpt(1),
      excerpt(2),
      excerpt(3),
    ]);
    expect(made).toMatchObject({ added: 3, partial: 3, fromPage: 0 });
    const data = await bookData();
    expect(data.articles.every((a) => a.partial)).toBe(true);
    // post 2 annotated; a `book:` link to post 3 in a note
    const md = serializeAnnotations({
      notes: [annotation(`epubcfi(/6/4[${data.articles[1].id}]!/4/2/1:0)`)],
    });
    await invoke("write_file", { filePath: `${BOOK}.md`, text: md });
    const link = `[quote](book:${made.hash}#${encodeURIComponent(`epubcfi(/6/6[${data.articles[2].id}]!/4/2/1:0)`)})`;
    await invoke("write_file", { filePath: `${WS}/writing/a.md`, text: link });
    // not loaded: read as the index has the link to the book in it
    const parsed = { links: [], tags: [], issues: [], has_tasks: false };
    store.getState().upsertNote(
      makeNote({
        id: `${WS}/writing/a.md`,
        title: "a",
        content: "",
        parsed: { ...parsed, books: [made.hash] },
      }),
    );
    // not loaded, no link to the book as the index has it: not read, its
    // link to post 1 not seen
    const other = `[quote](book:${made.hash}#${encodeURIComponent(`epubcfi(/6/2[${data.articles[0].id}]!/4/2/1:0)`)})`;
    await invoke("write_file", { filePath: `${WS}/writing/b.md`, text: other });
    store
      .getState()
      .upsertNote(
        makeNote({ id: `${WS}/writing/b.md`, title: "b", content: "", parsed }),
      );

    for (const n of [1, 2, 3, 4]) {
      pages[`https://example.com/${n}`] =
        `<html><body><article><h1>Post ${n}</h1>${longText(n)}</article></body></html>`;
    }
    const again = await saveFeedBook("Example", [
      excerpt(1),
      excerpt(2),
      excerpt(3),
      excerpt(4),
    ]);
    expect(again).toMatchObject({ added: 1, fromPage: 1, partial: 0 });
    // post 1 made full; post 2 annotated, as it was; post 3 linked, as it was
    expect((await bookData()).articles.map((a) => Boolean(a.partial))).toEqual([
      false,
      true,
      true,
      false,
    ]);
    expect(again.refreshed).toBe(1);
    expect(await read(`${BOOK}.md`)).toBe(md);
  });

  test("in the library but not on this device: not made anew", async () => {
    const made = await saveFeedBook("Example", [post(1)]);
    await invoke("delete_files", { paths: [BOOK] });
    await expect(saveFeedBook("Example", [post(2)])).rejects.toThrow(
      "not on this device",
    );
    expect(Object.keys((await readLibrary(WS)).books)).toEqual([made.hash]);
  });

  test("found by the URL of its feed, before its name", async () => {
    const made = await saveFeedBook("Example", [post(1)], { feedUrl: FEED });
    expect((await readLibrary(WS)).books[made.hash].feedUrl).toBe(FEED);
    expect((await bookData()).feedUrl).toBe(FEED);
    // the channel renamed: the same book still
    const again = await saveFeedBook("Renamed", [post(2)], { feedUrl: FEED });
    expect(again).toMatchObject({
      hash: made.hash,
      path: BOOK,
      name: "Example",
      created: false,
      added: 1,
    });
    expect(Object.keys((await readLibrary(WS)).books)).toEqual([made.hash]);
    expect((await bookData()).title).toBe("Example");
    // another feed of the name: not added to it
    await expect(
      saveFeedBook("Example", [post(3)], {
        feedUrl: "https://other.example/feed",
      }),
    ).rejects.toThrow("of another feed");
    // the starred, of no feed: by the name, as before
    expect(await saveFeedBook("Example", [post(3)])).toMatchObject({
      hash: made.hash,
      added: 1,
    });
  });

  test("made before the URL was kept: found by its name, the URL kept then", async () => {
    const made = await saveFeedBook("Example", [post(1)]);
    expect((await readLibrary(WS)).books[made.hash].feedUrl).toBeUndefined();
    await saveFeedBook("Example", [post(1)], { feedUrl: FEED });
    expect((await readLibrary(WS)).books[made.hash].feedUrl).toBe(FEED);
    expect(
      await saveFeedBook("Renamed", [post(2)], { feedUrl: FEED }),
    ).toMatchObject({ hash: made.hash, added: 1 });
  });

  test("the feed fetched again: its new articles at the end of the book", async () => {
    const made = await saveFeedBook("Example", [post(1)], { feedUrl: FEED });
    pages[FEED] = rss(3, 1, 2);
    const report = await updateFeedBook(made.hash);
    expect(report).toMatchObject({
      hash: made.hash,
      created: false,
      added: 2,
      total: 3,
    });
    expect((await bookData()).articles.map((a) => a.title)).toEqual([
      "Post 1",
      "Post 2",
      "Post 3",
    ]);
    expect(await updateFeedBook(made.hash)).toMatchObject({ added: 0 });
  });

  test("the feed fetched again: not of a feed, or the feed failing", async () => {
    const starred = await saveFeedBook("Starred", [post(1)]);
    await expect(updateFeedBook(starred.hash)).rejects.toThrow("not of a feed");
    const made = await saveFeedBook("Example", [post(1)], { feedUrl: FEED });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(updateFeedBook(made.hash)).rejects.toThrow(
      "Failed to fetch the feed",
    );
  });

  test("no workspace", async () => {
    store.setState({ initDir: undefined });
    await expect(saveFeedBook("Example", [post(1)])).rejects.toThrow(
      "Open a folder",
    );
  });
});

test("limited: no more than the limit at a time, all done", async () => {
  let running = 0;
  let most = 0;
  const run = limited(2, async (n: number) => {
    most = Math.max(most, ++running);
    await new Promise((r) => setTimeout(r, 5 - n));
    running--;
    return n * 10;
  });
  const failing = limited(1, async () => {
    throw new Error("no");
  });
  await expect(failing()).rejects.toThrow("no");
  // a failure frees its place
  await expect(failing()).rejects.toThrow("no");
  expect(await Promise.all([1, 2, 3, 4, 5].map((n) => run(n)))).toEqual([
    10, 20, 30, 40, 50,
  ]);
  expect(most).toBe(2);
});
