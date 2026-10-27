import DOMPurify from 'dompurify';
import type { EpubChapter, TocEntry } from './epub';
import { hrefOf } from './epub';

/**
 * An HTML page (or Markdown, rendered) as a book, after readup's Markdown
 * books: the scripts and forms out, the page split in chapters at its first
 * level of headings, the headings below them in the contents.
 */

/** A page, its scripts, forms and handlers out. */
export function cleanHtml(html: string): Document {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const body = DOMPurify.sanitize(doc.body, {
    RETURN_DOM: true,
    FORBID_TAGS: ['style', 'link', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed'],
  }) as HTMLElement;
  doc.body.replaceChildren(...Array.from(body.childNodes));
  return doc;
}

/** The metadata of a page: its title, author, language. */
export function metaOfHtml(doc: Document) {
  const meta = (name: string) => doc.querySelector(`meta[name="${name}" i]`)?.getAttribute('content')?.trim() || undefined;
  return {
    title: doc.title.trim() || doc.querySelector('h1')?.textContent?.trim() || undefined,
    author: meta('author') ?? meta('dc.creator'),
    language: doc.documentElement.lang || undefined,
  };
}

const slugify = (text: string) =>
  text.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/[\s_]+/g, '-').replace(/^-+|-+$/g, '') || 'section';

const HEADINGS = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'];

/** The element holding the content: down the wrappers of one element (div, main, article). */
function contentOf(body: HTMLElement): Element {
  let el: Element = body;
  for (;;) {
    const children = Array.from(el.children);
    const text = Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
    if (children.length !== 1 || text || !/^(DIV|MAIN|ARTICLE|SECTION)$/.test(children[0].tagName)) return el;
    el = children[0];
  }
}

/**
 * The chapters of a page: split at its first level of headings found twice
 * or more (h1, else h2), in `dir` of the book; one chapter if none.
 */
export function chaptersOfHtml(doc: Document, title: string, dir = 'text'): { chapters: EpubChapter[]; toc: TocEntry[] } {
  const content = contentOf(doc.body);
  const nodes = Array.from(content.childNodes);
  // ids unique, the headings with one: the anchors of the contents
  const used = new Set(Array.from(doc.querySelectorAll('[id]')).map((el) => el.id));
  for (const h of Array.from(content.querySelectorAll(HEADINGS.join(',')))) {
    if (h.id) continue;
    const base = slugify(h.textContent ?? '');
    let id = base;
    for (let n = 1; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    h.id = id;
  }
  const split = ['H1', 'H2'].find((tag) => nodes.filter((n) => (n as Element).tagName === tag).length >= 2);
  const groups: Node[][] = [[]];
  for (const node of nodes) {
    if (split && (node as Element).tagName === split && groups[groups.length - 1].length) groups.push([]);
    groups[groups.length - 1].push(node);
  }
  const hasContent = (g: Node[]) => g.some((n) => n.nodeType === Node.ELEMENT_NODE || n.textContent?.trim());
  const kept = groups.filter(hasContent);
  if (!kept.length) kept.push([]);

  const serializer = new XMLSerializer();
  const pathOf = (i: number) => `${dir}/${i + 1}.xhtml`;
  // where each id is, for the links in the page
  const idPath = new Map<string, string>();
  kept.forEach((g, i) => g.forEach((n) => {
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const el = n as Element;
    for (const x of [el, ...Array.from(el.querySelectorAll('[id]'))]) if (x.id) idPath.set(x.id, pathOf(i));
  }));
  const toc: TocEntry[] = [];
  const chapters = kept.map((g, i) => {
    const path = pathOf(i);
    const elements = g.filter((n): n is Element => n.nodeType === Node.ELEMENT_NODE);
    for (const el of elements) {
      for (const a of Array.from(el.querySelectorAll('a[href^="#"]'))) {
        const id = decodeURIComponent(a.getAttribute('href')!.slice(1));
        const at = idPath.get(id);
        if (at && at !== path) a.setAttribute('href', `${at.split('/').pop()}#${encodeURIComponent(id)}`);
      }
    }
    const first = elements[0];
    const heading = first && HEADINGS.includes(first.tagName) ? first : undefined;
    const chapterTitle = heading?.textContent?.trim() || (i === 0 ? title : `${i + 1}`);
    // the headings in the chapter, a level below its own
    const level = split ? Number(split[1]) + 1 : 1;
    const subs = elements.flatMap((el) => [el, ...Array.from(el.querySelectorAll('*'))])
      .filter((el) => el !== heading && el.tagName === `H${level}` && el.textContent?.trim())
      .map((el) => ({ label: el.textContent!.trim(), href: `${hrefOf(path)}#${encodeURIComponent(el.id)}` }));
    toc.push({ label: chapterTitle, href: hrefOf(path), ...(subs.length ? { children: subs } : {}) });
    return { path, title: chapterTitle, body: g.map((n) => serializer.serializeToString(n)).join('') };
  });
  return { chapters, toc };
}

/** The body of a page, XHTML: for a page a chapter, as the files of a zip. */
export function bodyOfHtml(doc: Document): string {
  const serializer = new XMLSerializer();
  return Array.from(doc.body.childNodes).map((n) => serializer.serializeToString(n)).join('');
}

/** The front matter of Markdown (`---` lines at the top), its fields, and the rest. */
export function frontMatterOf(text: string): { fields: Record<string, string>; body: string } {
  const m = text.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!m) return { fields: {}, body: text };
  const fields: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (kv) fields[kv[1].toLowerCase()] = kv[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return { fields, body: text.slice(m[0].length) };
}
