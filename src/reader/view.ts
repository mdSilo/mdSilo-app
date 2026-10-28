import { create } from 'zustand';
import type { BookDoc } from './document';

/** The `foliate-view` element of foliate-js (packages/foliate-js/view.js). */
export interface FoliateRenderer extends HTMLElement {
  setStyles?: (css: string) => void;
  getContents: () => { doc: Document; index?: number }[];
  primaryIndex: number;
  next: (distance?: number) => Promise<void>;
  prev: (distance?: number) => Promise<void>;
  prevSection?: () => Promise<unknown>;
  nextSection?: () => Promise<unknown>;
  /** a section, and a place in it: a fraction of it */
  goTo?: (target: { index: number; anchor?: number }) => Promise<void>;
  /** flow="scrolled" */
  scrolled?: boolean;
  /** px, the size of a page */
  size?: number;
  /** the page in the section shown, and its pages; not in a fixed layout */
  page?: number;
  pages?: number;
  atStart?: boolean;
  atEnd?: boolean;
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
  prev: (distance?: number) => Promise<void>;
  next: (distance?: number) => Promise<void>;
  getCFI: (index: number, range?: Range) => string;
  resolveNavigation: (target: string) => { index: number; anchor?: (doc: Document) => Range | Element | null } | undefined;
  addAnnotation: (annotation: { value: string; [key: string]: unknown }, remove?: boolean) => Promise<unknown>;
  deleteAnnotation: (annotation: { value: string }) => Promise<unknown>;
  search: (opts: { query: string; index?: number; matchCase?: boolean; matchDiacritics?: boolean; matchWholeWords?: boolean }) => AsyncGenerator<SearchResult>;
  clearSearch: () => void;
  initTTS: (granularity?: 'word' | 'sentence', nodeFilter?: unknown, highlight?: (range: Range) => void) => Promise<void>;
  deselect: () => void;
  history: { back: () => void; forward: () => void; canGoBack: boolean; canGoForward: boolean };
}

/** The book read, or the book beside it (parallel reading). */
export type Pane = 'main' | 'side';

/** The pane last used: the text selected, the keys, the sidebar act on its book. */
export const usePane = create<{ active: Pane }>(() => ({ active: 'main' }));
export const activePane = () => usePane.getState().active;
export const setActivePane = (active: Pane) => {
  if (usePane.getState().active !== active) usePane.setState({ active });
};

const views: Record<Pane, FoliateView | null> = { main: null, side: null };

/** The view of a book open, for the panels to act on it: of the pane last used by default. */
export const getView = (pane: Pane = activePane()) => views[pane];
export const setView = (view: FoliateView | null, pane: Pane = 'main') => {
  views[pane] = view;
  // the book beside closed: back to the book read
  if (!view && pane === 'side') setActivePane('main');
};
