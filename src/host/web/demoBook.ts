/**
 * The book of the demo, fetched when the demo was made (see demo.ts): if that
 * failed (offline, the server restarting), the demo is made without it, and
 * its marker has no `book`. Fetched again on a later start then. A book of the
 * demo you removed is never brought back: the marker has it.
 */
import * as fs from "./fs";
import { DEFAULT_DIR } from "./fs";
import {
  BOOK_FILE,
  DEMO_MARKER,
  langOfNotes,
  loadBook,
  type DemoMarker,
} from "./demo";

const at = (path: string) => `${DEFAULT_DIR}/${path}`;
const LIBRARY = ".mdsilo/books.json";

type Library = { version?: number; books?: Record<string, unknown> };

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readText(at(path))) as T;
  } catch {
    return undefined;
  }
}

/** Add the book of the demo if it could not be fetched before; true if added. */
export async function addMissingDemoBook(): Promise<boolean> {
  if (!(await fs.isFile(at(DEMO_MARKER)))) return false;
  const marker = await readJson<DemoMarker>(DEMO_MARKER);
  if (!marker || marker.book) return false;
  const book = await loadBook(langOfNotes(marker.notes));
  if (!book.hash) return false;
  for (const file of book.files) {
    if (file.path === LIBRARY) {
      // with the books of the library, yours
      const library = (await readJson<Library>(LIBRARY)) ?? { version: 1 };
      const demo = JSON.parse(file.data as string) as Library;
      library.books = { ...demo.books, ...library.books };
      await fs.writeFile(at(LIBRARY), JSON.stringify(library, null, 2));
    } else if (!(await fs.exists(at(file.path)))) {
      await fs.writeFile(at(file.path), file.data);
    }
  }
  marker.book = { hash: book.hash, files: [BOOK_FILE, `${BOOK_FILE}.md`] };
  await fs.writeFile(at(DEMO_MARKER), JSON.stringify(marker));
  return true;
}
