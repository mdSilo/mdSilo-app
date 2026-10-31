import { buildEpub, type EpubChapter, type EpubResource, type TocEntry } from './convert/epub';
import type { BookDoc, TOCItem } from './document';
import { blocksOf, sourceTextOf, translateDoc } from './translation';

/**
 * A book of another format (MOBI, AZW3, FB2) made an EPUB with its
 * translations: of its pages as the reader shows them (foliate-js loads
 * them), so the paragraphs are those translated as it was read. The images,
 * styles and fonts, shown from blob: URLs, are put in the book; the links
 * between the pages, and the contents, go to the pages made.
 */

const chapterPath = (index: number) => `text/c${index}.xhtml`;

const EXTS: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg',
  'image/bmp': 'bmp', 'text/css': 'css', 'font/ttf': 'ttf', 'font/otf': 'otf', 'font/woff': 'woff',
  'font/woff2': 'woff2', 'application/vnd.ms-opentype': 'otf', 'application/x-font-ttf': 'ttf',
};

/** A page of the book as shown: XHTML if it is, else HTML. */
async function pageOf(url: string): Promise<Document> {
  const text = await (await fetch(url)).text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xhtml+xml');
  return doc.getElementsByTagName('parsererror').length ? parser.parseFromString(text, 'text/html') : doc;
}

/** The pages of the book, as shown: each once. */
async function pagesOf(book: BookDoc): Promise<Document[]> {
  const docs: Document[] = [];
  for (const section of book.sections) {
    docs.push(section.load ? await pageOf(await section.load()) : await section.createDocument());
  }
  return docs;
}

/** The paragraphs of a book of another format, and how many are translated. */
export async function translatedCountOfBook(book: BookDoc, translations: Record<string, string>) {
  let total = 0;
  let done = 0;
  const missing: string[] = [];
  for (const doc of await pagesOf(book)) {
    for (const block of blocksOf(doc.body ?? doc.documentElement)) {
      const key = sourceTextOf(block);
      if (!key) continue;
      total++;
      if (translations[key]) done++;
      else missing.push(key);
    }
  }
  return { total, done, missing };
}

/** The resources of blob: URLs put in the book, each once, by the path they get there. */
class Resources {
  readonly list: EpubResource[] = [];
  private paths = new Map<string, Promise<string | undefined>>();

  /** the path in the book of a blob: URL; a style, with what it refers to in it */
  pathOf(url: string): Promise<string | undefined> {
    let found = this.paths.get(url);
    if (!found) {
      found = this.add(url).catch(() => undefined);
      this.paths.set(url, found);
    }
    return found;
  }

  private async add(url: string): Promise<string | undefined> {
    const res = await fetch(url);
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim();
    const path = `res/r${this.paths.size}.${EXTS[type] ?? 'bin'}`;
    if (type === 'text/css') {
      // its urls: from res/ too
      const css = await this.rewriteCss(await res.text(), (p) => p.slice('res/'.length));
      this.list.push({ path, data: new TextEncoder().encode(css) });
    } else {
      this.list.push({ path, data: new Uint8Array(await res.arrayBuffer()) });
    }
    return path;
  }

  /** the blob: URLs of a style replaced, relative to where it is */
  async rewriteCss(css: string, relative: (path: string) => string): Promise<string> {
    const urls = [...new Set(Array.from(css.matchAll(/url\(\s*["']?(blob:[^"')\s]+)["']?\s*\)/g), (m) => m[1]))];
    for (const url of urls) {
      const path = await this.pathOf(url);
      if (path) css = css.split(url).join(relative(path));
    }
    return css;
  }
}

const ATTRS = ['src', 'href', 'xlink:href', 'poster'];

