/**
 * A quote of a book dragged to a drawing (see reader/actions quoteMarkdown):
 * its text, and the link back to the book for the element.
 *
 *   > line one
 *   > line two
 *   >
 *   > — [Alice](book:abc#epubcfi(...))
 */
export function quoteOfMarkdown(md: string): { text: string; link?: string } {
  const lines = md.split(/\r?\n/).map((line) => line.replace(/^>\s?/, ""));
  let link: string | undefined;
  const last = lines.length - 1;
  const source = /^—\s*\[([^\]]*)\]\(([^)\s]+(?:\([^)]*\))?[^)\s]*)\)\s*$/.exec(
    lines[last] ?? "",
  );
  if (source) {
    lines[last] = `— ${source[1]}`;
    link = source[2];
  }
  const text = lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return link ? { text, link } : { text };
}
