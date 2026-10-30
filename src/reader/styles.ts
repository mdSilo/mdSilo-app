import type { PageTheme, ReaderSettings, WritingMode } from './settings';
import { ttsStyles } from './tts';
import { codeStyles } from './highlight';
import { captionStyles } from './media';
import type { FoliateView } from './view';
import type { BookDoc, SectionItem } from './document';

/**
 * The CSS set in the pages of a book (foliate-js renderer `setStyles`),
 * trimmed from the styles of readup: the font and the paragraphs as set,
 * the colors of the app theme.
 */

export type ThemeColors = { bg: string; fg: string; primary: string; dark: boolean };

/** The colors of paper, for the page themes not of the app. */
const PAGE_THEMES: Record<Exclude<PageTheme, 'auto'>, ThemeColors> = {
  light: { bg: '#ffffff', fg: '#1f2328', primary: '#2563eb', dark: false },
  sepia: { bg: '#f4ecd8', fg: '#5b4636', primary: '#9a5b13', dark: false },
  gray: { bg: '#e6e6e6', fg: '#262626', primary: '#2563eb', dark: false },
  dark: { bg: '#1c1c1e', fg: '#cfcfcf', primary: '#93c5fd', dark: true },
};

/** The colors of the pages: of the page theme, or of the daisyUI theme applied on <html>. */
export function themeColors(dark: boolean, pageTheme: PageTheme = 'auto'): ThemeColors {
  if (pageTheme !== 'auto') return PAGE_THEMES[pageTheme];
  const style = getComputedStyle(document.documentElement);
  const color = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    bg: color('--color-base-100', dark ? '#1d232a' : '#ffffff'),
    fg: color('--color-base-content', dark ? '#d1d5db' : '#1f2937'),
    primary: color('--color-primary', dark ? '#93c5fd' : '#2563eb'),
    dark,
  };
}

const SERIF = `'Literata', 'Georgia', 'Noto Serif', 'Songti SC', 'Noto Serif CJK SC', serif`;
const SANS = `'Inter', 'Helvetica Neue', 'Noto Sans', 'PingFang SC', 'Noto Sans CJK SC', sans-serif`;

