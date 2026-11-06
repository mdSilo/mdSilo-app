import type { BookDoc } from "./document";

/**
 * The text of a book as blocks, in order: paragraphs, headings, items of
 * lists, cells... each with its CFI, from a place on, across its sections.
 * For plugins (`reader.blocks`): to read a book a word or a paragraph at a
 * time, say. Of the sections as written, not as shown.
 */
export type TextBlock = { cfi: string; text: string };

const BLOCK_TAGS = [
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "dt",
  "dd",
  "blockquote",
  "pre",
  "figcaption",
  "caption",
  "td",
  "th",
  "address",
  "div",
  "section",
  "article",
  "aside",
];
const BLOCKS = BLOCK_TAGS.join(",");

/** The text of an element: words of <br> lines apart, spaces as one */
function textOf(el: Element): string {
  let out = "";
  const walk = (node: Node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) out += child.nodeValue ?? "";
      else if (child.nodeType === Node.ELEMENT_NODE) {
        const name = (child as Element).localName;
        if (name === "br") out += " ";
        // ruby annotations, scripts and styles are not read
        else if (!["rt", "rp", "script", "style"].includes(name)) walk(child);
      }
    }
  };
  walk(el);
  return out.replace(/\s+/g, " ").trim();
}

/** The blocks of text of a document: those with no block in them, not empty */
export function blocksOf(doc: Document): Element[] {
  const body = doc.body ?? doc.documentElement;
  if (!body) return [];
  return [...body.querySelectorAll(BLOCKS)].filter(
    (el) => !el.querySelector(BLOCKS) && textOf(el),
  );
}

/** The node a place is at: of a range, its start */
const startOf = (anchor: Range | Element | null | undefined): Node | null =>
  !anchor ? null : "startContainer" in anchor ? anchor.startContainer : anchor;

/** The first block at the node or after it */
function firstFrom(blocks: Element[], node: Node | null): number {
  if (!node) return 0;
  const i = blocks.findIndex(
    (el) =>
      el === node ||
      el.contains(node) ||
      // the block comes after the node
      Boolean(
        node.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
  );
  return i < 0 ? blocks.length : i;
}

/** What reads blocks: the book and how its CFIs are made, as foliate's view */
export type BlockReader = {
  book: BookDoc;
  getCFI: (index: number, range?: Range) => string;
  resolveNavigation: (
    target: string,
  ) =>
    | { index: number; anchor?: (doc: Document) => Range | Element | null }
    | undefined;
};

/** the most blocks given at once */
export const MAX_BLOCKS = 500;
/** the most sections looked through at once, for blocks: empty ones are skipped */
const MAX_SECTIONS = 40;

/**
 * `count` blocks of text from the place `from` (a CFI) on, and the CFI of
 * the block after them, to go on from; none at the end of the book.
 */
export async function readBlocks(
  reader: BlockReader,
  from: string,
  count = 50,
): Promise<{ blocks: TextBlock[]; next?: string }> {
  const want = Math.max(1, Math.min(MAX_BLOCKS, Math.floor(count)));
  const target = reader.resolveNavigation(from);
  if (!target) throw new Error(`Not a place in the book: ${from}`);
  const { sections } = reader.book;
  const found: TextBlock[] = [];
  let index = target.index;
  let first = true;
  for (
    let looked = 0;
    index < sections.length && looked < MAX_SECTIONS && found.length <= want;
    index++, looked++
  ) {
    const section = sections[index];
    if (!section?.createDocument || section.linear === "no") {
      first = false;
      continue;
    }
    const doc = await section.createDocument();
    const blocks = blocksOf(doc);
    const start = first ? firstFrom(blocks, startOf(target.anchor?.(doc))) : 0;
    first = false;
    for (let i = start; i < blocks.length && found.length <= want; i++) {
      const range = doc.createRange();
      range.selectNodeContents(blocks[i]);
      found.push({ cfi: reader.getCFI(index, range), text: textOf(blocks[i]) });
    }
  }
  // one more was read: where to go on from; or the section not looked at yet
  const next =
    found.length > want
      ? found.pop()?.cfi
      : index < sections.length
        ? reader.getCFI(index)
        : undefined;
  return next ? { blocks: found, next } : { blocks: found };
}
