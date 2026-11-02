import fs from "fs";
import crypto from "crypto";
import { openBook } from "./document";
import {
  sectionCfi,
  sectionLabels,
  textOf,
  MAX_SECTION_TEXT,
} from "./bookIndex";
import { bookMetaOf } from "./library/library";

/**
 * What foliate-js reads of some books, as JSON files: the references Rust
 * reads them by (src-tauri/src/ebook, `reads_books_as_foliate`). Skipped
 * unless BOOKS (their paths, one per line) and BOOK_REFS (the folder to
 * write to) are given:
 *
 *   BOOKS="$(ls ~/books/*.epub)" BOOK_REFS=/tmp/refs pnpm exec vitest run src/reader/foliateRefs.test.ts
 *   MDSILO_BOOK_REFS=/tmp/refs cargo test --lib reads_books_as_foliate -- --ignored
 */
const books = (process.env.BOOKS ?? "").split("\n").filter(Boolean);
const out = process.env.BOOK_REFS ?? "";

describe.skipIf(!books.length || !out)("foliate's reading of books", () => {
  test.each(books)("%s", { timeout: 120_000 }, async (path) => {
    const file = new File([fs.readFileSync(path)], path.split("/").pop()!);
    const { book, format } = await openBook(file);
    const labels = sectionLabels(book);
    const sections = [];
    for (const [i, section] of book.sections.entries()) {
      let text = "";
      if (section.createDocument) {
        try {
          text = textOf(await section.createDocument()).slice(
            0,
            MAX_SECTION_TEXT,
          );
        } catch (e) {
          text = `!error ${e}`;
        }
      }
      sections.push({
        cfi: `${sectionCfi(book, i)}`,
        label: labels.get(i) ?? "",
        text,
      });
    }
    const cover = await book.getCover().catch(() => null);
    const bytes = cover ? Buffer.from(await cover.arrayBuffer()) : null;
    const md5 = (data: Buffer | string) =>
      crypto.createHash("md5").update(data).digest("hex");
    const resources = (book as { resources?: { cover?: { href?: string } } })
      .resources;
    const reference = {
      path,
      format,
      meta: bookMetaOf(book, path),
      // the blob of an EPUB's cover is not its bytes in jsdom: its file
      coverHref: resources?.cover?.href ?? null,
      layout: book.rendition?.layout ?? null,
      cover: bytes ? { size: bytes.length, md5: md5(bytes) } : null,
      sections,
    };
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(
      `${out}/${md5(path).slice(0, 10)}.json`,
      JSON.stringify(reference, null, 1),
    );
  });
});
