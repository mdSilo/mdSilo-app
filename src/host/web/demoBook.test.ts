import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { vi } from "vitest";
import { closeDB } from "./idb";
import * as fs from "./fs";
import { DEFAULT_DIR, resetFsInit } from "./fs";
import { BOOK_FILE, loadDemo } from "./demo";
import { addMissingDemoBook } from "./demoBook";

const at = (path: string) => `${DEFAULT_DIR}/${path}`;
const json = async (path: string) => JSON.parse(await fs.readText(at(path)));

const online = () =>
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob([new Uint8Array(3000).fill(7)]),
    }),
  );
const offline = () =>
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

/** the demo as made on the first run */
async function install() {
  for (const file of await loadDemo("en"))
    await fs.writeFile(at(file.path), file.data);
}

beforeEach(async () => {
  await closeDB();
  resetFsInit();
  globalThis.indexedDB = new IDBFactory();
});
afterEach(() => vi.unstubAllGlobals());

describe("the book of the demo, not fetched when the demo was made", () => {
  it("is added on a later start, with the books of the library kept", async () => {
    offline();
    await install();
    expect(await fs.exists(at(BOOK_FILE))).toBe(false);
    expect((await json(".mdsilo/local/demo.json")).book).toBeUndefined();
    // a book of yours meanwhile
    await fs.writeFile(
      at(".mdsilo/books.json"),
      JSON.stringify({ version: 1, books: { mine: { title: "Mine" } } }),
    );
    // still offline: tried again next time
    expect(await addMissingDemoBook()).toBe(false);

    online();
    expect(await addMissingDemoBook()).toBe(true);
    expect(await fs.exists(at(BOOK_FILE))).toBe(true);
    expect(await fs.exists(at(`${BOOK_FILE}.md`))).toBe(true);
    const marker = await json(".mdsilo/local/demo.json");
    expect(marker.book.files).toEqual([BOOK_FILE, `${BOOK_FILE}.md`]);
    const books = (await json(".mdsilo/books.json")).books;
    expect(Object.keys(books)).toEqual(
      expect.arrayContaining(["mine", marker.book.hash]),
    );
    // once only
    expect(await addMissingDemoBook()).toBe(false);
  });

  it("is never brought back once removed by you", async () => {
    online();
    await install();
    await fs.remove([at(BOOK_FILE)]);
    expect(await addMissingDemoBook()).toBe(false);
    expect(await fs.exists(at(BOOK_FILE))).toBe(false);
  });

  it("nothing without a demo", async () => {
    online();
    expect(await addMissingDemoBook()).toBe(false);
  });
});
