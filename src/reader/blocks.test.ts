import { blocksOf, readBlocks, type BlockReader } from "./blocks";
import type { BookDoc } from "./document";

const html = (body: string) =>
  new DOMParser().parseFromString(
    `<html><body>${body}</body></html>`,
    "text/html",
  );

/** a book of sections; a CFI is the section and the text of the block */
function bookOf(sections: (string | null)[], linear?: (string | undefined)[]) {
  const reader: BlockReader = {
    book: {
      sections: sections.map((body, i) => ({
        id: `s${i}`,
        linear: linear?.[i],
        createDocument: async () => html(body ?? ""),
      })),
    } as unknown as BookDoc,
    getCFI: (index, range) =>
      range
        ? `epubcfi(/6/${index}!${range.toString().replace(/\s+/g, " ").trim()})`
        : `epubcfi(/6/${index})`,
    // "epubcfi(/6/<index>!<text of the block>)": the block of that text
    resolveNavigation: (cfi) => {
      const m = /^epubcfi\(\/6\/(\d+)(?:!(.*))?\)$/.exec(cfi);
      if (!m) return undefined;
      const text = m[2];
      return {
        index: Number(m[1]),
        anchor: text
          ? (doc: Document) =>
              blocksOf(doc).find((el) => el.textContent?.includes(text)) ?? null
          : undefined,
      };
    },
  };
  return reader;
}

describe("blocksOf", () => {
  it("finds the blocks with text and no block in them", () => {
    const doc = html(`
      <div class="chapter">
        <h1>One</h1>
        <p>First <em>words</em>.</p>
        <div><p>In a div</p></div>
        <ul><li>an item</li><li>  </li></ul>
        <div>A div of text</div>
        <p>Line<br/>break</p>
        <p><ruby>漢<rt>kan</rt></ruby>字</p>
      </div>`);
    expect(blocksOf(doc).map((el) => el.localName)).toEqual([
      "h1",
      "p",
      "p",
      "li",
      "div",
      "p",
      "p",
    ]);
  });
});

describe("readBlocks", () => {
  const book = bookOf([
    "<h1>One</h1><p>a</p><p>b</p>",
    null,
    "<p>c</p><p>d   e</p>",
  ]);

  it("reads from a place on, across sections, and says where to go on", async () => {
    const { blocks, next } = await readBlocks(book, "epubcfi(/6/0!a)", 2);
    expect(blocks).toEqual([
      { cfi: "epubcfi(/6/0!a)", text: "a" },
      { cfi: "epubcfi(/6/0!b)", text: "b" },
    ]);
    expect(next).toBe("epubcfi(/6/2!c)");
    const more = await readBlocks(book, next!, 5);
    expect(more.blocks.map((b) => b.text)).toEqual(["c", "d e"]);
    // the end of the book: nowhere to go on
    expect(more.next).toBeUndefined();
  });

  it("from the start of a section, without a place in it", async () => {
    const { blocks } = await readBlocks(book, "epubcfi(/6/0)", 1);
    expect(blocks).toEqual([{ cfi: "epubcfi(/6/0!One)", text: "One" }]);
  });

  it("skips the sections out of the reading order", async () => {
    const out = bookOf(
      ["<p>a</p>", "<p>notes</p>", "<p>b</p>"],
      [undefined, "no"],
    );
    const { blocks } = await readBlocks(out, "epubcfi(/6/0)", 10);
    expect(blocks.map((b) => b.text)).toEqual(["a", "b"]);
  });

  it("gives 500 at most, and refuses a place not in the book", async () => {
    const big = bookOf([
      Array.from({ length: 600 }, (_, i) => `<p>p${i}</p>`).join(""),
    ]);
    const { blocks, next } = await readBlocks(big, "epubcfi(/6/0)", 10_000);
    expect(blocks).toHaveLength(500);
    expect(next).toBe("epubcfi(/6/0!p500)");
    await expect(readBlocks(big, "nowhere", 1)).rejects.toThrow(
      "Not a place in the book: nowhere",
    );
  });
});
