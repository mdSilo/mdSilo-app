import { makeEpub } from "./testBook";
import {
  bookFormatOf,
  formatContributors,
  formatLanguageMap,
  isBookFile,
  openBook,
} from "./document";

describe("book files", () => {
  test("by extension", () => {
    expect(isBookFile("/r/a.EPUB")).toBe(true);
    expect(isBookFile("/r/a.azw3")).toBe(true);
    expect(isBookFile("/r/a.epub.md")).toBe(false);
    expect(isBookFile("/r/epub")).toBe(false);
    expect(bookFormatOf("/r/x.fb2")).toBe("FB2");
  });

  test("metadata values", () => {
    expect(formatLanguageMap({ en: "Title", fr: "Titre" })).toBe("Title");
    expect(formatLanguageMap(undefined)).toBe("");
    expect(
      formatContributors([{ name: "A" }, "B", { name: { en: "C" } }]),
    ).toBe("A, B, C");
  });

  test("opens an EPUB", async () => {
    const { book, format } = await openBook(makeEpub());
    expect(format).toBe("EPUB");
    expect(formatLanguageMap(book.metadata.title)).toBe("Tiny Book");
    expect(formatContributors(book.metadata.author)).toBe("Jane Doe");
    expect(book.sections).toHaveLength(2);
    expect(book.toc?.map((t) => t.label)).toEqual([
      "Chapter One",
      "Chapter Two",
    ]);
    const doc = await book.sections[1].createDocument();
    expect(doc.body.textContent).toContain("striking thirteen");
  });

  test("the text files made books when imported; the icons of the formats", async () => {
    const { convertibleFormatOf } = await import("./document");
    const { bookIconOf } = await import("./components/BookIcon");
    expect(convertibleFormatOf("/r/a.TXT")).toBe("TXT");
    expect(convertibleFormatOf("/r/a.markdown")).toBe("Markdown");
    expect(convertibleFormatOf("/r/a.epub")).toBeUndefined();
    const icons = [
      "a.md",
      "a.epub",
      "a.pdf",
      "a.azw3",
      "a.fb2",
      "a.cbz",
      "a.txt",
      "a.html",
      "a.zip",
    ].map((p) => bookIconOf(p));
    expect(icons.map((i) => i?.label)).toEqual([
      "Markdown",
      "EPUB",
      "PDF",
      "AZW3",
      "FB2",
      "CBZ",
      "TXT",
      "HTML",
      "ZIP",
    ]);
    // each its own
    expect(new Set(icons.map((i) => i?.icon)).size).toBe(icons.length);
    // the images as they are
    expect(bookIconOf("a.png")).toBeUndefined();
  });

  test("refuses what is not a book", async () => {
    await expect(openBook(new File([], "a.epub"))).rejects.toThrow("empty");
    await expect(openBook(new File(["just text"], "a.txt"))).rejects.toThrow(
      "Unsupported",
    );
  });
});

describe("the text of a book for the search", () => {
  test("by sections, labelled by the contents", async () => {
    const { indexBookText, sectionLabels } = await import("./bookIndex");
    const { invoke } = await import("@tauri-apps/api/core");
    const { mockInvoke } = await import("../testUtils");
    const { book } = await openBook(makeEpub());
    expect([...sectionLabels(book)]).toEqual([
      [0, "Chapter One"],
      [1, "Chapter Two"],
    ]);
    mockInvoke(invoke, { index_book_indexed: false, index_book: undefined });
    await indexBookText("h1", "Tiny Book", book);
    const call = vi
      .mocked(invoke)
      .mock.calls.find((c) => c[0] === "index_book");
    expect(call?.[1]).toEqual({
      hash: "h1",
      title: "Tiny Book",
      sections: [
        {
          cfi: expect.stringMatching(/^epubcfi\(\/6\/2/),
          label: "Chapter One",
          text: "Chapter 1 It was a bright cold day in April.",
        },
        {
          cfi: expect.stringMatching(/^epubcfi\(\/6\/4/),
          label: "Chapter Two",
          text: "Chapter 2 The clocks were striking thirteen.",
        },
      ],
    });
    // indexed already: not again
    vi.mocked(invoke).mockClear();
    mockInvoke(invoke, { index_book_indexed: true });
    await indexBookText("h1", "Tiny Book", book);
    expect(
      vi.mocked(invoke).mock.calls.some((c) => c[0] === "index_book"),
    ).toBe(false);
  });

  test("on the desktop, of the file read in Rust; of the book opened if Rust cannot", async () => {
    const { enterTauri, leaveTauri, mockInvoke } = await import("../testUtils");
    enterTauri();
    try {
      const { indexBookText } = await import("./bookIndex");
      const { invoke } = await import("@tauri-apps/api/core");
      const { openBook: open } = await import("./document");
      const { book } = await open(makeEpub());
      const called = (cmd: string) =>
        vi.mocked(invoke).mock.calls.filter((c) => c[0] === cmd);
      mockInvoke(invoke, { book_index_text: true });
      await indexBookText("h1", "Tiny Book", book, true, "/ws/reading/a.epub");
      expect(called("book_index_text")[0][1]).toEqual({
        filePath: "/ws/reading/a.epub",
        hash: "h1",
        title: "Tiny Book",
        force: true,
      });
      expect(called("index_book")).toHaveLength(0);

      // the file not read in Rust: of the book opened
      vi.mocked(invoke).mockClear();
      mockInvoke(invoke, { book_index_text: false, index_book_indexed: false });
      await indexBookText("h1", "Tiny Book", book, false, "/ws/reading/a.epub");
      expect(called("index_book")).toHaveLength(1);
      // a format Rust does not read: not asked
      vi.mocked(invoke).mockClear();
      await indexBookText("h2", "A PDF", undefined, false, "/ws/reading/a.pdf");
      expect(called("book_index_text")).toHaveLength(0);
    } finally {
      leaveTauri();
    }
  });
});
