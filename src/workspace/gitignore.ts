import { BOOK_EXTS } from '@/reader/document';

// reading/.gitignore: the book files are synced (git) only if chosen in the
// library, see reader/library. The rest of the file is the user's.

const GITIGNORE_START = '# >>> mdSilo: book files are not synced, unless chosen in the library';
const GITIGNORE_END = '# <<< mdSilo';

/** The block of reading/.gitignore managed by the app, for the books synced. */
export function gitignoreBlock(synced: string[]): string {
  const lines = [GITIGNORE_START];
  for (const ext of Object.keys(BOOK_EXTS)) lines.push(`*.${ext}`);
  for (const file of [...synced].sort()) {
    // relative to reading/, with the special characters escaped
    lines.push(`!/${file.replace(/([*?[\]!#\\])/g, '\\$1')}`);
  }
  lines.push(GITIGNORE_END);
  return lines.join('\n');
}

/** The .gitignore with its managed block replaced, the rest kept. */
export function updateGitignore(text: string, synced: string[]): string {
  const block = gitignoreBlock(synced);
  const start = text.indexOf(GITIGNORE_START);
  const end = text.indexOf(GITIGNORE_END, start);
  if (start >= 0 && end >= 0) {
    return `${text.slice(0, start)}${block}${text.slice(end + GITIGNORE_END.length)}`;
  }
  return `${text.trimEnd()}${text.trim() ? '\n\n' : ''}${block}\n`;
}
