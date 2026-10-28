import { convertibleFormatOf } from '../document';
import { buildEpub, relativePath, type EpubChapter, type EpubResource } from './epub';
import { bodyOfHtml, chaptersOfHtml, cleanHtml, frontMatterOf, metaOfHtml } from './html';
import { decodeText, guessLanguage, paragraphsOf, textBody, txtToBook } from './text';
import type { TxtRequest, TxtResponse } from './txtWorker';

/**
 * Text files imported as books: converted to an EPUB once, at import, so the
 * library, the sync and the annotations take them as any book. The file
 * imported is left as it is.
 *
 *   TXT        its chapters by their headings
 *   Markdown   rendered as the notes are, split at its headings
 *   HTML       cleaned, split at its headings
 *   ZIP        a book in it as it is (EPUB, FB2, comic); else its pages
 *              (HTML, Markdown, TXT) in order, with their images
 *
 * The files converted, by their extensions: CONVERTIBLE_EXTS in document.ts.
 */

const stemOf = (name: string) => (name.split(/[\\/]/).pop() ?? name).replace(/\.[^.]+$/, '');

/** The book of a file imported: its name and bytes. */
export type ConvertedBook = { name: string; data: Uint8Array };

/** A file imported from the device: its local images read into its book. */
export type ConvertOptions = {
  /** the file, on the device */
  path: string;
  /** where `./` paths of the notes are, e.g. writing/ of the workspace; then the folder of the file */
  notesRoots?: string[];
  /** the bytes of a file, undefined if it can't be read */
  readFile: (path: string) => Promise<Uint8Array | undefined>;
};

/**
 * The book of a text file, or a zip: an EPUB, or the book in the zip. From a
 * path (`options`), the local images of a Markdown or HTML file in its book.
 */
export async function convertToBook(name: string, data: Uint8Array, options?: ConvertOptions): Promise<ConvertedBook> {
  const format = convertibleFormatOf(name);
  const stem = stemOf(name);
  if (format === 'ZIP') return zipToBook(stem, data);
  if (format === 'TXT') return { name: `${stem}.epub`, data: await txtInWorker(name, data) };
  const epub = await pageToEpub(stem, decodeText(data), format === 'Markdown', options);
  return { name: `${stem}.epub`, data: await buildEpub(epub) };
}

/**
 * A TXT made a book in a worker, the page responsive meanwhile (a novel of
 * some MB takes a second or so); in the page where there are no workers.
 */
async function txtInWorker(name: string, data: Uint8Array): Promise<Uint8Array> {
  if (typeof Worker === 'undefined' || typeof window === 'undefined' || import.meta.env?.VITEST) return txtToBook(name, data);
  let worker: Worker;
  try {
    worker = new Worker(new URL('./txtWorker.ts', import.meta.url), { type: 'module' });
  } catch (e) {
    console.warn('No worker to convert the text, in the page then', e);
    return txtToBook(name, data);
  }
  try {
    return await new Promise<Uint8Array>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<TxtResponse>) => ('data' in e.data ? resolve(e.data.data) : reject(new Error(e.data.error)));
      worker.onerror = (e) => reject(new Error(e.message));
      worker.postMessage({ name, data } satisfies TxtRequest);
    });
  } finally {
    worker.terminate();
  }
}

const renderMarkdown = async (text: string) => (await import('mdsmirror')).renderToHtml(text);

async function pageToEpub(stem: string, text: string, markdown: boolean, options?: ConvertOptions) {
  const { fields, body } = markdown ? frontMatterOf(text) : { fields: {} as Record<string, string>, body: text };
  const doc = cleanHtml(markdown ? await renderMarkdown(body) : body);
  const resources = options ? await localMedia(doc, options) : [];
  const meta = metaOfHtml(doc);
  // the name of a note is its title, unless its front matter says
  const title = fields.title || (markdown ? stem : meta.title) || stem;
  const { chapters, toc } = chaptersOfHtml(doc, title);
  return {
    title,
    author: fields.author ?? meta.author,
    language: fields.lang ?? fields.language ?? meta.language ?? guessLanguage(doc.body.textContent ?? ''),
    chapters,
    toc,
    resources,
  };
}

