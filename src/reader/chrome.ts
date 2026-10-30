import { create } from 'zustand';

type ReaderChrome = {
  /** the header and footer bars over the book, shown on hover or a tap in the middle */
  barsVisible: boolean;
  /** a menu of a bar is open: the bars stay */
  menuOpen: boolean;
  /** the tab of the sidebar */
  tab: string;
  /** a search asked from the text selected, run by the search tab */
  searchRequest?: { query: string; seq: number };
  /** the dialog to make the translated book, open */
  translatedBook: boolean;
  setBarsVisible: (visible: boolean) => void;
  setMenuOpen: (open: boolean) => void;
  setTab: (tab: string) => void;
  requestSearch: (query: string) => void;
  setTranslatedBook: (open: boolean) => void;
};

let searchSeq = 0;

/** The parts of the reader around the pages. */
export const useReaderChrome = create<ReaderChrome>((set) => ({
  barsVisible: false,
  menuOpen: false,
  tab: 'toc',
  translatedBook: false,
  setBarsVisible: (barsVisible) => set({ barsVisible }),
  setMenuOpen: (menuOpen) => set({ menuOpen }),
  setTab: (tab) => set({ tab }),
  requestSearch: (query) => set({ tab: 'search', searchRequest: { query, seq: ++searchSeq } }),
  setTranslatedBook: (translatedBook) => set({ translatedBook }),
}));

export const resetReaderChrome = () =>
  useReaderChrome.setState({ barsVisible: false, menuOpen: false, tab: 'toc', searchRequest: undefined, translatedBook: false });
