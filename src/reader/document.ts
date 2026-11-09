/**
 * Open e-book files with foliate-js (packages/foliate-js), adapted from the
 * DocumentLoader of reader: EPUB, PDF, MOBI/AZW/AZW3, FB2/FBZ and CBZ.
 */

export type BookFormat =
  "EPUB" | "PDF" | "MOBI" | "AZW" | "AZW3" | "CBZ" | "FB2" | "FBZ";

/** The extensions of the book files, lower case, by format. */
export const BOOK_EXTS: Record<string, BookFormat> = {
  epub: "EPUB",
  pdf: "PDF",
  mobi: "MOBI",
  azw: "AZW",
  azw3: "AZW3",
  cbz: "CBZ",
  fb2: "FB2",
  fbz: "FBZ",
};

const extOf = (path: string) => {
  const name = path.split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

/** A book file to read, by its extension. */
export const isBookFile = (path: string) => extOf(path) in BOOK_EXTS;

export const bookFormatOf = (path: string): BookFormat | undefined =>
  BOOK_EXTS[extOf(path)];

/** The text files made books when imported: converted to EPUB, see convert/. */
export type TextFormat = "TXT" | "Markdown" | "HTML" | "ZIP";

export const CONVERTIBLE_EXTS: Record<string, TextFormat> = {
  txt: "TXT",
  md: "Markdown",
  markdown: "Markdown",
  html: "HTML",
  htm: "HTML",
  xhtml: "HTML",
  zip: "ZIP",
};

/** A file converted to a book when imported, by its extension. */
export const convertibleFormatOf = (path: string): TextFormat | undefined =>
  CONVERTIBLE_EXTS[extOf(path)];

export type LanguageMap = Record<string, string>;
export type Contributor =
  string | { name?: string | LanguageMap } | Contributor[];

export interface TOCItem {
  id?: number;
  label: string;
  href: string;
  subitems?: TOCItem[];
}

export interface SectionItem {
  id: string;
  cfi?: string;
  size: number;
  linear?: string;
  /** a fixed layout: the side of a spread the page is on; '' as the layout goes */
  pageSpread?: "left" | "right" | "center" | "";
  createDocument: () => Promise<Document>;
  /** the page as shown: a URL of it, its images and styles as blob: URLs */
  load?: () => string | Promise<string>;
}

export interface BookMetadata {
  title?: string | LanguageMap;
  author?: Contributor;
  language?: string | string[];
  publisher?: string;
  published?: string;
  description?: string;
  identifier?: string;
}

export interface BookDoc {
  metadata: BookMetadata;
  rendition?: { layout?: "pre-paginated" | "reflowable"; spread?: string };
  dir?: string;
  toc?: TOCItem[];
  sections: SectionItem[];
  splitTOCHref?(href: string): Array<string | number>;
  /** a link in the book: its section, and the element it goes to there */
  resolveHref?(
    href: string,
  ):
    | { index: number; anchor?: (doc: Document) => Element | null }
    | undefined
    | Promise<
        | { index: number; anchor?: (doc: Document) => Element | null }
        | undefined
      >;
  isExternal?(href: string): boolean;
  getCover(): Promise<Blob | null>;
  destroy?(): void | Promise<void>;
}

// where packages/foliate-js/pdf.js loads the files of pdf.js, served by the
// pdfjsVendor plugin of vite.config.mts
(globalThis as { FOLIATE_PDFJS_BASE?: string }).FOLIATE_PDFJS_BASE =
  `${import.meta.env.BASE_URL ?? "/"}vendor/pdfjs/`;

type ZipEntry = {
  filename: string;
  directory?: boolean;
  uncompressedSize: number;
  getData?: (writer: unknown) => Promise<string | Blob>;
};

const formatOfMobi = (name: string): BookFormat => {
  const ext = extOf(name);
  return ext === "azw" ? "AZW" : ext === "azw3" ? "AZW3" : "MOBI";
};

/**
 * A book file read by parts, as the reader asks: a big book (a feed book of
 * many images) not all of it in memory. Closed with the book (its destroy).
 */
export interface RangeBook {
  name: string;
  size: number;
  /** `len` bytes from `start`, fewer at the end */
  read(start: number, len: number): Promise<Uint8Array>;
  close(): Promise<void>;
}

type Bytes = Pick<RangeBook, "size" | "read">;

const bytesOf = (file: File | RangeBook): Bytes =>
  file instanceof Blob
    ? {
        size: file.size,
        read: async (start, len) =>
          new Uint8Array(await file.slice(start, start + len).arrayBuffer()),
      }
    : file;

/**
 * A file by parts as a Blob is to the readers of foliate-js that read by
 * parts (pdf.js, MOBI): its size, and the bytes of a slice.
 */
function sliceable(file: RangeBook) {
  return {
    name: file.name,
    size: file.size,
    type: "",
    slice: (start = 0, end = file.size) => ({
      arrayBuffer: async () => {
        const bytes = await file.read(start, Math.max(0, end - start));
        return bytes.byteOffset === 0 &&
          bytes.byteLength === bytes.buffer.byteLength
          ? (bytes.buffer as ArrayBuffer)
          : (bytes.slice().buffer as ArrayBuffer);
      },
    }),
  } as unknown as File;
}

async function isZip(file: Bytes) {
  const arr = await file.read(0, 4);
  // PK\x03, some writers get the 4th byte wrong; else the end of the
  // central directory, PK\x05\x06, in the tail (leading bytes mangled)
  if (arr[0] === 0x50 && arr[1] === 0x4b && arr[2] === 0x03) return true;
  const size = Math.min(1024 * 64 + 22, file.size);
  if (size < 22) return false;
  const tail = await file.read(file.size - size, size);
  for (let i = tail.length - 22; i >= 0; i--) {
    if (
      tail[i] === 0x50 &&
      tail[i + 1] === 0x4b &&
      tail[i + 2] === 0x05 &&
      tail[i + 3] === 0x06
    ) {
      return true;
    }
  }
  return false;
}

async function isPDF(file: Bytes) {
  const arr = await file.read(0, 5);
  return (
    arr[0] === 0x25 &&
    arr[1] === 0x50 &&
    arr[2] === 0x44 &&
    arr[3] === 0x46 &&
    arr[4] === 0x2d
  );
}

/**
 * A reader of zip.js of a file by parts: of its Reader (not exported, the
 * parent of BlobReader), which makes the streams of the entries of
 * readUint8Array.
 */
function rangeReader(zip: { BlobReader: unknown }, file: RangeBook): object {
  type Reader = {
    size: number;
    readUint8Array(offset: number, length: number): Promise<Uint8Array>;
  };
  const Base = Object.getPrototypeOf(zip.BlobReader) as new () => Reader;
  class RangeReader extends Base {
    constructor() {
      super();
      this.size = file.size;
    }
    readUint8Array(offset: number, length: number) {
      return file.read(offset, length);
    }
  }
  return new RangeReader();
}

async function makeZipLoader(file: File | RangeBook) {
  const zip = await import("foliate-js/vendor/zip.js");
  zip.configure({ useWebWorkers: false });
  const bytes = bytesOf(file);
  const reader = new zip.ZipReader(
    file instanceof Blob ? new zip.BlobReader(file) : rangeReader(zip, file),
  );
  const entries = (await reader.getEntries()) as ZipEntry[];
  const map = new Map(entries.map((entry) => [entry.filename, entry]));
  // some books refer to their files in another case
  const lower = new Map<string, ZipEntry | null>();
  for (const entry of entries) {
    const key = entry.filename.toLowerCase();
    const existing = lower.get(key);
    lower.set(
      key,
      existing && existing.filename !== entry.filename ? null : entry,
    );
  }
  const getEntry = (name: string) =>
    map.get(name) ?? lower.get(name.toLowerCase()) ?? null;
  const loadText = (name: string) => {
    const entry = getEntry(name);
    return entry && !entry.directory && entry.getData
      ? (entry.getData(new zip.TextWriter()) as Promise<string>)
      : null;
  };
  const loadBlob = (name: string, type?: string) => {
    const entry = getEntry(name);
    return entry && !entry.directory && entry.getData
      ? (entry.getData(new zip.BlobWriter(type)) as Promise<Blob>)
      : null;
  };
  const getSize = (name: string) => getEntry(name)?.uncompressedSize ?? 0;
  // the comment of the archive, comic books keep metadata there
  const getComment = async () => {
    const size = Math.min(1024 * 64, bytes.size);
    const tail = await bytes.read(bytes.size - size, size);
    for (let i = tail.length - 22; i >= 0; i--) {
      if (
        tail[i] === 0x50 &&
        tail[i + 1] === 0x4b &&
        tail[i + 2] === 0x05 &&
        tail[i + 3] === 0x06
      ) {
        const length = tail[i + 20] + (tail[i + 21] << 8);
        return new TextDecoder().decode(tail.slice(i + 22, i + 22 + length));
      }
    }
    return null;
  };
  return { entries, loadText, loadBlob, getSize, getComment, sha1: undefined };
}

/**
 * The media of a page not played by itself: no autoplay, nothing loaded
 * before it is played, controls to play it. A feed book keeps a site's
 * videos (an article of eight looping videos from the web): played as the
 * page shows, the webview fetches and decodes them all at once, a section
 * takes seconds of all the CPU, the window may freeze.
 */
export function quietMedia(markup: string): string {
  if (!/<(video|audio)\b/i.test(markup)) return markup;
  return markup.replace(
    /<(video|audio)\b((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/gi,
    (_, tag: string, attrs: string, slash: string) => {
      let rest = attrs.replace(
        /\s(?:autoplay|preload)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>/]+))?/gi,
        "",
      );
      if (!/\scontrols\b/i.test(rest)) rest += ' controls="controls"';
      return `<${tag}${rest} preload="none"${slash}>`;
    },
  );
}

