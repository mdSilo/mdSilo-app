import type { HighlightColor, HighlightStyle } from './annotations';
import type { CodeLanguage } from './highlight';

/** The colors of the pages: of the app theme, or of paper. */
export type PageTheme = 'auto' | 'light' | 'sepia' | 'gray' | 'dark';

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
  /** the pages slide as they turn */
  animated: boolean;
  /** a click on the left or right of the page turns it */
  clickToTurn: boolean;
  /** a click on the left goes forward */
  swapClickArea: boolean;
  /** the chapter above the text, the progress below it */
  showHeader: boolean;
  showFooter: boolean;
  /** the panel of contents and notes; on mobile it starts hidden */
  showSidebar: boolean;
  /** the highlight made by the toolbar, and the color of each style */
  highlightStyle: HighlightStyle;
  highlightColors: Record<HighlightStyle, HighlightColor>;
  /** text-to-speech: voice name, rate */
  ttsVoice: string;
  ttsRate: number;
  /** target language of translations, e.g. en, zh-CN */
  translateTo: string;
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
  animated: true,
  clickToTurn: true,
  swapClickArea: false,
  showHeader: true,
  showFooter: true,
  showSidebar: true,
  highlightStyle: 'highlight',
  highlightColors: { highlight: 'yellow', underline: 'green', squiggly: 'blue' },
  ttsVoice: '',
  ttsRate: 1,
  translateTo: '',
};

/** The settings not about the look of the pages, kept on a reset. */
export const KEPT_ON_RESET = [
  'showSidebar', 'highlightStyle', 'highlightColors', 'ttsVoice', 'ttsRate', 'translateTo',
] as const;

/** The settings stored, completed with the defaults (new settings, older versions). */
export const withDefaults = (settings?: Partial<ReaderSettings>): ReaderSettings => ({
  ...DEFAULT_READER_SETTINGS,
  ...(settings ?? {}),
  highlightColors: { ...DEFAULT_READER_SETTINGS.highlightColors, ...(settings?.highlightColors ?? {}) },
});
