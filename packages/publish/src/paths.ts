/** The URL paths of the site: relative, so it works under any base. */

const UNSAFE = /[?#%"<>\\^`{|}:*[\]'&+,;=!$()@~]/g;

/** A path segment safe in URLs and file systems, letters of any script kept. */
export function slug(text: string): string {
  const s = text
    .normalize('NFC')
    .trim()
    .replace(UNSAFE, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return s || 'untitled';
}

/** Hands out paths once each, case aside: `a.html`, `a-2.html`... */
export class PathSet {
  private taken = new Set<string>();

  claim(base: string, ext: string): string {
    for (let n = 1; ; n += 1) {
      const path = `${base}${n === 1 ? '' : `-${n}`}${ext}`;
      if (!this.taken.has(path.toLowerCase())) {
        this.taken.add(path.toLowerCase());
        return path;
      }
    }
  }
}

const dirOf = (path: string) => path.split('/').slice(0, -1);

/** The href from one page of the site to another. */
export function relHref(from: string, to: string): string {
  const fromDir = dirOf(from);
  const toParts = to.split('/');
  let common = 0;
  while (common < fromDir.length && common < toParts.length - 1 && fromDir[common] === toParts[common]) {
    common += 1;
  }
  const up = fromDir.slice(common).map(() => '..');
  return encodeURI([...up, ...toParts.slice(common)].join('/'));
}

/** `a/b/../c.md` -> `a/c.md`; undefined if it goes above the root. */
export function normalizePath(path: string): string | undefined {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (out.length === 0) return undefined;
      out.pop();
    } else {
      out.push(part);
    }
  }
  return out.join('/');
}

export const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
