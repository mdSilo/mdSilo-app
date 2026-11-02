import { afterEach, expect, test, vi } from "vitest";
import { enterTauri, leaveTauri, mockInvoke } from "@/testUtils";
import type { ShelfBook } from "./shelf";

afterEach(() => leaveTauri());

test("the metadata and cover of a book read in Rust, not opened here", async () => {
  enterTauri();
  const { invoke } = await import("@tauri-apps/api/core");
  const { readBook } = await import("./hooks");
  const { coverPathOf } = await import("./covers");
  const meta = { title: "Real Title", author: "Jane Doe" };
  mockInvoke(invoke, {
    book_info: { format: "EPUB", meta, cover: true, fixedLayout: false },
  });
  const book = { hash: "h1", path: "/ws/reading/a.epub" } as ShelfBook;
  expect(await readBook("/ws", book)).toEqual({ made: true, meta });
  expect(invoke).toHaveBeenCalledWith("book_info", {
    filePath: "/ws/reading/a.epub",
    coverPath: coverPathOf("/ws", "h1"),
  });
  expect(vi.mocked(invoke).mock.calls.map((c) => c[0])).toEqual(["book_info"]);

  // a cover chosen by the user: none cached
  vi.mocked(invoke).mockClear();
  expect(await readBook("/ws", { ...book, cover: "custom" })).toEqual({
    made: false,
    meta,
  });
  expect(invoke).toHaveBeenCalledWith("book_info", {
    filePath: "/ws/reading/a.epub",
    coverPath: null,
  });
});