/** The pages of the book, as they load, with their media quiet (quietMedia). */
function quietMediaOf(book: BookDoc) {
  const target = (book as { transformTarget?: EventTarget }).transformTarget;
  target?.addEventListener("data", (e) => {
    const detail = (e as CustomEvent<{ data: unknown; type: string }>).detail;
    if (!/html/i.test(String(detail.type ?? ""))) return;
    detail.data = Promise.resolve(detail.data).then((data) =>
      typeof data === "string" ? quietMedia(data) : data,
    );
  });
}

/** The book closing the file read by parts too, with it. */
function closingWith<T extends { destroy?(): void | Promise<void> }>(
  book: T,
  file: File | RangeBook,
): T {
  if (file instanceof Blob) return book;
  const destroy = book.destroy?.bind(book);
  book.destroy = async () => {
    try {
      await destroy?.();
    } finally {
      await file.close();
    }
  };
  return book;
}

/**
 * Open a book file, by its content (its name for the zip based formats). A
 * zip based one (EPUB, CBZ) by parts if a RangeBook: the others read whole.
 */
export async function openBook(
  file: File | RangeBook,
): Promise<{ book: BookDoc; format: BookFormat }> {
  try {
    const opened = await openOf(file);
    quietMediaOf(opened.book);
    return { ...opened, book: closingWith(opened.book, file) };
  } catch (e) {
    if (!(file instanceof Blob)) await file.close();
    throw e;
  }
}

