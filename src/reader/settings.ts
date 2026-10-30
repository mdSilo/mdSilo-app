import type { HighlightColor, HighlightStyle } from './annotations';
import type { CodeLanguage } from './highlight';

/** The colors of the pages: of the app theme, or of paper. */
export type PageTheme = 'auto' | 'light' | 'sepia' | 'gray' | 'dark';

/**
 * The writing of a book, chosen for it: as the book says; across, left to
 * right; down, the lines right to left or left to right; across, right to left.
 */
export type WritingMode = 'auto' | 'horizontal-tb' | 'vertical-rl' | 'vertical-lr' | 'horizontal-rtl';

/** How books are shown, for all books; kept with the user settings. */
export type ReaderSettings = {
  /** px */
  fontSize: number;
  lineHeight: number;
  /** the font of the text: as the book says, or one of the app */
  font: 'book' | 'serif' | 'sans-serif';
  justify: boolean;
  hyphenate: boolean;
  /** page by page, or one long scroll */
  flow: 'paginated' | 'scrolled';
  /** columns side by side, if wide enough */
  maxColumns: number;
  /** px, the width of a column */
  maxInlineSize: number;
  /** % of the width, between the columns and on the sides */
  gap: number;
  /** px, above and below the text */
  margin: number;
  pageTheme: PageTheme;
  /** the images in negative, e.g. black diagrams on a dark page */
  invertImages: boolean;
  /** the description of an image below it, on the page */
  imageCaptions: boolean;
  /** the code blocks colored, in a language or guessed */
  codeHighlight: boolean;
  codeLanguage: CodeLanguage;
  /** a fixed layout (PDF, comics): the page fit to the view, or to its width */
  zoomMode: 'fit-page' | 'fit-width';
  /** %, of the fit; a fixed layout */
  zoomLevel: number;
  /** a fixed layout: two pages side by side if wide enough, or one */
  spreadMode: 'auto' | 'none';
  /** a fixed layout in spreads: the cover alone, the pages after it in pairs */
  separateCover: boolean;
  /** a fixed layout scrolled: the pages one below the other, or side by side */
  scrollDirection: 'vertical' | 'horizontal';
  /** a fixed layout scrolled down: no gaps between the pages, a strip of a webtoon */
  webtoon: boolean;
  /** a fixed layout: a touch moves the page up and down only, its sides cut off by the zoom stay so */
  lockPanX: boolean;
  /** the pages slide as they turn */
  animated: boolean;
  /** a click on the left or right of the page turns it */
  clickToTurn: boolean;
  /** a click on the left goes forward */
  swapClickArea: boolean;
  /** the chapter above the text, the progress below it */
  showHeader: boolean;
  showFooter: boolean;
  /** written down the page: a double border around the text, as books printed so */
  doubleBorder: boolean;
  /** the panel of contents and notes; on mobile it starts hidden */
  showSidebar: boolean;
  /** the highlight made by the toolbar, and the color of each style */
  highlightStyle: HighlightStyle;
  highlightColors: Record<HighlightStyle, HighlightColor>;
  /** read aloud: the engine ('' the system's, else the browser's), the voice chosen for each engine, the rate */
  ttsEngine: string;
  ttsVoices: Record<string, string>;
  ttsRate: number;
  /** translations: the service and the target language (e.g. en, zh-CN), as chosen last in the popup */
  translator: string;
  translateTo: string;
  /** a book translated: the translation in place of the text, not under it */
  translationOnly: boolean;
};

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontSize: 18,
  lineHeight: 1.6,
  font: 'book',
  justify: true,
  hyphenate: true,
  flow: 'paginated',
  maxColumns: 2,
  maxInlineSize: 720,
  gap: 6,
  margin: 44,
  pageTheme: 'auto',
  invertImages: false,
  imageCaptions: true,
  codeHighlight: false,
  codeLanguage: 'auto',
  zoomMode: 'fit-page',
  zoomLevel: 100,
  spreadMode: 'auto',
  separateCover: true,
  scrollDirection: 'vertical',
  webtoon: false,
  lockPanX: false,
  animated: true,
  clickToTurn: true,
  swapClickArea: false,
  showHeader: true,
  showFooter: true,
  doubleBorder: true,
  showSidebar: true,
  highlightStyle: 'highlight',
  highlightColors: { highlight: 'yellow', underline: 'green', squiggly: 'blue' },
  ttsEngine: '',
  ttsVoices: {},
  ttsRate: 1,
  translator: 'google',
  translateTo: '',
  translationOnly: false,
};

/** %, the zoom of a fixed layout: the least, the most, a step */
export const MIN_ZOOM = 50;
export const MAX_ZOOM = 500;
export const ZOOM_STEP = 10;

/** The zoom of a fixed layout, steps (or a part of one, by the wheel) in or out, within the bounds. */
export const zoomBy = (level: number, steps: number) =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(level + steps * ZOOM_STEP)));

/** The settings not about the look of the pages, kept on a reset. */
export const KEPT_ON_RESET = [
  'showSidebar', 'highlightStyle', 'highlightColors', 'ttsEngine', 'ttsVoices', 'ttsRate', 'translator', 'translateTo',
] as const;

/**
 * The settings about the look of the pages, as a key: a change of the others
 * (a translation's language, the highlight remembered) lays nothing out again.
 */
export const lookKey = (settings: ReaderSettings) =>
  JSON.stringify({ ...settings, ...Object.fromEntries(KEPT_ON_RESET.map((key) => [key, undefined])) });

/** The settings stored, completed with the defaults (new settings, older versions). */
export const withDefaults = (settings?: Partial<ReaderSettings> & { ttsVoice?: string }): ReaderSettings => {
  // the voice of the browser, before the engines
  const { ttsVoice, ...rest } = settings ?? {};
  return {
    ...DEFAULT_READER_SETTINGS,
    ...rest,
    highlightColors: { ...DEFAULT_READER_SETTINGS.highlightColors, ...(settings?.highlightColors ?? {}) },
    ttsVoices: rest.ttsVoices ?? (ttsVoice ? { web: ttsVoice } : {}),
  };
};
