/**
 * Path helpers for the web virtual file system.
 * Paths are POSIX-like: absolute, '/' separated, no trailing slash, root is '/'.
 * Mirrors the behavior of src-tauri/src/paths.rs and files.rs where it matters.
 */

export const ROOT = '/';

export function normalize(path: string): string {
  const parts: string[] = [];
  for (const seg of String(path ?? '').replace(/\\/g, '/').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      parts.pop();
    } else {
      parts.push(seg);
    }
  }
  return '/' + parts.join('/');
}

export function basename(path: string): string {
  const p = normalize(path);
  return p === ROOT ? '' : p.slice(p.lastIndexOf('/') + 1);
}

export function parent(path: string): string {
  const p = normalize(path);
  if (p === ROOT) return ROOT;
  const idx = p.lastIndexOf('/');
  return idx <= 0 ? ROOT : p.slice(0, idx);
}

export function join(root: string, ...parts: string[]): string {
  return normalize([root, ...parts].join('/'));
}

/** true if `path` is `dir` itself or inside it */
export function isWithin(path: string, dir: string): boolean {
  const p = normalize(path);
  const d = normalize(dir);
  return d === ROOT || p === d || p.startsWith(d + '/');
}

/** name w/o extension, like Rust Path::file_stem */
export function fileStem(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(0, idx) : name;
}

export function extname(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(idx + 1).toLowerCase() : '';
}

/** consistent with files.rs check_md */
export function isTextNote(path: string): boolean {
  return ['md', 'markdown', 'text', 'txt'].includes(extname(basename(path)));
}

/** text-like files are stored as string, others as Blob */
export function isTextFile(path: string): boolean {
  return isTextNote(path) || ['json', 'csv', 'html', 'htm', 'xml', 'svg', 'opml', 'yaml', 'yml']
    .includes(extname(basename(path)));
}

export function isHidden(path: string): boolean {
  return basename(path).startsWith('.');
}