export function bookStyles(settings: ReaderSettings, colors: ThemeColors, writingMode: WritingMode = 'auto'): string {
  const { fontSize, lineHeight, font, justify, hyphenate, invertImages, imageCaptions, codeHighlight } = settings;
  const family = font === 'serif' ? SERIF : font === 'sans-serif' ? SANS : '';
  const { bg, fg, primary, dark } = colors;
  return `
    @namespace epub "http://www.idpf.org/2007/ops";
    html {
      color-scheme: ${dark ? 'dark' : 'light'};
      --theme-bg-color: ${bg};
      --theme-fg-color: ${fg};
      font-size: ${fontSize}px !important;
      -webkit-text-size-adjust: none;
      text-size-adjust: none;
      hanging-punctuation: allow-end last;
      orphans: 2;
      widows: 2;
    }
    html, body {
      color: ${fg};
      background: transparent;
      ${family ? `font-family: ${family};` : ''}
    }
    body {
      font-size: 1rem;
      line-height: ${lineHeight};
      text-align: ${justify ? 'justify' : 'start'};
      -webkit-hyphens: ${hyphenate ? 'auto' : 'manual'};
      hyphens: ${hyphenate ? 'auto' : 'manual'};
      overflow-wrap: break-word;
      padding: unset;
      margin: unset;
    }
    ${family ? `body *:not(pre, code, kbd, pre *, code *, kbd *) { font-family: inherit !important; }` : ''}
    p, li, blockquote, dd {
      line-height: ${lineHeight};
    }
    p:has(> img:only-child), [align="center"], .center { text-indent: initial; }
    a:any-link { color: ${dark ? primary : 'inherit'}; text-decoration: ${dark ? 'none' : 'underline'}; }
    img, svg { max-width: 100%; height: auto; object-fit: contain; }
    ${invertImages ? 'img, svg image { filter: invert(1); }' : dark ? 'img { filter: brightness(0.9); }' : ''}
    pre, code { white-space: pre-wrap !important; font-size: 0.9em; }
    table { max-width: 100%; }
    td, th { overflow-wrap: break-word; }
    /* hardcoded black text, invisible on a dark page */
    ${dark ? `
    [style*="color: #000"], [style*="color:#000"], [style*="color: black"],
    [style*="color:black"], font[color="#000000"], font[color="black"] {
      color: ${fg} !important;
    }
    [style*="background-color: #fff"], [style*="background-color:#fff"],
    [style*="background-color: white"], [style*="background: white"] {
      background-color: ${bg} !important;
    }
    blockquote { background: color-mix(in srgb, ${bg} 85%, #000); }` : ''}
    /* footnotes are shown on click, not in the text */
    aside[epub|type~="footnote"], aside[epub|type~="endnote"],
    aside[epub|type~="note"], aside[epub|type~="rearnote"] {
      display: none;
    }
    ::selection { background: color-mix(in srgb, ${primary} 35%, transparent); }
    ${codeHighlight ? codeStyles(dark) : ''}
    ${imageCaptions ? captionStyles() : ''}
    ${ttsStyles(primary)}
    ${writingModeStyles(writingMode)}
  `;
}

/** Written down the page, as chosen. */
export const isVerticalMode = (mode: WritingMode) => mode === 'vertical-rl' || mode === 'vertical-lr';

/** The CSS of the writing chosen for a book; none as the book says. */
export function writingModeStyles(mode: WritingMode): string {
  if (mode === 'auto') return '';
  const direction = mode === 'horizontal-rtl' ? 'rtl' : mode === 'horizontal-tb' ? 'ltr' : '';
  return `
    html, body {
      writing-mode: ${mode === 'horizontal-rtl' ? 'horizontal-tb' : mode} !important;
      ${direction ? `direction: ${direction} !important;` : ''}
    }
  `;
}

// the direction of the books as they say it, before a writing chosen
const bookDirs = new WeakMap<BookDoc, string | undefined>();

/** The direction of a book as it says it, before a writing chosen. */
export const bookDir = (book: BookDoc) => (bookDirs.has(book) ? bookDirs.get(book) : book.dir);

/** A fixed layout: of the writing chosen, only the direction its pages turn. */
export const pagesDirection = (mode: WritingMode): WritingMode =>
  mode === 'horizontal-rtl' || mode === 'horizontal-tb' ? mode : 'auto';

/**
 * The writing chosen for the pages of a fixed layout from right to left or
 * not: none, as the book says it already.
 */
export const rtlPagesMode = (book: BookDoc, rtl: boolean): WritingMode =>
  rtl === (bookDir(book) === 'rtl') ? 'auto' : rtl ? 'horizontal-rtl' : 'horizontal-tb';

/** Before a book opens: its pages turn as the writing chosen, or as the book says. */
export function setBookDir(book: BookDoc, mode: WritingMode) {
  if (!bookDirs.has(book)) bookDirs.set(book, book.dir);
  book.dir = mode === 'auto' ? bookDirs.get(book)
    : mode === 'vertical-rl' || mode === 'horizontal-rtl' ? 'rtl' : 'ltr';
}

export type Sides = { top: number; right: number; bottom: number; left: number };

/** px, written down the page: the double border from the sides of the view, its outer line and its inner one */
export const FRAME_OUTER = 12;
export const FRAME_INNER = 17;
/** px, the band of the chapter or of the progress, in the border */
export const FRAME_BAND = 32;
/** px, between the border and the text */
const FRAME_PAD = 12;
/** px, on the sides of the text, across the page */
const SIDE = 48;

const NONE: Sides = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Where the text is in the view of a book: the view inset in it (scrolled,
 * a fixed layout: between the chapter and the progress), and the margins of
 * the renderer. Across the page the chapter is above, the progress below;
 * down the page, the chapter on the right, the progress on the left.
 */
export function pageLayout(settings: ReaderSettings, vertical: boolean, fixed = false): { inset: Sides; margins: Sides } {
  const { margin } = settings;
  const scrolled = settings.flow === 'scrolled';
  if (!vertical) {
    return scrolled || fixed
      ? { inset: { ...NONE, top: margin, bottom: margin }, margins: { ...NONE, left: SIDE, right: SIDE } }
      : { inset: NONE, margins: { top: margin, right: SIDE, bottom: margin, left: SIDE } };
  }
  const border = settings.doubleBorder;
  const band = (shown: boolean) => (border ? FRAME_INNER + (shown ? FRAME_BAND : 0) + FRAME_PAD : margin);
  const left = band(settings.showFooter);
  const right = band(settings.showHeader);
  // down the page the renderer has 1.5 times the margins above and below
  const end = Math.round((border ? FRAME_INNER + FRAME_PAD : 16) / 1.5);
  return scrolled
    ? { inset: { ...NONE, left, right }, margins: { ...NONE, top: end, bottom: end } }
    : { inset: NONE, margins: { top: end, right, bottom: end, left } };
}

/** The highlight colors, as in the overlay of the book and in the app. */
export const HIGHLIGHT_CSS: Record<string, string> = {
  yellow: '#facc15',
  red: '#f87171',
  green: '#4ade80',
  blue: '#60a5fa',
  violet: '#a78bfa',
};

/** The side of the first spread the cover is on: alone (as the layout goes), or the page before the second. */
const coverSpread = (separate: boolean, rtl: boolean): NonNullable<SectionItem['pageSpread']> =>
  separate ? '' : rtl ? 'right' : 'left';

/** Before a fixed layout opens: its pages in spreads or one by one, the cover alone or not, as set. */
export function setSpread(book: BookDoc, settings: ReaderSettings) {
  if (book.rendition?.layout !== 'pre-paginated' || !book.sections.length) return;
  book.rendition.spread = settings.spreadMode;
  book.sections[0].pageSpread = coverSpread(settings.separateCover, book.dir === 'rtl');
}

/** The px between the pages of a fixed layout scrolled: none in a webtoon, else the default of foliate-js. */
const scrollGap = (settings: ReaderSettings) => (settings.webtoon ? '0' : '4');

/**
 * A fixed layout: the flow and its direction, the zoom, the spreads, as set;
 * each change renders the pages again, so only a change. The direction comes
 * before the flow: the strip of pages built once, on its axis.
 */
function applyFixedLayout(view: FoliateView, settings: ReaderSettings) {
  const { renderer, book } = view;
  const set = (name: string, value: string) => {
    if (renderer.getAttribute(name) !== value) renderer.setAttribute(name, value);
  };
  set('scroll-direction', settings.scrollDirection);
  set('scroll-gap', scrollGap(settings));
  if (renderer.hasAttribute('lock-pan-x') !== settings.lockPanX) renderer.toggleAttribute('lock-pan-x', settings.lockPanX);
  renderer.setAttribute('flow', settings.flow === 'scrolled' ? 'scrolled' : 'paginated');
  set('zoom', settings.zoomMode);
  set('scale-factor', String(settings.zoomLevel));
  const cover = book.sections[0];
  const side = coverSpread(settings.separateCover, book.dir === 'rtl');
  if (cover && (cover.pageSpread ?? '') !== side) {
    cover.pageSpread = side;
    // the spreads made again
    renderer.setAttribute('spread', settings.spreadMode);
  } else set('spread', settings.spreadMode);
}

/**
 * The layout of the pages, as set: the flow, the columns, the margins (of
 * the text written across or down); the zoom and spreads of a fixed layout.
 */
export function applyLayout(view: FoliateView, settings: ReaderSettings, vertical = false) {
  const { renderer } = view;
  renderer.toggleAttribute('animated', settings.animated);
  if (view.isFixedLayout) {
    applyFixedLayout(view, settings);
    return;
  }
  renderer.setAttribute('flow', settings.flow);
  renderer.setAttribute('max-column-count', String(settings.maxColumns));
  renderer.setAttribute('max-inline-size', `${settings.maxInlineSize}px`);
  renderer.setAttribute('gap', `${settings.gap}%`);
  // room for the chapter and the progress, in the margins; scrolled, the view is between them
  const { margins } = pageLayout(settings, vertical);
  for (const side of ['top', 'right', 'bottom', 'left'] as const) renderer.setAttribute(`margin-${side}`, `${margins[side]}px`);
}
