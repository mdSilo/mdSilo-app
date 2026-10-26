import type { ReaderSettings } from './settings';
import { ttsStyles } from './tts';

/**
 * The CSS set in the pages of a book (foliate-js renderer `setStyles`),
 * trimmed from the styles of readup: the font and the paragraphs as set,
 * the colors of the app theme.
 */

export type ThemeColors = { bg: string; fg: string; primary: string; dark: boolean };

/** The colors of the daisyUI theme applied on <html>. */
export function themeColors(dark: boolean): ThemeColors {
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
  const { fontSize, lineHeight, font, justify, hyphenate } = settings;
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
    ${dark ? 'img { filter: brightness(0.9); }' : ''}
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