async function openOf(
  source: File | RangeBook,
): Promise<{ book: BookDoc; format: BookFormat }> {
  if (!source.size) throw new Error("The book file is empty");
  const name = source.name.toLowerCase();
  const type = source instanceof Blob ? source.type : "";
  if (await isZip(bytesOf(source))) {
    const loader = await makeZipLoader(source);
    if (name.endsWith(".cbz") || type === "application/vnd.comicbook+zip") {
      const { makeComicBook } = await import("foliate-js/comic-book.js");
      const file = source instanceof Blob ? source : new File([], source.name);
      return {
        book: (await makeComicBook(loader, file)) as unknown as BookDoc,
        format: "CBZ",
      };
    }
    if (
      name.endsWith(".fbz") ||
      name.endsWith(".fb2.zip") ||
      name.endsWith(".fb.zip")
    ) {
      const entry =
        loader.entries.find((e) => e.filename.endsWith(".fb2")) ??
        loader.entries[0];
      const blob = await loader.loadBlob(entry.filename);
      const { makeFB2 } = await import("foliate-js/fb2.js");
      return {
        book: (await makeFB2(blob)) as unknown as BookDoc,
        format: "FBZ",
      };
    }
    const { EPUB } = await import("foliate-js/epub.js");
    return {
      book: (await new EPUB(loader).init()) as unknown as BookDoc,
      format: "EPUB",
    };
  }
  // a PDF and a MOBI by parts too: pdf.js asks for ranges, a MOBI for its
  // records, of `size` and `slice` only
  const parts = source instanceof Blob ? source : sliceable(source);
  if (await isPDF(bytesOf(source))) {
    const { makePDF } = await import("foliate-js/pdf.js");
    return {
      book: (await makePDF(parts)) as unknown as BookDoc,
      format: "PDF",
    };
  }
  const mobi = await import("foliate-js/mobi.js");
  if (await mobi.isMOBI(parts)) {
    const fflate = await import("foliate-js/vendor/fflate.js");
    const book = await new mobi.MOBI({ unzlib: fflate.unzlibSync }).open(parts);
    return { book: book as unknown as BookDoc, format: formatOfMobi(name) };
  }
  if (name.endsWith(".fb2") || type === "application/x-fictionbook+xml") {
    // XML: read whole, the file by parts closed then
    let file: File;
    if (source instanceof Blob) {
      file = source;
    } else {
      const data = await source.read(0, source.size);
      await source.close();
      file = new File([data as BlobPart], source.name);
    }
    const { makeFB2 } = await import("foliate-js/fb2.js");
    return { book: (await makeFB2(file)) as unknown as BookDoc, format: "FB2" };
  }
  throw new Error("Unsupported book format");
}

