import { create } from "zustand";

/**
 * A text quoted in a book, to mark when the book opens there: the place of a
 * shared link (see library/sharedBook.ts). Marked in the page while the book
 * is open, not kept as a highlight.
 */
export const useQuoteMark = create<{ cfi?: string }>(() => ({}));

/** The book is about to open at a text quoted: mark it there. */
export const markQuote = (cfi?: string) => useQuoteMark.setState({ cfi });

/** The place gone to is the text quoted: true once, then forgotten. */
export function takeQuoteMark(cfi: string): boolean {
  if (useQuoteMark.getState().cfi !== cfi) return false;
  useQuoteMark.setState({ cfi: undefined });
  return true;
}
