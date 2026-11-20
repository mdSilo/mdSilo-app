import { invoke } from "@tauri-apps/api/core";
import { useWebFs } from "../../testUtils";
import { SNAPSHOT_KEY, indexSave, indexSettled, resetIndexer } from "./indexer";
import { KV, get, put } from "./idb";
import { SearchEngine, snippetOf, tokenize } from "./searchEngine";

type Indexed = {
  id: string;
  title: string;
  is_dir: boolean;
  links: string[];
  tags: string[];
  issues: number[];
  has_tasks: boolean;
};
type Hit = {
  id: string;
  path: string;
  kind: string;
  label: string;
  snippet: string;
};

const write = (filePath: string, text: string) =>
  invoke("write_file", { filePath, text });

beforeEach(async () => {
  await useWebFs();
  resetIndexer();
});

describe("search engine", () => {
  test("words of all languages", () => {
    expect(tokenize("Hello, world! 我们学习全文搜索")).toEqual(
      expect.arrayContaining(["Hello", "world", "搜索"]),
    );
  });

  test("snippets, escaped", () => {
    expect(snippetOf("a <b> tag and the fruit tree", ["fruit"])).toBe(
      "a &lt;b&gt; tag and the <b>fruit</b> tree",
    );
  });

  test("all the words, by prefix, of a kind", () => {
    const engine = new SearchEngine();
    engine.put({
      id: "a",
      kind: "note",
      title: "Rust",
      label: "",
      body: "ownership and borrowing",
    });
    engine.put({
      id: "book:h#1",
      kind: "book",
      title: "B",
      label: "One",
      body: "borrowing money",
    });
    expect(
      engine
        .search("borrow", undefined, 10)
        .map((h) => h.id)
        .sort(),
    ).toEqual(["a", "book:h#1"]);
    expect(
      engine.search("borrowing money", undefined, 10).map((h) => h.id),
    ).toEqual(["book:h#1"]);
    expect(engine.search("borrowing", "note", 10).map((h) => h.id)).toEqual([
      "a",
    ]);
    engine.deletePrefix("book:h#");
    expect(engine.ids()).toEqual(["a"]);
    engine.put({
      id: "a",
      kind: "note",
      title: "Rust",
      label: "",
      body: "lifetimes",
    });
    expect(engine.search("borrowing", undefined, 10)).toEqual([]);
  });
});