/** A string of a value in several languages: the first one. */
export function formatLanguageMap(
  value: string | LanguageMap | undefined,
): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  const keys = Object.keys(value);
  return keys.length ? value[keys[0]] : "";
}

/** The names of the contributors, comma separated. */
export function formatContributors(value: Contributor | undefined): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value))
    return value.map(formatContributors).filter(Boolean).join(", ");
  return formatLanguageMap(value.name);
}

/** The direction of a section: vertical writing, right to left. */
export function getDirection(doc: Document) {
  const view = doc.defaultView;
  if (!view || !doc.body) return { vertical: false, rtl: false };
  const { direction } = view.getComputedStyle(doc.body);
  let { writingMode } = view.getComputedStyle(doc.body);
  // some books set it on the first child of the body
  if (!writingMode || writingMode === "horizontal-tb") {
    const child = doc.body.firstElementChild;
    const childMode = child ? view.getComputedStyle(child).writingMode : "";
    if (childMode === "vertical-rl" || childMode === "vertical-lr")
      writingMode = childMode;
  }
  const vertical =
    writingMode === "vertical-rl" || writingMode === "vertical-lr";
  const rtl =
    writingMode === "vertical-rl" ||
    direction === "rtl" ||
    doc.body.dir === "rtl" ||
    doc.documentElement.dir === "rtl";
  return { vertical, rtl };
}
