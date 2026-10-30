import type { PageTheme, ReaderSettings } from './settings';
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

export function bookStyles(settings: ReaderSettings, colors: ThemeColors): string {
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
  `;
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

/** A fixed layout: the zoom and the spreads, as set; each change renders the pages again, so only a change. */
function applyFixedLayout(view: FoliateView, settings: ReaderSettings) {
  const { renderer, book } = view;
  const set = (name: string, value: string) => {
    if (renderer.getAttribute(name) !== value) renderer.setAttribute(name, value);
  };
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

/** The layout of the pages, as set: the flow, the columns, the margins; the zoom and spreads of a fixed layout. */
export function applyLayout(view: FoliateView, settings: ReaderSettings) {
  const { renderer } = view;
  renderer.toggleAttribute('animated', settings.animated);
  if (view.isFixedLayout) {
    renderer.setAttribute('flow', settings.flow === 'scrolled' ? 'scrolled' : 'paginated');
    applyFixedLayout(view, settings);
    return;
  }
  renderer.setAttribute('flow', settings.flow);
  renderer.setAttribute('max-column-count', String(settings.maxColumns));
  renderer.setAttribute('max-inline-size', `${settings.maxInlineSize}px`);
  renderer.setAttribute('gap', `${settings.gap}%`);
  // room for the chapter and the progress, in the margins; scrolled, the view is between them
  const margin = settings.flow === 'scrolled' ? 0 : settings.margin;
  for (const side of ['top', 'bottom']) renderer.setAttribute(`margin-${side}`, `${margin}px`);
}
