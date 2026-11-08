import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { confirmBooksSync } from "@/reader/library/library";
import type { ShelfBook } from "@/reader/library/shelf";
import { bigSyncMessage, confirmBigSync, formatSize } from "./syncSize";

const MB = 1024 * 1024;

describe("big files to sync", () => {
  test("sizes", () => {
    expect(formatSize(512)).toBe("1 KB");
    expect(formatSize(3 * MB)).toBe("3 MB");
    expect(formatSize(1536 * MB)).toBe("1.5 GB");
  });

  test("a reminder for files over 50 MB; GitHub's limit over 100 MB", () => {
    expect(bigSyncMessage([{ name: "a", size: 50 * MB }])).toBeUndefined();
    const some = bigSyncMessage([
      { name: "small", size: MB },
      { name: "b", size: 60 * MB },
      { name: "c", size: 80 * MB },
    ])!;
    expect(some).toMatch(/^Big files to sync: c \(80 MB\), b \(60 MB\)\./);
    expect(some).not.toContain("100 MB");
    expect(bigSyncMessage([{ name: "d", size: 101 * MB }])).toContain(
      "GitHub refuses a file over 100 MB",
    );
    const many = bigSyncMessage(
      Array.from({ length: 7 }, (_, i) => ({ name: `x${i}`, size: 60 * MB })),
    );
    expect(many).toContain("and 2 more");
  });

  test("asked only when big", async () => {
    expect(await confirmBigSync([{ name: "a", size: MB }])).toBe(true);
    expect(ask).not.toHaveBeenCalled();
    vi.mocked(ask).mockResolvedValueOnce(true);
    expect(await confirmBigSync([{ name: "a", size: 70 * MB }])).toBe(true);
    vi.mocked(ask).mockResolvedValueOnce(false);
    expect(await confirmBigSync([{ name: "a", size: 70 * MB }])).toBe(false);
  });

  test("books: the files here, not synced yet, by their size", async () => {
    const sizes: Record<string, number> = {
      "/ws/reading/big.pdf": 300 * MB,
      "/ws/reading/small.epub": MB,
    };
    vi.mocked(invoke).mockImplementation(async (cmd, args) =>
      cmd === "get_file_meta"
        ? { size: sizes[(args as { filePath: string }).filePath] }
        : undefined,
    );
    const book = (title: string, path: string, more: Partial<ShelfBook> = {}) =>
      ({ hash: title, title, path, here: true, ...more }) as ShelfBook;
    vi.mocked(ask).mockResolvedValueOnce(false);
    expect(
      await confirmBooksSync([
        book("Big", "/ws/reading/big.pdf"),
        book("Small", "/ws/reading/small.epub"),
      ]),
    ).toBe(false);
    expect(vi.mocked(ask).mock.calls[0][0]).toMatch(
      /^Big files to sync: Big \(300 MB\)\./,
    );
    // synced already, or not here: not asked
    expect(
      await confirmBooksSync([
        book("Big", "/ws/reading/big.pdf", { synced: true }),
        book("Elsewhere", "/ws/reading/big.pdf", { here: false }),
      ]),
    ).toBe(true);
    expect(ask).toHaveBeenCalledTimes(1);
  });
});
