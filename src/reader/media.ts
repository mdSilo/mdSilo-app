/**
 * The images and tables of the pages, to zoom in on (ported from readup:
 * iframeEventHandlers.ts and documentImages.ts).
 */

/** An image of the book, to show alone; or a table, as its HTML. */
export type Media = { type: 'image'; src: string; alt: string } | { type: 'table'; html: string };

const XLINK = 'http://www.w3.org/1999/xlink';

/** The image drawn by an <svg>, as most covers and illustrations are. */
const svgImageOf = (svg: Element) => {
  const image = svg.querySelector('image');
  return image?.getAttribute('href') || image?.getAttributeNS(XLINK, 'href') || '';
};

/** The description of an image: its alt, or else its title. */
const altOf = (img: Element) => (img.getAttribute('alt')?.trim() || img.getAttribute('title')?.trim() || '');

/** The description of an svg image: its <title>, or its label. */
const svgAltOf = (svg: Element) => (svg.querySelector('title')?.textContent?.trim() || svg.getAttribute('aria-label')?.trim() || '');

/** A link to a note, as foliate-js tells them (footnotes.js): it shows the note, not a picture. */
const isNoteRef = (a: Element) => {
  const types = `${a.getAttributeNS('http://www.idpf.org/2007/ops', 'type') ?? ''} ${a.getAttribute('epub:type') ?? ''}`;
  const role = a.getAttribute('role') ?? '';
  return /\b(noteref|biblioref|glossref)\b/.test(types) || /\bdoc-(noteref|biblioref|glossref)\b/.test(role);
};

/**
 * The image or table under a click, if any. A note mark is a link to its
 * footnote, not a picture to zoom; an image in another link zooms, as
 * readup does. A link in a table is followed.
 */
export function mediaAt(target: EventTarget | null): Media | null {
  const el = target as Element | null;
  if (!el?.closest || el.closest('sup')) return null;
  const link = el.closest('a[href]');
  if (link && isNoteRef(link)) return null;
  if (el.localName === 'img') {
    const img = el as HTMLImageElement;
    return img.src ? { type: 'image', src: img.src, alt: altOf(img) } : null;
  }
  const svg = el.closest('svg');
  const href = svg ? svgImageOf(svg) : '';
  if (svg && href) return { type: 'image', src: href, alt: svgAltOf(svg) };
  const table = el.closest('table');
  if (table && !link) return { type: 'table', html: table.outerHTML };
  return null;
}

/**
 * The image or table fills half the page or more: a cover, a page of
 * illustration. A click on its sides turns the page, as on the text.
 */
export function fillsPage(target: EventTarget | null): boolean {
  const el = (target as Element | null)?.closest?.('img, svg, table');
  if (!el) return false;
  const { style } = el.ownerDocument.documentElement;
  const page = parseFloat(style.getPropertyValue('--available-width')) * parseFloat(style.getPropertyValue('--available-height'));
  const { width, height } = el.getBoundingClientRect();
  return page > 0 && width * height >= page / 2;
}

/** The images of the sections shown, in their order: to page through them. */
export function imagesOf(contents: { doc: Document }[]): Extract<Media, { type: 'image' }>[] {
  const images: Extract<Media, { type: 'image' }>[] = [];
  for (const { doc } of contents) {
    for (const el of Array.from(doc.querySelectorAll('img, svg'))) {
      if (el.localName === 'img') {
        const img = el as HTMLImageElement;
        if (img.src) images.push({ type: 'image', src: img.src, alt: altOf(img) });
      } else if (!el.parentElement?.closest('svg')) {
        const href = svgImageOf(el);
        if (href) images.push({ type: 'image', src: href, alt: svgAltOf(el) });
      }
    }
  }
  return images;
}

/** The attribute holding the caption of an image on the page, shown by `captionStyles`. */
export const CAPTION_ATTR = 'data-mdsilo-caption';

/** A description worth reading: not a file name, a number or a word such as "image". */
export const isDescriptive = (alt: string) =>
  alt.length > 1
  && !/\.(png|jpe?g|gif|svg|webp|bmp|tiff?|avif)$/i.test(alt)
  && !/^(image|img|picture|pic|photo|figure|fig|cover|illustration|graphic|logo|icon|untitled|null|undefined|[\d\s._-]+)$/i.test(alt);

const normalize = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();

/** The text of an element, but the <title> of an svg: no words of its own on the page. */
const textOf = (el: Element) => {
  let text = '';
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.parentElement?.closest('svg')) text += node.textContent ?? '';
  }
  return text.trim();
};

/** The images, an <img> or an <svg> drawing one, not in another svg. */
const imagesIn = (root: Element) =>
  Array.from(root.querySelectorAll('img, svg')).filter((el) => el.localName === 'img' ? (el as HTMLImageElement).src : !el.parentElement?.closest('svg') && svgImageOf(el));

/** The book has a caption for the image already, before or after it. */
const hasCaption = (el: Element, block: Element, alt: string) => {
  if (el.closest('figure')?.querySelector('figcaption')) return true;
  const said = normalize(alt);
  return [block.previousElementSibling, block.nextElementSibling].some((near) => {
    if (!near) return false;
    const looks = `${near.localName} ${near.getAttribute('class') ?? ''} ${near.getAttribute('epub:type') ?? ''}`;
    const text = normalize(textOf(near));
    return /caption/i.test(looks) || (text.length > 0 && (text.includes(said) || said.includes(text)));
  });
};

/**
 * The descriptions of the images of a section, to show below them: in an
 * attribute of the block of each image, shown by CSS. No node is added to the
 * book, so the CFIs of the annotations, the search and the speech stay as
 * they are. An image in a line of text has no room below it: no caption.
 * Returns the captions set.
 */
export function markCaptions(doc: Document): number {
  let marked = 0;
  for (const el of imagesIn(doc.body ?? doc.documentElement)) {
    const alt = el.localName === 'img' ? altOf(el) : svgAltOf(el);
    if (!isDescriptive(alt)) continue;
    // the outermost block of the image alone: no text, no other image
    let block: Element | null = null;
    for (let up = el.parentElement; up && up !== doc.body && up !== doc.documentElement; up = up.parentElement) {
      if (textOf(up) || imagesIn(up).length > 1) break;
      block = up;
    }
    if (!block || hasCaption(el, block, alt)) continue;
    block.setAttribute(CAPTION_ATTR, alt);
    marked++;
  }
  return marked;
}

/** The captions of the images, below them as the book's small print, aligned as the image in its block. */
export const captionStyles = () => `
  [${CAPTION_ATTR}]::after {
    content: attr(${CAPTION_ATTR});
    display: block;
    margin-top: 0.4em;
    font-size: 0.85em;
    font-style: italic;
    line-height: 1.4;
    text-indent: 0;
    opacity: 0.75;
  }
`;
