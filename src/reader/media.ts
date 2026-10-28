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

/**
 * The image or table under a click, if any. A note mark is a link to its
 * footnote, not a picture to zoom.
 */
export function mediaAt(target: EventTarget | null): Media | null {
  const el = target as Element | null;
  if (!el?.closest || el.closest('sup')) return null;
  if (el.localName === 'img') {
    const img = el as HTMLImageElement;
    return img.src ? { type: 'image', src: img.src, alt: (img.alt || '').trim() } : null;
  }
  const svg = el.closest('svg');
  const href = svg ? svgImageOf(svg) : '';
  if (svg && href) return { type: 'image', src: href, alt: (svg.querySelector('title')?.textContent || '').trim() };
  const table = el.closest('table');
  if (table) return { type: 'table', html: table.outerHTML };
  return null;
}

/**
 * The image or table fills half the page or more: a cover, a page of
 * illustration. A click on it turns the page, as on the text.
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
        if (img.src) images.push({ type: 'image', src: img.src, alt: (img.alt || '').trim() });
      } else if (!el.parentElement?.closest('svg')) {
        const href = svgImageOf(el);
        if (href) images.push({ type: 'image', src: href, alt: (el.querySelector('title')?.textContent || '').trim() });
      }
    }
  }
  return images;
}
