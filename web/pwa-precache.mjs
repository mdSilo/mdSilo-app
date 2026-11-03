/**
 * The files of the web build the service worker (web/public/fs-sw.js) keeps
 * for offline use, written into it by the build (vite.web.config.mts).
 */
import crypto from 'crypto';

/** not kept, or only once used: the worker itself, the demo, source maps, pdf.js cmaps and fonts */
export const NOT_PRECACHED = [/^fs-sw\.js$/, /^demo\//, /\.map$/, /^vendor\/pdfjs\/(cmaps|standard_fonts)\//];

/** what fs-sw.js has in place of the list */
export const PRECACHE_MARKER = 'const BUILD = null; // __MDSILO_PRECACHE__';

/**
 * The list for the worker:
 * - `core`: what index.html loads, the install waits for it;
 * - `rest`: the views loaded later, kept once the app runs;
 * - `version`: changes with any file kept, so a new build installs as an update.
 *
 * @param {string[]} files paths in the output folder, with `/`
 * @param {(file: string) => Buffer | string} read the content of a file
 * @param {string} base the base of the app, e.g. `/` or `/mdsilo/`
 */
export function precacheOf(files, read, base = '/') {
  const kept = [...files].sort().filter((f) => !NOT_PRECACHED.some((re) => re.test(f)));
  const hash = crypto.createHash('sha1');
  for (const f of kept) hash.update(f).update(read(f));
  const html = String(read('index.html'));
  const core = new Set(['index.html', 'manifest.webmanifest'].filter((f) => kept.includes(f)));
  for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const rel = url.startsWith(base) ? url.slice(base.length) : url;
    if (kept.includes(rel)) core.add(rel);
  }
  return {
    version: hash.digest('hex').slice(0, 12),
    core: [...core],
    rest: kept.filter((f) => !core.has(f)),
  };
}

/** the code of fs-sw.js with the list in it */
export function injectPrecache(code, build) {
  if (!code.includes(PRECACHE_MARKER)) throw new Error('fs-sw.js: no precache marker');
  return code.replace(PRECACHE_MARKER, `const BUILD = ${JSON.stringify(build)};`);
}
