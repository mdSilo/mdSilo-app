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
  ttsVoice: '',
  ttsRate: 1,
  translateTo: '',
};

/** The settings stored, completed with the defaults (new settings, older versions). */
export const withDefaults = (settings?: Partial<ReaderSettings>): ReaderSettings => ({
  ...DEFAULT_READER_SETTINGS,
  ...(settings ?? {}),
});
