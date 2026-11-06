import { invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import { fromWorkspacePath, toWorkspacePath } from "@/workspace/util";
import {
  bookHashOf,
  bookIdOf,
  importBookData,
  readLibrary,
  saveBookEntry,
  type BookEntry,
} from "@/reader/library/library";
import { bookFormatOf } from "@/reader/document";

/**
 * OPDS catalogs (https://opds.io): browse, search and download books. A
 * catalog is added as a channel of type `opds`; its pages are fetched as they
 * are browsed, not stored. Both OPDS 1 (Atom) and OPDS 2 (JSON) are read.
 * A book downloaded goes to reading/, its library entry keeping the id of the
 * catalog entry (`opds`), so it is shown as downloaded.
 */

export type OpdsLink = {
  href: string;
  rel: string;
  type: string;
  title?: string;
};

/** A link to download a book of a format the reader opens. */
export type OpdsAcquisition = OpdsLink & {
  /** the extension of the file, e.g. epub */
  ext: string;
};

export type OpdsEntry = {
  /** the id of the entry, else its first link */
  id: string;
  title: string;
  authors: string[];
  /** text, or HTML: sanitized to show */
  summary: string;
  language?: string;
  publisher?: string;
  published?: string;
  subjects: string[];
  /** the image of the cover, small one first */
  thumbnail?: string;
  /** a catalog page to go to: an entry of a navigation feed */
  nav?: OpdsLink;
  acquisitions: OpdsAcquisition[];
  /** links to buy, borrow, etc.: on the web, not downloaded here */
  external: OpdsLink[];
  /** the title of the group it is in (OPDS 2) */
  group?: string;
};

export type OpdsSearch =
  /** a URL with `{searchTerms}` (OpenSearch) or `{?query}` (URI template) */
  | { template: string }
  /** an OpenSearch description, to fetch for the template */
  | { description: string };

export type OpdsFeed = {
  url: string;
  title: string;
  subtitle: string;
  entries: OpdsEntry[];
  next?: string;
  prev?: string;
  first?: string;
  search?: OpdsSearch;
};

/** The extensions of the book files by their media types. */
const BOOK_TYPES: Record<string, string> = {
  "application/epub+zip": "epub",
  "application/pdf": "pdf",
  "application/x-mobipocket-ebook": "mobi",
  "application/x-mobi8-ebook": "azw3",
  "application/vnd.amazon.ebook": "azw3",
  "application/x-cbz": "cbz",
  "application/vnd.comicbook+zip": "cbz",
  "application/x-fictionbook+xml": "fb2",
  "application/fb2": "fb2",
  "application/x-zip-compressed-fb2": "fbz",
  "application/fb2+zip": "fbz",
  "text/plain": "txt",
};

/** The extension of a book file by its media type, if the reader opens it. */
export function bookExtOf(type: string): string | undefined {
  const mime = type.split(";")[0].trim().toLowerCase();
  return BOOK_TYPES[mime];
}

const ACQUISITION = "http://opds-spec.org/acquisition";
const isAcquisition = (rel: string) => rel.startsWith(ACQUISITION);
const isImage = (rel: string) =>
  rel === "http://opds-spec.org/image" ||
  rel === "http://opds-spec.org/cover" ||
  rel === "http://opds-spec.org/image/thumbnail" ||
  rel === "http://opds-spec.org/thumbnail";
const isThumbnail = (rel: string) => rel.endsWith("thumbnail");
const isCatalog = (type: string) =>
  /application\/atom\+xml|application\/opds\+json/i.test(type) &&
  !/type=entry/i.test(type);

const resolve = (href: string, base: string) => {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
};

/** A URL template resolved: the part before its first `{`, braces not escaped. */
const resolveTemplate = (href: string, base: string) => {
  const i = href.indexOf("{");
  return i < 0
    ? resolve(href, base)
    : resolve(href.slice(0, i), base) + href.slice(i);
};

/** Acquisitions and others, of the links of an entry. */
function sortLinks(links: OpdsLink[]) {
  const acquisitions: OpdsAcquisition[] = [];
  const external: OpdsLink[] = [];
  let thumbnail: string | undefined;
  let image: string | undefined;
  let nav: OpdsLink | undefined;
  for (const link of links) {
    if (isAcquisition(link.rel)) {
      const ext = bookExtOf(link.type);
      // the same file listed twice: once is enough
      if (ext && !acquisitions.some((a) => a.href === link.href)) {
        acquisitions.push({ ...link, ext });
      } else if (!ext && /text\/html/i.test(link.type)) {
        external.push(link);
      }
    } else if (isImage(link.rel)) {
      if (isThumbnail(link.rel)) thumbnail ??= link.href;
      else image ??= link.href;
    } else if (!nav && isCatalog(link.type) && link.rel !== "alternate") {
      nav = link;
    } else if (!nav && !link.rel && isCatalog(link.type)) {
      nav = link;
    }
  }
  return { acquisitions, external, thumbnail: thumbnail ?? image, nav };
}

// # OPDS 1: Atom #

const children = (el: Element, name: string) =>
  Array.from(el.children).filter((c) => c.localName === name);
const childText = (el: Element, ...names: string[]) => {
  for (const name of names) {
    const found = children(el, name)[0];
    if (found) return (found.textContent ?? "").trim();
  }
  return "";
};

function atomLinks(el: Element, base: string): OpdsLink[] {
  return children(el, "link")
    .filter((l) => l.getAttribute("href"))
    .map((l) => ({
      href: resolveTemplate(l.getAttribute("href")!, base),
      rel: l.getAttribute("rel") ?? "",
      type: l.getAttribute("type") ?? "",
      title: l.getAttribute("title") ?? undefined,
    }));
}

function atomEntry(el: Element, base: string): OpdsEntry {
  const links = atomLinks(el, base);
  const { acquisitions, external, thumbnail, nav } = sortLinks(links);
  const content = children(el, "content")[0];
  // HTML of content and summary as text: shown sanitized
  const summary =
    childText(el, "summary") ||
    (content?.getAttribute("type") === "xhtml"
      ? (content.innerHTML ?? "")
      : (content?.textContent ?? "").trim());
  return {
    id: childText(el, "id") || links[0]?.href || childText(el, "title"),
    title: childText(el, "title"),
    authors: children(el, "author")
      .map((a) => childText(a, "name"))
      .filter(Boolean),
    summary,
    language: childText(el, "language") || undefined,
    publisher: childText(el, "publisher") || undefined,
    published: childText(el, "issued", "published") || undefined,
    subjects: children(el, "category")
      .map((c) => c.getAttribute("label") || c.getAttribute("term") || "")
      .filter(Boolean),
    thumbnail,
    // a book is not a page to go to, even with a link to its own entry
    nav: acquisitions.length ? undefined : nav,
    acquisitions,
    external,
  };
}

function searchOf(links: OpdsLink[]): OpdsSearch | undefined {
  const search = links.filter((l) => l.rel === "search");
  const template = search.find((l) => /\{searchTerms\}|\{\?/.test(l.href));
  if (template) return { template: template.href };
  const description = search.find((l) => /opensearchdescription/i.test(l.type));
  return description ? { description: description.href } : undefined;
}

export function parseAtomCatalog(xml: string, url: string): OpdsFeed | null {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return null;
  const root = doc.documentElement;
  if (root.localName !== "feed" && root.localName !== "entry") return null;
  const links = atomLinks(root, url);
  const href = (rel: string) => links.find((l) => l.rel === rel)?.href;
  const entries =
    root.localName === "entry"
      ? [atomEntry(root, url)]
      : children(root, "entry").map((e) => atomEntry(e, url));
  return {
    url,
    title: childText(root, "title"),
    subtitle: childText(root, "subtitle"),
    entries,
    next: href("next"),
    prev: href("previous") ?? href("prev"),
    first: href("first"),
    search: searchOf(links),
  };
}

// # OPDS 2: JSON #

type JsonLink = {
  href?: string;
  rel?: string | string[];
  type?: string;
  title?: string;
  templated?: boolean;
};
type JsonContributor = string | { name?: string | Record<string, string> };
type JsonPublication = {
  metadata?: {
    title?: string | Record<string, string>;
    identifier?: string;
    author?: JsonContributor | JsonContributor[];
    description?: string;
    language?: string | string[];
    publisher?: JsonContributor | JsonContributor[];
    published?: string;
    subject?: (string | { name?: string })[] | string;
  };
  links?: JsonLink[];
  images?: JsonLink[];
};
type JsonGroup = {
  metadata?: { title?: string };
  navigation?: JsonLink[];
  publications?: JsonPublication[];
};
type JsonFeed = JsonGroup & {
  metadata?: { title?: string; subtitle?: string };
  links?: JsonLink[];
  groups?: JsonGroup[];
};

const textOf = (t: unknown): string =>
  typeof t === "string"
    ? t
    : t && typeof t === "object"
      ? String(Object.values(t)[0] ?? "")
      : "";
const listOf = <T>(x: T | T[] | undefined): T[] =>
  x === undefined ? [] : Array.isArray(x) ? x : [x];
const nameOf = (c: JsonContributor) =>
  typeof c === "string" ? c : textOf(c?.name);

function jsonLinks(links: JsonLink[] | undefined, base: string): OpdsLink[] {
  return (links ?? [])
    .filter((l) => l.href)
    .flatMap((l) =>
      listOf(l.rel ?? "").map((rel) => ({
        href: l.templated
          ? resolveTemplate(l.href!, base)
          : resolve(l.href!, base),
        rel,
        type: l.type ?? "",
        title: l.title,
      })),
    );
}

function jsonPublication(
  pub: JsonPublication,
  base: string,
  group?: string,
): OpdsEntry {
  const meta = pub.metadata ?? {};
  const links = jsonLinks(pub.links, base);
  const { acquisitions, external } = sortLinks(links);
  const images = (pub.images ?? []).filter((i) => i.href);
  // the smallest image, as a thumbnail
  const image = images.length
    ? [...images].sort(
        (a, b) =>
          ((a as { width?: number }).width ?? 1e9) -
          ((b as { width?: number }).width ?? 1e9),
      )[0]
    : undefined;
  return {
    id: meta.identifier || links[0]?.href || textOf(meta.title),
    title: textOf(meta.title),
    authors: listOf(meta.author).map(nameOf).filter(Boolean),
    summary: meta.description ?? "",
    language: listOf(meta.language)[0],
    publisher: listOf(meta.publisher).map(nameOf).filter(Boolean)[0],
    published: meta.published,
    subjects: listOf(meta.subject)
      .map((s) => (typeof s === "string" ? s : (s?.name ?? "")))
      .filter(Boolean),
    thumbnail: image ? resolve(image.href!, base) : undefined,
    acquisitions,
    external,
    group,
  };
}

const navEntry = (link: OpdsLink, group?: string): OpdsEntry => ({
  id: link.href,
  title: link.title || link.href,
  authors: [],
  summary: "",
  subjects: [],
  nav: link,
  acquisitions: [],
  external: [],
  group,
});

export function parseJsonCatalog(text: string, url: string): OpdsFeed | null {
  let feed: JsonFeed;
  try {
    feed = JSON.parse(text) as JsonFeed;
  } catch {
    return null;
  }
  if (!feed || typeof feed !== "object" || !feed.metadata) return null;
  const links = jsonLinks(feed.links, url);
  const href = (rel: string) => links.find((l) => l.rel === rel)?.href;
  const entriesOf = (g: JsonGroup, group?: string) => [
    ...jsonLinks(g.navigation, url).map((l) => navEntry(l, group)),
    ...(g.publications ?? []).map((p) => jsonPublication(p, url, group)),
  ];
  // a single publication
  const single = (feed as JsonPublication).metadata?.identifier
    ? [jsonPublication(feed as JsonPublication, url)]
    : [];
  return {
    url,
    title: textOf(feed.metadata.title),
    subtitle: feed.metadata.subtitle ?? "",
    entries: [
      ...entriesOf(feed),
      ...(feed.groups ?? []).flatMap((g) => entriesOf(g, g.metadata?.title)),
      ...(feed.navigation || feed.publications || feed.groups ? [] : single),
    ],
    next: href("next"),
    prev: href("previous") ?? href("prev"),
    first: href("first"),
    search: searchOf(links),
  };
}

/** A catalog page, OPDS 1 or 2, by its text. */
export function parseCatalog(text: string, url: string): OpdsFeed | null {
  return text.trimStart().startsWith("{")
    ? parseJsonCatalog(text, url)
    : parseAtomCatalog(text, url);
}

// # search #

/** The search template of an OpenSearch description: of Atom results, else any. */
export function parseOpenSearch(xml: string, url: string): string | undefined {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return undefined;
  const urls = Array.from(doc.getElementsByTagName("*")).filter(
    (el) => el.localName === "Url" && el.getAttribute("template"),
  );
  const url0 =
    urls.find((u) => /atom\+xml/i.test(u.getAttribute("type") ?? "")) ??
    urls[0];
  return url0
    ? resolveTemplate(url0.getAttribute("template")!, url)
    : undefined;
}

/**
 * The URL of a search, by its template: OpenSearch (`{searchTerms}`, other
 * parameters left out) or a URI template (`{?query}`, OPDS 2).
 */
export function searchUrl(template: string, query: string) {
  const q = encodeURIComponent(query);
  const filled = template
    .replace(/\{\?([^}]+)\}/g, (_, names: string) =>
      names.split(",").includes("query") ? `?query=${q}` : "",
    )
    .replace(/\{searchTerms\??\}/g, q)
    // the other OpenSearch parameters, e.g. {startPage?}
    .replace(/\{[^}]+\}/g, "");
  return filled;
}

