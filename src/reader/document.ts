/**
 * Open e-book files with foliate-js (packages/foliate-js), adapted from the
 * DocumentLoader of readup: EPUB, PDF, MOBI/AZW/AZW3, FB2/FBZ and CBZ.
 */

export type BookFormat = 'EPUB' | 'PDF' | 'MOBI' | 'AZW' | 'AZW3' | 'CBZ' | 'FB2' | 'FBZ';

/** The extensions of the book files, lower case, by format. */
export const BOOK_EXTS: Record<string, BookFormat> = {
  epub: 'EPUB',
  pdf: 'PDF',
  mobi: 'MOBI',
  azw: 'AZW',
  azw3: 'AZW3',
  cbz: 'CBZ',
  fb2: 'FB2',
  fbz: 'FBZ',
};

const extOf = (path: string) => {
  const name = path.split(/[\\/]/).pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
};

/** A book file to read, by its extension. */
export const isBookFile = (path: string) => extOf(path) in BOOK_EXTS;

export const bookFormatOf = (path: string): BookFormat | undefined => BOOK_EXTS[extOf(path)];

/** The text files made books when imported: converted to EPUB, see convert/. */
export type TextFormat = 'TXT' | 'Markdown' | 'HTML' | 'ZIP';

export const CONVERTIBLE_EXTS: Record<string, TextFormat> = {
  txt: 'TXT',
  md: 'Markdown',
  markdown: 'Markdown',
  html: 'HTML',
  htm: 'HTML',
  xhtml: 'HTML',
  zip: 'ZIP',
};

/** A file converted to a book when imported, by its extension. */
export const convertibleFormatOf = (path: string): TextFormat | undefined => CONVERTIBLE_EXTS[extOf(path)];

export type LanguageMap = Record<string, string>;
export type Contributor = string | { name?: string | LanguageMap } | Contributor[];

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
  createDocument: () => Promise<Document>;
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
  rendition?: { layout?: 'pre-paginated' | 'reflowable'; spread?: string };
  dir?: string;
  toc?: TOCItem[];
  sections: SectionItem[];
  splitTOCHref?(href: string): Array<string | number>;
  getCover(): Promise<Blob | null>;
  destroy?(): void | Promise<void>;
}

// where packages/foliate-js/pdf.js loads the files of pdf.js, served by the
// pdfjsVendor plugin of vite.config.mts
(globalThis as { FOLIATE_PDFJS_BASE?: string }).FOLIATE_PDFJS_BASE =
  `${import.meta.env.BASE_URL ?? '/'}vendor/pdfjs/`;

type ZipEntry = {
  filename: string;
  directory?: boolean;
  uncompressedSize: number;
  getData?: (writer: unknown) => Promise<string | Blob>;
};

const formatOfMobi = (name: string): BookFormat => {
  const ext = extOf(name);
  return ext === 'azw' ? 'AZW' : ext === 'azw3' ? 'AZW3' : 'MOBI';
};

async function isZip(file: Blob) {
  const arr = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  // PK\x03, some writers get the 4th byte wrong; else the end of the
  // central directory, PK\x05\x06, in the tail (leading bytes mangled)
  if (arr[0] === 0x50 && arr[1] === 0x4b && arr[2] === 0x03) return true;
  const size = Math.min(1024 * 64 + 22, file.size);
  if (size < 22) return false;
  const tail = new Uint8Array(await file.slice(file.size - size).arrayBuffer());
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) {
      return true;
    }
  }
  return false;
}

async function isPDF(file: Blob) {
  const arr = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return arr[0] === 0x25 && arr[1] === 0x50 && arr[2] === 0x44 && arr[3] === 0x46 && arr[4] === 0x2d;
}

