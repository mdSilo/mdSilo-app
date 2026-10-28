import { domToMarkdown } from 'mdsmirror';
import { store } from 'lib/store';
import type { ArticleType } from 'types/model';
import { sanitizeHtml } from 'utils/sanitize';
import { fmtDatetime } from 'utils/helper';
import { joinPaths } from 'file/util';
import { writeFile } from 'file/write';
import { openFilePaths } from 'file/open';
import FileAPI from 'file/files';
import { CLIPS_DIR, readingRoot } from 'workspace/layout';

export { CLIPS_DIR };

/** Markdown of HTML from outside: sanitized, then as the editor writes it. */
export function htmlToMarkdown(html: string): string {
  // an inert document: nothing loads or runs while parsing
  const dom = new DOMParser().parseFromString(sanitizeHtml(html), 'text/html');
  return domToMarkdown(dom.body).trim();
}

/** A file name of the title: no path separators or reserved characters. */
export function clipFileName(title: string): string {
  const name = title
    .replace(/[\\/:*?"<>|#^[\]\p{Cc}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
    .trim();
  return name || 'untitled';
}

/** The first lines of a clip: title and where it is from. */
export function clipHeader(article: ArticleType): string {
  const from = [`[${article.url}](${article.url})`];
  if (article.author) from.push(article.author);
  if (article.published) from.push(fmtDatetime(article.published));
  return `# ${article.title}\n\n> From ${from.join(' · ')}\n`;
}

/** A selection as a quote. */
export function quote(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n');
}

/**
 * Save an article as a note in clips/ (reading/clips/ in the workspace
 * layout): the whole article, once (an existing clip is kept as is), or a
 * selection of it added to the clip as a quote.
 * @returns the note path, undefined without a workspace
 */
export async function clipArticle(article: ArticleType, selectionHtml?: string) {
  const initDir = store.getState().initDir;
  if (!initDir) return;
  const clipsDir = await joinPaths(readingRoot() ?? initDir, [CLIPS_DIR]);
  const notePath = await joinPaths(clipsDir, [`${clipFileName(article.title)}.md`]);
  const file = new FileAPI(notePath);
  const existing = (await file.exists()) ? await file.readFile() : '';

  let content: string;
  if (selectionHtml !== undefined) {
    const excerpt = quote(htmlToMarkdown(selectionHtml));
    content = `${(existing || clipHeader(article)).trimEnd()}\n\n${excerpt}\n`;
  } else if (existing) {
    content = existing;
  } else {
    const body = htmlToMarkdown(article.content || article.description || '');
    content = `${clipHeader(article)}\n${body}\n`;
  }
  if (content !== existing) {
    await writeFile(notePath, content);
  }
  // into the store and the tree, with the clips folder
  await openFilePaths([clipsDir, notePath]);
  return notePath;
}