// # fetch and download #

/** The most bytes of a book downloaded. */
export const MAX_BOOK_BYTES = 512 << 20;

/** The bytes at the URL: by Rust on the desktop, by the CORS proxy on the web */
export async function fetchBytes(url: string, maxBytes?: number) {
  const data = await invoke<ArrayBuffer | Uint8Array | number[]>("fetch_url", {
    url,
    maxBytes,
  });
  return data instanceof Uint8Array
    ? data
    : new Uint8Array(data as ArrayBuffer);
}

const fetchText = async (url: string) =>
  new TextDecoder().decode(await fetchBytes(url));

/** A catalog page by its URL. */
export async function loadCatalog(url: string): Promise<OpdsFeed> {
  const feed = parseCatalog(await fetchText(url), url);
  if (!feed) throw new Error(`Not an OPDS catalog: ${url}`);
  return feed;
}

const templates = new Map<string, string>();

/** The page of the results of a search in a catalog. */
export async function searchCatalog(
  search: OpdsSearch,
  query: string,
): Promise<OpdsFeed> {
  let template: string | undefined;
  if ("template" in search) {
    template = search.template;
  } else {
    template = templates.get(search.description);
    if (!template) {
      template = parseOpenSearch(
        await fetchText(search.description),
        search.description,
      );
      if (!template) throw new Error("The catalog's search is not usable");
      templates.set(search.description, template);
    }
  }
  return loadCatalog(searchUrl(template, query));
}

