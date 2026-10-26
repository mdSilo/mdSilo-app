import type { BookDoc } from './document';

/** The `foliate-view` element of foliate-js (packages/foliate-js/view.js). */
export interface FoliateRenderer extends HTMLElement {
  setStyles?: (css: string) => void;
  getContents: () => { doc: Document; index?: number }[];
  primaryIndex: number;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  scrollToAnchor?: (anchor: Range | number, smooth?: boolean) => void;
}

export type SearchMatch = { cfi: string; cfis?: string[]; excerpt: { pre: string; match: string; post: string } };
export type SearchResult =
  | { index: number; label: string; subitems: SearchMatch[] }
  | { progress: number }
  | SearchMatch
  | 'done';

export interface TTSApi {
  doc: Document;
  start: () => string | undefined;
  resume: () => string | undefined;
  next: (paused?: boolean) => string | undefined;
  prev: (paused?: boolean) => string | undefined;
  from: (range: Range) => string | undefined;
  setMark: (mark: string) => void;
}

export interface FoliateView extends HTMLElement {
  book: BookDoc;
  renderer: FoliateRenderer;
  isFixedLayout: boolean;
  language?: { canonical?: string; isCJK?: boolean };
  lastLocation?: { cfi?: string; fraction?: number };
  tts?: TTSApi | null;
  open: (book: BookDoc) => Promise<void>;
  close: () => void;
  init: (options: { lastLocation?: string; showTextStart?: boolean }) => Promise<void>;
  goTo: (target: string | number) => Promise<unknown>;
  goToFraction: (fraction: number) => Promise<void>;
  goLeft: () => Promise<void>;
  goRight: () => Promise<void>;
  prev: () => Promise<void>;
  next: () => Promise<void>;
  getCFI: (index: number, range?: Range) => string;
  addAnnotation: (annotation: { value: string; [key: string]: unknown }, remove?: boolean) => Promise<unknown>;
  deleteAnnotation: (annotation: { value: string }) => Promise<unknown>;
  search: (opts: { query: string; index?: number; matchCase?: boolean; matchDiacritics?: boolean; matchWholeWords?: boolean }) => AsyncGenerator<SearchResult>;
  clearSearch: () => void;
  initTTS: (granularity?: 'word' | 'sentence', nodeFilter?: unknown, highlight?: (range: Range) => void) => Promise<void>;
  deselect: () => void;
  history: { back: () => void; forward: () => void; canGoBack: boolean; canGoForward: boolean };
}

let current: FoliateView | null = null;

/** The view of the book open, for the panels to act on it. */
export const getView = () => current;
export const setView = (view: FoliateView | null) => {
  current = view;
};