/** The blob: URLs of a page replaced by the resources in the book. */
async function keepResources(doc: Document, resources: Resources) {
  const fromPage = (path: string) => `../${path}`;
  for (const el of Array.from(doc.querySelectorAll('*'))) {
    for (const attr of ATTRS) {
      const value = el.getAttribute(attr);
      if (!value?.startsWith('blob:')) continue;
      const path = await resources.pathOf(value);
      if (path) el.setAttribute(attr, fromPage(path));
      else el.removeAttribute(attr);
    }
    const style = el.getAttribute('style');
    if (style?.includes('blob:')) el.setAttribute('style', await resources.rewriteCss(style, fromPage));
  }
  for (const style of Array.from(doc.querySelectorAll('style'))) {
    if (style.textContent?.includes('blob:')) style.textContent = await resources.rewriteCss(style.textContent, fromPage);
  }
}

/** The page and the element a link of the book goes to: a link in the book made. */
async function hrefIn(
  book: BookDoc, docs: Document[], ids: { next: number }, href: string, from?: number,
): Promise<string | undefined> {
  let target: Awaited<ReturnType<NonNullable<BookDoc['resolveHref']>>>;
  try {
    target = await book.resolveHref?.(href);
  } catch {
    return undefined;
  }
  if (!target || !(target.index >= 0) || !docs[target.index]) return undefined;
  const page = from === undefined ? chapterPath(target.index) : `c${target.index}.xhtml`;
  let el: Element | null | undefined;
  try {
    el = target.anchor?.(docs[target.index]);
  } catch {
    el = undefined;
  }
  if (!el || el === docs[target.index].documentElement || el === docs[target.index].body) return page;
  if (!el.id) el.id = `mdsilo-${ids.next++}`;
  return `${page}#${encodeURIComponent(el.id)}`;
}

/** The book as an EPUB, with the translations kept: under each paragraph, or in place of it. */
export async function translatedEpubOfBook(
  book: BookDoc, translations: Record<string, string>, lang: string, only: boolean,
  meta: { title: string; author?: string; language?: string },
): Promise<Uint8Array> {
  const docs = await pagesOf(book);
  const resources = new Resources();
  let untranslated = 0;
  for (const doc of docs) {
    untranslated += translateDoc(doc, translations, lang, only).missing;
    await keepResources(doc, resources);
  }
  // the links between the pages, once all are there to find their places
  const ids = { next: 0 };
  const external = (href: string) => (book.isExternal ? book.isExternal(href) : /^\w+:/.test(href) && !/^(filepos|kindle):/.test(href));
  for (const [index, doc] of docs.entries()) {
    for (const a of Array.from(doc.querySelectorAll('a[href]'))) {
      const href = a.getAttribute('href')!;
      if (external(href) || href.startsWith('blob:') || href.startsWith('../res/')) continue;
      const to = await hrefIn(book, docs, ids, href, index);
      if (to) a.setAttribute('href', to);
      else a.removeAttribute('href');
    }
  }
  const toc = async (items: TOCItem[] | undefined): Promise<TocEntry[]> => {
    const entries: TocEntry[] = [];
    for (const item of items ?? []) {
      const href = item.href ? await hrefIn(book, docs, ids, item.href) : undefined;
      const children = await toc(item.subitems);
      if (href) entries.push({ label: item.label, href, ...(children.length ? { children } : {}) });
      else if (children.length) entries.push({ label: item.label, href: children[0].href, children });
    }
    return entries;
  };
  const contents = await toc(book.toc);
  const serializer = new XMLSerializer();
  // an HTML page as XHTML too: its elements in the namespace, XML writes it so
  const chapters: EpubChapter[] = docs.map((doc, index) => ({
    path: chapterPath(index),
    title: doc.title || `${index + 1}`,
    body: '',
    xhtml: `<?xml version="1.0" encoding="utf-8"?>\n${serializer.serializeToString(doc).replace(/^<\?xml[^>]*>\s*/, '')}`,
  }));
  return buildEpub({
    title: `${meta.title} (${lang})`,
    author: meta.author,
    language: only && !untranslated ? lang : meta.language || lang,
    chapters,
    toc: contents.length ? contents : undefined,
    resources: resources.list,
  });
}
