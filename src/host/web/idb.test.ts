import "fake-indexeddb/auto";
import { beforeEach, describe, expect, test } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { KV, closeDB, get, openDB, put } from "./idb";

beforeEach(async () => {
  await closeDB();
  globalThis.indexedDB = new IDBFactory();
});

describe("idb", () => {
  test("opens the db again once the browser closed the connection", async () => {
    await put(KV, "a", "k");
    const db = await openDB();
    // what a browser does on its own, e.g. a phone waking up the app
    db.close();
    db.onclose?.(new Event("close"));
    expect(await get(KV, "k")).toBe("a");
    expect(await openDB()).not.toBe(db);
  });

  test("uses a connection that is closed but not told, once", async () => {
    await put(KV, "a", "k");
    (await openDB()).close();
    expect(await get(KV, "k")).toBe("a");
  });
});