describe("index of the web version", () => {
  test("the notes without content, what they link to, searchable", async () => {
    await write(
      "/mdSilo/writing/a.md",
      "See [[b]] #tag# [i](issue:3)\n- [ ] todo",
    );
    await write("/mdSilo/writing/sub/b.md", "the fruit tree");
    await write("/mdSilo/.mdsilo/hidden.md", "[[x]]");
    const notes = await invoke<Indexed[]>("index_open", { dir: "/mdSilo" });
    const a = notes.find((n) => n.id === "/mdSilo/writing/a.md")!;
    expect(a).toMatchObject({
      title: "a",
      links: ["b"],
      tags: ["tag"],
      issues: [3],
      has_tasks: true,
    });
    expect(a).not.toHaveProperty("content");
    expect(notes.some((n) => n.id.includes(".mdsilo"))).toBe(false);
    expect(notes.find((n) => n.id === "/mdSilo/writing/sub")?.is_dir).toBe(
      true,
    );

    const hits = await invoke<Hit[]>("index_search", {
      query: "fruit",
      kind: null,
      limit: 10,
    });
    expect(hits.map((h) => h.path)).toEqual(["/mdSilo/writing/sub/b.md"]);
    expect(hits[0].snippet).toContain("<b>fruit</b>");
  });

  test("follows the changes of the files", async () => {
    await write("/mdSilo/writing/a.md", "old words");
    await invoke("index_open", { dir: "/mdSilo" });
    await write("/mdSilo/writing/a.md", "new words");
    await write("/mdSilo/writing/c.md", "zebra note");
    await indexSettled();
    expect(
      await invoke<Hit[]>("index_search", {
        query: "old",
        kind: null,
        limit: 10,
      }),
    ).toEqual([]);
    expect(
      (
        await invoke<Hit[]>("index_search", {
          query: "zebra",
          kind: null,
          limit: 10,
        })
      ).length,
    ).toBe(1);
    await invoke("delete_files", { paths: ["/mdSilo/writing/c.md"] });
    await indexSettled();
    expect(
      await invoke<Hit[]>("index_search", {
        query: "zebra",
        kind: null,
        limit: 10,
      }),
    ).toEqual([]);
    const delta = await invoke<{ updated: Indexed[]; removed: string[] }>(
      "index_update",
      {
        paths: [
          "/mdSilo/writing/a.md",
          "/mdSilo/writing/gone.md",
          "/elsewhere/x.md",
        ],
      },
    );
    expect(delta.updated.map((n) => n.id)).toEqual(["/mdSilo/writing/a.md"]);
    expect(delta.removed).toEqual(["/mdSilo/writing/gone.md"]);
  });

  test("the text of the books", async () => {
    await invoke("index_open", { dir: "/mdSilo" });
    expect(await invoke("index_book_indexed", { hash: "h" })).toBe(false);
    await invoke("index_book", {
      hash: "h",
      title: "A Book",
      sections: [{ cfi: "/6/2", label: "One", text: "whales at sea" }],
    });
    expect(await invoke("index_book_indexed", { hash: "h" })).toBe(true);
    const hits = await invoke<Hit[]>("index_search", {
      query: "whales",
      kind: "book",
      limit: 10,
    });
    expect(hits).toMatchObject([
      { id: "book:h#/6/2", path: "", kind: "book", label: "One" },
    ]);
  });

  test("saved, and on the next open only the changes are indexed", async () => {
    await write("/mdSilo/writing/keep.md", "apple #fruit");
    await write("/mdSilo/writing/edit.md", "old words");
    await write("/mdSilo/writing/gone.md", "zebra");
    await invoke("index_open", { dir: "/mdSilo" });
    await invoke("index_book", {
      hash: "h",
      title: "A Book",
      sections: [{ cfi: "/6/2", label: "One", text: "whales at sea" }],
    });
    await indexSave();
    // what the saved index says of the note not changed is what is used
    type Snap = { notes: Indexed[] };
    const snap = (await get<Snap>(KV, SNAPSHOT_KEY))!;
    snap.notes.find((n) => n.id === "/mdSilo/writing/keep.md")!.tags = [
      "saved",
    ];
    await put(KV, snap, SNAPSHOT_KEY);

    // the app closed: changes meanwhile
    resetIndexer();
    await write("/mdSilo/writing/edit.md", "new words");
    await invoke("delete_files", { paths: ["/mdSilo/writing/gone.md"] });

    const notes = await invoke<Indexed[]>("index_open", { dir: "/mdSilo" });
    const byId = (id: string) => notes.find((n) => n.id === id);
    expect(byId("/mdSilo/writing/keep.md")?.tags).toEqual(["saved"]);
    expect(byId("/mdSilo/writing/gone.md")).toBeUndefined();
    const search = (query: string) =>
      invoke<Hit[]>("index_search", { query, kind: null, limit: 10 });
    expect((await search("apple")).map((h) => h.path)).toEqual([
      "/mdSilo/writing/keep.md",
    ]);
    expect(await search("old")).toEqual([]);
    expect((await search("new")).length).toBe(1);
    expect(await search("zebra")).toEqual([]);
    // no library file: the book is kept
    expect(await invoke("index_book_indexed", { hash: "h" })).toBe(true);
    expect((await search("whales")).length).toBe(1);
  });

  test("the books gone from the library are out of the saved index", async () => {
    await write(
      "/mdSilo/.mdsilo/books.json",
      JSON.stringify({ books: { h: {} } }),
    );
    await invoke("index_open", { dir: "/mdSilo" });
    await invoke("index_book", {
      hash: "h",
      title: "A Book",
      sections: [{ cfi: "/6/2", label: "One", text: "whales at sea" }],
    });
    await indexSave();
    resetIndexer();
    await write("/mdSilo/.mdsilo/books.json", JSON.stringify({ books: {} }));
    await invoke("index_open", { dir: "/mdSilo" });
    expect(await invoke("index_book_indexed", { hash: "h" })).toBe(false);
    expect(
      await invoke<Hit[]>("index_search", {
        query: "whales",
        kind: null,
        limit: 10,
      }),
    ).toEqual([]);
  });

  test("a saved index of another folder, or broken, is not used", async () => {
    await write("/mdSilo/writing/a.md", "apple");
    await invoke("index_open", { dir: "/mdSilo" });
    await indexSave();
    resetIndexer();
    await put(
      KV,
      { ...(await get<object>(KV, SNAPSHOT_KEY)), search: "{" },
      SNAPSHOT_KEY,
    );
    await invoke("index_open", { dir: "/mdSilo" });
    expect(
      (
        await invoke<Hit[]>("index_search", {
          query: "apple",
          kind: null,
          limit: 10,
        })
      ).length,
    ).toBe(1);
    resetIndexer();
    await write("/other/b.md", "banana");
    await invoke("index_open", { dir: "/other" });
    expect(
      await invoke<Hit[]>("index_search", {
        query: "apple",
        kind: null,
        limit: 10,
      }),
    ).toEqual([]);
  });
});

describe("search engine dump", () => {
  test("loads what it dumped", () => {
    const engine = new SearchEngine();
    engine.put({ id: "a", kind: "note", title: "T", label: "", body: "kiwi" });
    const copy = new SearchEngine();
    expect(copy.load(engine.dump())).toBe(true);
    expect(copy.search("kiwi", undefined, 10).map((h) => h.id)).toEqual(["a"]);
    copy.delete("a");
    expect(copy.search("kiwi", undefined, 10)).toEqual([]);
    expect(copy.load("not json")).toBe(false);
    expect(copy.ids()).toEqual([]);
  });
});
