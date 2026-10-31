import { readZip } from '../convert';
import type { BookDoc } from '../document';
import { translatedCountOfBook, translatedEpubOfBook } from './bookToEpub';

// the pages of a MOBI as foliate-js shows them: their images, styles, fonts at blob: URLs
const FILES: Record<string, { type: string; body: string }> = {
  'blob:p0': {
    type: 'application/xhtml+xml',
    body: `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>One</title>
<link rel="stylesheet" href="blob:css"/></head>
<body><h1>Chapter one</h1><p>The cat sat.</p><p><img src="blob:img"/></p><p><a href="filepos:42">See the note</a> <a href="filepos:50">the dog</a></p></body></html>`,
  },
  // not XHTML: as HTML
  'blob:p1': {
    type: 'text/html',
    body: '<html><head><title>Two</title></head><body><p>A dog ran.<br>Then stopped.</p><p id="x">The note</p></body></html>',
  },
  'blob:css': { type: 'text/css', body: '@font-face { font-family: F; src: url("blob:font"); } p { color: red; }' },
  'blob:img': { type: 'image/png', body: 'PNG' },
  'blob:font': { type: 'font/ttf', body: 'TTF' },
};

const book = {
  metadata: { title: 'A MOBI' },
  sections: [
    { id: '0', size: 1, load: () => 'blob:p0', createDocument: vi.fn() },
    { id: '1', size: 1, load: async () => 'blob:p1', createDocument: vi.fn() },
  ],
  toc: [{ label: 'One', href: 'filepos:0' }, { label: 'Two', href: 'filepos:42', subitems: [{ label: 'Gone', href: 'filepos:999' }] }],
  resolveHref: (href: string) => {
    const pos = Number(href.split(':')[1]);
    if (pos > 100) return undefined;
    if (pos < 10) return { index: 0, anchor: (doc: Document) => doc.body };
    return { index: 1, anchor: (doc: Document) => doc.querySelector(pos === 42 ? '#x' : 'p') };
  },
  isExternal: (href: string) => /^(?!blob|filepos)\w+:/i.test(href),
  getCover: async () => null,
} as unknown as BookDoc;

const TRANSLATIONS = { 'Chapter one': 'Chapitre un', 'The cat sat.': 'Le chat était assis.', 'A dog ran.Then stopped.': 'Un chien courut.' };

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const file = FILES[url];
    if (!file) throw new Error(`no ${url}`);
    return {
      headers: new Headers({ 'content-type': file.type }),
      text: async () => file.body,
      arrayBuffer: async () => new TextEncoder().encode(file.body).buffer,
    };
  }));
});

afterEach(() => vi.unstubAllGlobals());

const read = async (data: Uint8Array) =>
  new Map((await readZip(data)).map((f) => [f.name.replace(/^OEBPS\//, ''), new TextDecoder().decode(f.data)]));

describe('a book of another format made an EPUB with its translations', () => {
  test('its paragraphs, as shown: those translated counted', async () => {
    expect(await translatedCountOfBook(book, TRANSLATIONS)).toEqual({
      total: 5, done: 3, missing: ['See the note the dog', 'The note'],
    });
  });

  test('the pages with the translations, the resources in it, the links and contents to its pages', async () => {
    const files = await read(await translatedEpubOfBook(book, TRANSLATIONS, 'fr', false, { title: 'A MOBI', author: 'X', language: 'en' }));
    const c0 = files.get('text/c0.xhtml')!;
    expect(c0).toContain('The cat sat.<span class="mdsilo-translation" lang="fr"');
    expect(c0).toContain('Le chat était assis.</span>');
    // the image and the style in the book, the font of the style too, by relative paths
    expect(c0).toMatch(/<img src="\.\.\/res\/r\d\.png"/);
    const css = c0.match(/href="\.\.\/(res\/r\d\.css)"/)![1];
    expect(files.get(css)).toMatch(/url\("r\d\.ttf"\)/);
    expect([...files.keys()].filter((f) => f.startsWith('res/'))).toHaveLength(3);
    // the links: to their page, the place by its id; one given where none
    expect(c0).toContain('<a href="c1.xhtml#x">See the note</a> <a href="c1.xhtml#mdsilo-0">the dog</a>');
    const c1 = files.get('text/c1.xhtml')!;
    expect(c1).toContain('<p id="x">The note</p>');
    expect(c1).toContain('<p id="mdsilo-0">A dog ran.');
    expect(c1).toContain('Un chien courut.');
    // an HTML page written as XHTML
    expect(c1).toContain('<br />');
    expect(new DOMParser().parseFromString(c1, 'application/xhtml+xml').getElementsByTagName('parsererror')).toHaveLength(0);
    // the contents to the pages; an entry not found left out
    const nav = files.get('nav.xhtml')!;
    expect(nav).toContain('href="text/c0.xhtml">One</a>');
    expect(nav).toContain('href="text/c1.xhtml#x">Two</a>');
    expect(nav).not.toContain('Gone');
    const opf = files.get('content.opf')!;
    expect(opf).toContain('<dc:title>A MOBI (fr)</dc:title>');
    expect(opf).toContain('<dc:language>en</dc:language>');
  });

  test('the translation only, all translated: the book in the language', async () => {
    const all = { ...TRANSLATIONS, 'See the note the dog': 'Voir la note, le chien', 'The note': 'La note' };
    const files = await read(await translatedEpubOfBook(book, all, 'fr', true, { title: 'A MOBI', language: 'en' }));
    expect(files.get('text/c0.xhtml')).toContain('<p lang="fr" xml:lang="fr">Le chat était assis.</p>');
    expect(files.get('text/c0.xhtml')).not.toContain('The cat sat.');
    expect(files.get('content.opf')).toContain('<dc:language>fr</dc:language>');
  });
});