/** The name of a file of a book: its title, without the characters not allowed in file names. */
export function bookFileName(entry: Pick<OpdsEntry, "title">, ext: string) {
  const stem =
    entry.title
      .replace(/[\\/:*?"<>|]/g, " ")
      // the control characters
      .replace(/\p{Cc}/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120)
      .replace(/^\.+|\.+$/g, "") || "book";
  return `${stem}.${ext}`;
}

/**
 * The books of the library downloaded from catalogs and still here: by
 * the ids of their catalog entries, the paths of their files.
 */
export async function downloadedBooks(): Promise<Map<string, string>> {
  const ws = store.getState().initDir;
  const found = new Map<string, string>();
  if (!ws) return found;
  const lib = await readLibrary(ws);
  for (const book of Object.values(lib.books)) {
    if (!book.opds) continue;
    const path = fromWorkspacePath(ws, book.file);
    if (
      await invoke<boolean>("file_exist", { filePath: path }).catch(() => false)
    )
      found.set(book.opds, path);
  }
  return found;
}

/**
 * Download a book of an entry to reading/ and add it to the library.
 * @returns the path of the book file
 */
export async function downloadBook(
  entry: OpdsEntry,
  acquisition: OpdsAcquisition,
): Promise<string> {
  const ws = store.getState().initDir;
  if (!ws) throw new Error("No workspace open");
  const data = await fetchBytes(acquisition.href, MAX_BOOK_BYTES);
  const name = bookFileName(entry, acquisition.ext);
  const path = await importBookData(ws, name, data);
  if (!path) throw new Error(`Failed to write the book "${name}"`);
  const fileHash = await bookHashOf(path);
  if (!fileHash) throw new Error(`Failed to read the book "${name}"`);
  // the same book in the library already, e.g. downloaded before
  const lib = await readLibrary(ws);
  const hash = bookIdOf(lib, fileHash) ?? fileHash;
  const old = lib.books[hash];
  const patch: Partial<BookEntry> & Pick<BookEntry, "hash"> = old
    ? { hash, opds: entry.id }
    : {
        hash,
        file: toWorkspacePath(ws, path),
        title: entry.title || name,
        author: entry.authors.join(", "),
        format: bookFormatOf(path) ?? "EPUB",
        addedAt: new Date().toISOString(),
        opds: entry.id,
      };
  await saveBookEntry(ws, patch);
  return path;
}
