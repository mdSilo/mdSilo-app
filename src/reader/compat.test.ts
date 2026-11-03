import { afterEach, describe, expect, it, vi } from "vitest";
import { applyColorMatrix, getPageColorMatrix } from "foliate-js/pdf.js";

describe("applyColorMatrix: PDF page colors without canvas filters", () => {
  const sepia = { foreground: "#5b4636", background: "#f4ecd8" };
  const hex = (c: string) =>
    [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

  it("maps white paper and black text onto the theme", () => {
    const matrix = getPageColorMatrix(sepia)!;
    const data = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 128]);
    applyColorMatrix(data, matrix);
    expect([...data.slice(0, 3)]).toEqual(hex(sepia.background));
    expect([...data.slice(4, 7)]).toEqual(hex(sepia.foreground));
    // alpha kept
    expect([data[3], data[7]]).toEqual([255, 128]);
  });

  it("keeps a color's chroma: blue stays bluer than gray", () => {
    const matrix = getPageColorMatrix(sepia)!;
    const data = new Uint8ClampedArray([0, 0, 255, 255]);
    applyColorMatrix(data, matrix);
    expect(data[2]).toBeGreaterThan(data[0]);
  });
});

describe("comic book pages in JPEG XL", () => {
  // jsdom has no HTMLImageElement.decode
  const proto = HTMLImageElement.prototype as { decode?: () => Promise<void> };
  const mockDecode = (impl: () => Promise<void>) => {
    const fn = vi.fn(impl);
    Object.defineProperty(proto, "decode", { configurable: true, value: fn });
    return fn;
  };
  afterEach(() => {
    vi.restoreAllMocks();
    delete proto.decode;
  });

  const book = (names: string[]) => ({
    entries: names.map((filename) => ({ filename })),
    loadBlob: async () => new Blob(["x"]),
    getSize: () => 1,
    getComment: async () => null,
  });

  it("shows a note where the browser cannot decode the image", async () => {
    const blobs: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((b) => {
      blobs.push(b as Blob);
      return `blob:${blobs.length}`;
    });
    mockDecode(() => Promise.reject(new Error("unsupported")));
    vi.resetModules();
    const { makeComicBook } = await import("foliate-js/comic-book.js");
    const comic = await makeComicBook(book(["1.jpg", "2.jxl"]), {
      name: "c.cbz",
    });
    await comic.sections[0].load();
    await comic.sections[1].load();
    const [jpg, jxl] = await Promise.all(
      [blobs[1], blobs[3]].map((b) => b.text()),
    );
    expect(jpg).toContain('<img src="blob:1">');
    expect(jxl).not.toContain("<img");
    expect(jxl).toContain("JPEG XL");
  });

  it("shows the image where it decodes", async () => {
    const blobs: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((b) => {
      blobs.push(b as Blob);
      return `blob:${blobs.length}`;
    });
    const decode = mockDecode(() => Promise.resolve());
    vi.resetModules();
    const { makeComicBook } = await import("foliate-js/comic-book.js");
    const comic = await makeComicBook(book(["1.jxl", "2.jxl"]), {
      name: "c.cbz",
    });
    await comic.sections[0].load();
    await comic.sections[1].load();
    expect(await blobs[1].text()).toContain('<img src="blob:1">');
    expect(await blobs[3].text()).toContain('<img src="blob:3">');
    // tried once: once one decodes, the rest are trusted
    expect(decode).toHaveBeenCalledTimes(1);
  });
});
