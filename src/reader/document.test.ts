import { makeEpub } from "./testBook";
import {
  bookFormatOf,
  formatContributors,
  formatLanguageMap,
  isBookFile,
  openBook,
  quietMedia,
  type RangeBook,
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

  test("an EPUB read by parts: only the parts asked, closed with the book", async () => {
    const data = new Uint8Array(await makeEpub().arrayBuffer());
    const reads: number[] = [];
    let closed = 0;
    const range = (bytes: Uint8Array, name: string): RangeBook => ({
      name,
      size: bytes.length,
      read: async (start, len) => {
        reads.push(len);
        return bytes.slice(start, start + len);
      },
      close: async () => {
        closed++;
      },
    });
    const { book, format } = await openBook(range(data, "a.epub"));
    expect(format).toBe("EPUB");
    expect(formatLanguageMap(book.metadata.title)).toBe("Tiny Book");
    const doc = await book.sections[1].createDocument();
    expect(doc.body.textContent).toContain("striking thirteen");
    // never the whole file at once
    expect(Math.max(...reads)).toBeLessThan(data.length);
    expect(closed).toBe(0);
    await book.destroy?.();
    expect(closed).toBe(1);

    // not a book: closed too
    await expect(
      openBook(range(new TextEncoder().encode("just text"), "a.txt")),
    ).rejects.toThrow("Unsupported");
    expect(closed).toBeGreaterThan(1);
  });

  test("a MOBI by parts, an FB2 whole: the file closed once read", async () => {
    const reads: number[] = [];
    let closed = 0;
    const range = (bytes: Uint8Array, name: string): RangeBook => ({
      name,
      size: bytes.length,
      read: async (start, len) => {
        reads.push(len);
        return bytes.slice(start, start + len);
      },
      close: async () => {
        closed++;
      },
    });
    // a MOBI by its signature: its records asked for, never all of it
    const mobi = new Uint8Array(1 << 20);
    mobi.set(new TextEncoder().encode("BOOKMOBI"), 60);
    await expect(openBook(range(mobi, "a.azw3"))).rejects.toThrow();
    expect(reads.length).toBeGreaterThan(0);
    expect(Math.max(...reads)).toBeLessThan(mobi.length);
    expect(closed).toBe(1);

    // an FB2 is XML: read whole, and closed then, before the book is
    const fb2 = new TextEncoder().encode(
      `<?xml version="1.0" encoding="utf-8"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"><description><title-info><book-title>Small</book-title></title-info></description><body><section><p>Hello.</p></section></body></FictionBook>`,
    );
    reads.length = 0;
    const { book, format } = await openBook(range(fb2, "a.fb2"));
    expect(format).toBe("FB2");
    expect(reads).toContain(fb2.length);
    expect(closed).toBe(2);
    await book.destroy?.();
  });

  test("the media of a page not played by itself", async () => {
    expect(
      quietMedia(
        `<p>a</p><video autoplay="" loop="" muted="" preload="auto" src="https://x/v.mp4"><source src="v.webm"/></video>`,
      ),
    ).toBe(
      `<p>a</p><video loop="" muted="" src="https://x/v.mp4" controls="controls" preload="none"><source src="v.webm"/></video>`,
    );
    // its controls kept; an empty element closed as it was; a quoted >
    expect(
      quietMedia(`<audio controls src="a.mp3" title="a > b" autoplay/>`),
    ).toBe(`<audio controls src="a.mp3" title="a > b" preload="none"/>`);
    const page = "<p>no media, autoplay as a word</p>";
    expect(quietMedia(page)).toBe(page);
  });

  test("the pages of a book opened: their media quiet as they load", async () => {
    const { book } = await openBook(makeEpub());
    const target = (book as unknown as { transformTarget: EventTarget })
      .transformTarget;
    const detail = {
      type: "application/xhtml+xml",
      data: Promise.resolve(`<video autoplay="" src="v.mp4"></video>`),
    };
    target.dispatchEvent(new CustomEvent("data", { detail }));
    expect(await detail.data).toBe(
      `<video src="v.mp4" controls="controls" preload="none"></video>`,
    );
    // not a page: as it is
    const css = { type: "text/css", data: "video { autoplay: 1 }" };
    target.dispatchEvent(new CustomEvent("data", { detail: css }));
    expect(await css.data).toBe("video { autoplay: 1 }");
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