async function makeZipLoader(file: File) {
  const zip = await import('foliate-js/vendor/zip.js');
  zip.configure({ useWebWorkers: false });
  const reader = new zip.ZipReader(new zip.BlobReader(file));
  const entries = (await reader.getEntries()) as ZipEntry[];
  const map = new Map(entries.map((entry) => [entry.filename, entry]));
  // some books refer to their files in another case
  const lower = new Map<string, ZipEntry | null>();
  for (const entry of entries) {
    const key = entry.filename.toLowerCase();
    const existing = lower.get(key);
    lower.set(key, existing && existing.filename !== entry.filename ? null : entry);
  }
  const getEntry = (name: string) => map.get(name) ?? lower.get(name.toLowerCase()) ?? null;
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
    const size = Math.min(1024 * 64, file.size);
    const tail = new Uint8Array(await file.slice(file.size - size).arrayBuffer());
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) {
        const length = tail[i + 20] + (tail[i + 21] << 8);
        return new TextDecoder().decode(tail.slice(i + 22, i + 22 + length));
      }
    }
    return null;
  };
  return { entries, loadText, loadBlob, getSize, getComment, sha1: undefined };
}

/** Open a book file, by its content (its name for the zip based formats). */
export async function openBook(file: File): Promise<{ book: BookDoc; format: BookFormat }> {
  if (!file.size) throw new Error('The book file is empty');
  const name = file.name.toLowerCase();
  if (await isZip(file)) {
    const loader = await makeZipLoader(file);
    if (name.endsWith('.cbz') || file.type === 'application/vnd.comicbook+zip') {
      const { makeComicBook } = await import('foliate-js/comic-book.js');
      return { book: (await makeComicBook(loader, file)) as unknown as BookDoc, format: 'CBZ' };
    }
    if (name.endsWith('.fbz') || name.endsWith('.fb2.zip') || name.endsWith('.fb.zip')) {
      const entry = loader.entries.find((e) => e.filename.endsWith('.fb2')) ?? loader.entries[0];
      const blob = await loader.loadBlob(entry.filename);
      const { makeFB2 } = await import('foliate-js/fb2.js');
      return { book: (await makeFB2(blob)) as unknown as BookDoc, format: 'FBZ' };
    }
    const { EPUB } = await import('foliate-js/epub.js');
    return { book: (await new EPUB(loader).init()) as unknown as BookDoc, format: 'EPUB' };
  }
  if (await isPDF(file)) {
    const { makePDF } = await import('foliate-js/pdf.js');
    return { book: (await makePDF(file)) as unknown as BookDoc, format: 'PDF' };
  }
  const mobi = await import('foliate-js/mobi.js');
  if (await mobi.isMOBI(file)) {
    const fflate = await import('foliate-js/vendor/fflate.js');
    const book = await new mobi.MOBI({ unzlib: fflate.unzlibSync }).open(file);
    return { book: book as unknown as BookDoc, format: formatOfMobi(name) };
  }
  if (name.endsWith('.fb2') || file.type === 'application/x-fictionbook+xml') {
    const { makeFB2 } = await import('foliate-js/fb2.js');
    return { book: (await makeFB2(file)) as unknown as BookDoc, format: 'FB2' };
  }
  throw new Error('Unsupported book format');
}

/** A string of a value in several languages: the first one. */
export function formatLanguageMap(value: string | LanguageMap | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  const keys = Object.keys(value);
  return keys.length ? value[keys[0]] : '';
}

/** The names of the contributors, comma separated. */
export function formatContributors(value: Contributor | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(formatContributors).filter(Boolean).join(', ');
  return formatLanguageMap(value.name);
}

/** The direction of a section: vertical writing, right to left. */
export function getDirection(doc: Document) {
  const view = doc.defaultView;
  if (!view || !doc.body) return { vertical: false, rtl: false };
  const { writingMode, direction } = view.getComputedStyle(doc.body);
  const vertical = writingMode === 'vertical-rl' || writingMode === 'vertical-lr';
  const rtl = writingMode === 'vertical-rl' || direction === 'rtl' || doc.body.dir === 'rtl'
    || doc.documentElement.dir === 'rtl';
  return { vertical, rtl };
}
