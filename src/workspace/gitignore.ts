import { BOOK_EXTS } from "@/reader/document";

// The .gitignore files with a block managed by the app, the rest of each the
// user's:
//   reading/.gitignore               the book files are synced (git) only if
//                                    chosen in the library, see reader/library
//   .mdsilo/dictionaries/.gitignore  the dictionary files, only if chosen in
//                                    the dictionaries, see reader/dictionary

const GITIGNORE_START =
  "# >>> mdSilo: book files are not synced, unless chosen in the library";
const GITIGNORE_END = "# <<< mdSilo";

/** A path in a .gitignore, its special characters escaped. */
const escapePath = (path: string) => path.replace(/([*?[\]!#\\])/g, "\\$1");

/** The block of reading/.gitignore managed by the app, for the books synced. */
export function gitignoreBlock(synced: string[]): string {
  const lines = [GITIGNORE_START];
  for (const ext of Object.keys(BOOK_EXTS)) lines.push(`*.${ext}`);
  // relative to reading/
  for (const file of [...synced].sort()) lines.push(`!/${escapePath(file)}`);
  lines.push(GITIGNORE_END);
  return lines.join("\n");
}

/** A .gitignore with a block replaced (from its start line to the end line), the rest kept. */
function replaceBlock(text: string, start: string, block: string): string {
  const at = text.indexOf(start);
  const end = text.indexOf(GITIGNORE_END, at);
  if (at >= 0 && end >= 0) {
    return `${text.slice(0, at)}${block}${text.slice(end + GITIGNORE_END.length)}`;
  }
  return `${text.trimEnd()}${text.trim() ? "\n\n" : ""}${block}\n`;
}

/** The .gitignore with its managed block replaced, the rest kept. */
export function updateGitignore(text: string, synced: string[]): string {
  return replaceBlock(text, GITIGNORE_START, gitignoreBlock(synced));
}

const DICTIONARIES_START =
  "# >>> mdSilo: dictionary files are not synced, unless chosen in the dictionaries";

/**
 * The .gitignore of the dictionary files: all their folders ignored but
 * those synced (by the folder name, the id of the dictionary), the rest of
 * the file kept.
 */
export function updateDictionariesGitignore(
  text: string,
  synced: string[],
): string {
  const lines = [DICTIONARIES_START, "/*/"];
  for (const dir of [...synced].sort()) lines.push(`!/${escapePath(dir)}/`);
  lines.push(GITIGNORE_END);
  return replaceBlock(text, DICTIONARIES_START, lines.join("\n"));
}
