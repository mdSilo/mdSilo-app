import { createZip, crc32, deflateRaw } from '../../platform/web/zip';

/**
 * A minimal EPUB 3 written from chapters of XHTML, for the text files
 * imported as books (see convert/index.ts). The same input makes the same
 * bytes (fixed dates, identifier of the content): imported again, the same
 * book, the same id in the library.
 */

export type TocEntry = { label: string; href: string; children?: TocEntry[] };

export type EpubChapter = {
  /** in the book, e.g. text/1.xhtml */
  path: string;
  title: string;
  /** the body, XHTML */
  body: string;
  /**
   * the id of its place in the spine: in the CFIs of the book, which find
   * the chapter by it wherever it is (e.g. an article of a feed book)
   */
  id?: string;
  /** the page as it is, e.g. written before: not made again from body */
  xhtml?: string;
};

export type EpubResource = { path: string; data: Uint8Array };

export type EpubBook = {
  title: string;
  author?: string;
  /** e.g. en, zh */
  language: string;
  chapters: EpubChapter[];
  /** by default a chapter an entry */
  toc?: TocEntry[];
  /** images, styles, fonts the chapters refer to, by their path */
  resources?: EpubResource[];
  /** of the book, added to the base style */
  css?: string;
  /** of the book, e.g. a uuid; by default of the content */
  identifier?: string;
  /** when the book was changed, ISO; by default a fixed date */
  modified?: string;
  /** files in the zip, not of the book, e.g. data of the app */
  files?: EpubResource[];
};

const ROOT = 'OEBPS';
/** 1980-01-01, the first date of a zip file: the same bytes each time */
const FIXED_TIME = new Date(1980, 0, 1).getTime();

const MEDIA_TYPES: Record<string, string> = {
  xhtml: 'application/xhtml+xml',
  html: 'application/xhtml+xml',
  css: 'text/css',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

export const mediaTypeOf = (path: string) =>
  MEDIA_TYPES[path.slice(path.lastIndexOf('.') + 1).toLowerCase()] ?? 'application/octet-stream';

export const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** A path in the book as a link: its parts encoded, the slashes kept. */
export const hrefOf = (path: string) => path.split('/').map(encodeURIComponent).join('/');

/** The path of `to` from the folder of `from`, both in the book. */
export function relativePath(from: string, to: string) {
  const dir = from.split('/').slice(0, -1);
  const target = to.split('/');
  let i = 0;
  while (i < dir.length && i < target.length - 1 && dir[i] === target[i]) i++;
  return [...dir.slice(i).map(() => '..'), ...target.slice(i)].join('/');
}

const BASE_CSS = `
img, svg, video { max-width: 100%; height: auto; }
pre { white-space: pre-wrap; overflow-wrap: break-word; }
table { border-collapse: collapse; max-width: 100%; }
th, td { border: 1px solid currentColor; padding: 0.2em 0.5em; }
blockquote { margin-inline: 1em; }
`;

const page = (title: string, lang: string, css: string, body: string) => `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}">
<head><meta charset="utf-8"/><title>${escapeXml(title)}</title><link rel="stylesheet" type="text/css" href="${css}"/></head>
<body>${body}</body>
</html>`;

function navList(entries: TocEntry[]): string {
  return `<ol>${entries.map((e) => `<li><a href="${e.href}">${escapeXml(e.label)}</a>${
    e.children?.length ? navList(e.children) : ''}</li>`).join('')}</ol>`;
}

/** The EPUB file of a book. */
export async function buildEpub(book: EpubBook): Promise<Uint8Array> {
  const text = (s: string) => new TextEncoder().encode(s);
  const lang = escapeXml(book.language || 'en');
  const chapters = book.chapters.map((c) => ({
    ...c,
    xhtml: c.xhtml ?? page(c.title, lang, relativePath(c.path, 'style.css'), c.body),
  }));
  // of the content: the same text, the same book
  const id = book.identifier
    ?? `mdsilo:${crc32(text(chapters.map((c) => c.xhtml).join('\n'))).toString(16).padStart(8, '0')}`;
  const itemId = (c: EpubChapter, i: number) => (c.id ? `i-${c.id}` : `c${i}`);
  const toc = book.toc ?? chapters.map((c) => ({ label: c.title, href: hrefOf(c.path) }));
  const resources = book.resources ?? [];
  const manifest = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="css" href="style.css" media-type="text/css"/>',
    ...chapters.map((c, i) => `<item id="${itemId(c, i)}" href="${escapeXml(hrefOf(c.path))}" media-type="application/xhtml+xml"/>`),
    ...resources.map((r, i) => `<item id="r${i}" href="${escapeXml(hrefOf(r.path))}" media-type="${mediaTypeOf(r.path)}"/>`),
  ];
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id" xml:lang="${lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="id">urn:${escapeXml(id)}</dc:identifier>
<dc:title>${escapeXml(book.title)}</dc:title>
${book.author ? `<dc:creator>${escapeXml(book.author)}</dc:creator>\n` : ''}<dc:language>${lang}</dc:language>
<meta property="dcterms:modified">${book.modified ?? '2000-01-01T00:00:00Z'}</meta>
</metadata>
<manifest>
${manifest.join('\n')}
</manifest>
<spine>
${chapters.map((c, i) => `<itemref ${c.id ? `id="${escapeXml(c.id)}" ` : ''}idref="${itemId(c, i)}"/>`).join('\n')}
</spine>
</package>`;
  const nav = page(book.title, lang, 'style.css', `<nav epub:type="toc" id="toc"><h1>${escapeXml(book.title)}</h1>${navList(toc)}</nav>`);
  const container = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="${ROOT}/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;
  const file = (name: string, data: Uint8Array) => ({ name, data, modified: FIXED_TIME });
  // the text deflated, a third of its size or so; the images are compressed already
  const deflated = async (name: string, data: Uint8Array) => ({ ...file(name, data), deflated: await deflateRaw(data) });
  const zip = createZip([
    // first, stored: as the format asks
    file('mimetype', text('application/epub+zip')),
    file('META-INF/container.xml', text(container)),
    await deflated(`${ROOT}/content.opf`, text(opf)),
    await deflated(`${ROOT}/nav.xhtml`, text(nav)),
    file(`${ROOT}/style.css`, text(BASE_CSS + (book.css ?? ''))),
    ...(await Promise.all(chapters.map((c) => deflated(`${ROOT}/${c.path}`, text(c.xhtml))))),
    ...resources.map((r) => file(`${ROOT}/${r.path}`, r.data)),
    ...(await Promise.all((book.files ?? []).map((f) => deflated(`${ROOT}/${f.path}`, f.data)))),
  ]);
  return new Uint8Array(await zip.arrayBuffer());
}