// e.g. `https:`, `data:`, `//host`, `#id`: not a file on the device
const NOT_LOCAL = /^([a-z][\w+.-]*:|\/\/|#)/i;
// `/home/me/a.png`, `C:\me\a.png`, `C:/me/a.png`
const ABSOLUTE = /^(\/(?!\/)|[a-z]:[\\/])/i;

/** A relative path joined onto a dir, `.` and `..` resolved, `/` separated; the root kept. */
export function joinRelative(dir: string, rel: string) {
  const out: string[] = [];
  for (const part of `${dir}/${rel}`.replace(/\\/g, '/').split('/')) {
    if (part === '..') {
      if (out.length > 1) out.pop();
    } else if (part !== '.' && (part !== '' || out.length === 0)) out.push(part);
  }
  return out.join('/');
}

const safeDecode = (s: string) => {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
};

/**
 * The images (and audio, video) of a page on the device, read into the book:
 * as the notes resolve them, `./a.png` in the root of the notes, `a.png` and
 * `../a.png` from the folder of the page, `/home/me/a.png` as it is. Those
 * not found left as they are.
 */
async function localMedia(doc: Document, { path, notesRoots = [], readFile }: ConvertOptions): Promise<EpubResource[]> {
  const dir = path.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
  const resources: EpubResource[] = [];
  // a file in the book once, wherever it shows
  const inBook = new Map<string, string>();
  const read = async (file: string) => {
    if (inBook.has(file)) return inBook.get(file);
    const data = await readFile(file);
    if (!data) return undefined;
    const ext = /\.([\w]+)$/.exec(file)?.[1]?.toLowerCase();
    const at = `images/${resources.length + 1}${ext ? `.${ext}` : ''}`;
    resources.push({ path: at, data });
    inBook.set(file, at);
    return at;
  };
  for (const el of Array.from(doc.querySelectorAll('img[src], video[src], video[poster], audio[src], source[src]'))) {
    for (const attr of ['src', 'poster']) {
      const value = el.getAttribute(attr);
      if (!value || (NOT_LOCAL.test(value) && !ABSOLUTE.test(value))) continue;
      const rel = safeDecode(value.split(/[?#]/)[0]);
      const candidates = ABSOLUTE.test(rel)
        ? [rel]
        : [...(rel.startsWith('./') ? notesRoots.map((root) => joinRelative(root, rel)) : []), joinRelative(dir, rel)];
      for (const file of candidates) {
        const at = await read(file);
        if (!at) continue;
        // from a chapter, in text/
        el.setAttribute(attr, `../${at}`);
        break;
      }
    }
  }
  return resources;
}

type ZipFile = { name: string; data: Uint8Array };

/** The files of a zip, folders and the extras of macOS left out. */
export async function readZip(data: Uint8Array): Promise<ZipFile[]> {
  const zip = await import('foliate-js/vendor/zip.js');
  zip.configure({ useWebWorkers: false });
  const reader = new zip.ZipReader(new zip.BlobReader(new Blob([data as BlobPart])));
  const entries = (await reader.getEntries()) as { filename: string; directory?: boolean; getData?: (w: unknown) => Promise<Blob> }[];
  const files: ZipFile[] = [];
  for (const entry of entries) {
    const base = entry.filename.split('/').pop() ?? '';
    // folders, and the extras of macOS
    if (entry.directory || !entry.getData || entry.filename.startsWith('__MACOSX/') || base.startsWith('.')) continue;
    const blob = await entry.getData(new zip.BlobWriter());
    files.push({ name: entry.filename, data: new Uint8Array(await blob.arrayBuffer()) });
  }
  await reader.close?.();
  return files;
}

const IMAGE = /\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i;
const PAGE = /\.(x?html?|md|markdown|txt)$/i;

async function zipToBook(stem: string, data: Uint8Array): Promise<ConvertedBook> {
  const files = await readZip(data);
  const names = files.map((f) => f.name);
  // a book zipped as such: kept
  if (names.some((n) => n.toLowerCase() === 'meta-inf/container.xml')) return { name: `${stem}.epub`, data };
  if (names.some((n) => /\.fb2$/i.test(n))) return { name: `${stem}.fbz`, data };
  if (names.length && names.every((n) => IMAGE.test(n))) return { name: `${stem}.cbz`, data };
  const pages = files.filter((f) => PAGE.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  if (!pages.length) throw new Error('No book in the zip: no EPUB, images, or pages (HTML, Markdown, TXT)');
  // the pages as chapters where they are, the links between them followed
  const pathOf = (name: string) => `text/${name.replace(PAGE, '.xhtml')}`;
  const pageNames = new Set(pages.map((p) => p.name));
  const chapters: EpubChapter[] = [];
  let language: string | undefined;
  let author: string | undefined;
  for (const page of pages) {
    const text = decodeText(page.data);
    const fileTitle = stemOf(page.name);
    const path = pathOf(page.name);
    if (/\.txt$/i.test(page.name)) {
      chapters.push({ path, title: fileTitle, body: textBody({ title: fileTitle, level: 2, paragraphs: paragraphsOf(text) }) });
      language ??= guessLanguage(text);
      continue;
    }
    const markdown = /\.(md|markdown)$/i.test(page.name);
    const { fields, body } = markdown ? frontMatterOf(text) : { fields: {} as Record<string, string>, body: text };
    const doc = cleanHtml(markdown ? await renderMarkdown(body) : body);
    const meta = metaOfHtml(doc);
    for (const el of Array.from(doc.querySelectorAll('[href], [src]'))) {
      const attr = el.hasAttribute('href') ? 'href' : 'src';
      const value = el.getAttribute(attr)!;
      if (/^[a-z][\w+.-]*:|^#|^\//i.test(value)) continue;
      // a link to another page: to its chapter
      const [target, hash] = value.split('#');
      const dir = page.name.split('/').slice(0, -1);
      const resolved = [...dir, ...decodeURIComponent(target).split('/')].reduce<string[]>((acc, part) => {
        if (part === '..') acc.pop();
        else if (part && part !== '.') acc.push(part);
        return acc;
      }, []).join('/');
      // the resources are under text/ as the pages, their links as they are
      if (pageNames.has(resolved)) {
        el.setAttribute(attr, relativePath(path, pathOf(resolved)).split('/').map(encodeURIComponent).join('/') + (hash ? `#${hash}` : ''));
      }
    }
    language ??= fields.lang ?? meta.language ?? guessLanguage(doc.body.textContent ?? '');
    author ??= fields.author ?? meta.author;
    chapters.push({ path, title: fields.title || meta.title || fileTitle, body: bodyOfHtml(doc) });
  }
  const resources: EpubResource[] = files.filter((f) => !PAGE.test(f.name)).map((f) => ({ path: `text/${f.name}`, data: f.data }));
  return {
    name: `${stem}.epub`,
    data: await buildEpub({ title: stem, author, language: language ?? 'en', chapters, resources }),
  };
}
