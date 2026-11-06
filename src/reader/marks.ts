import { create } from "zustand";
import type { HighlightColor } from "./annotations/annotations";
import type { Pane } from "./view";

/**
 * Marks over the text of the book open, not kept: of a plugin (`reader.mark`,
 * e.g. the paragraph read), or of the text quoted by a shared link. Drawn by
 * the viewer of their pane while its book is open; gone when it closes.
 */
export type ReaderMark = {
  /** a range of text, as an EPUB CFI */
  cfi: string;
  color: HighlightColor;
  /** who made it, to take its marks back: a plugin id, or "quote" */
  owner: string;
  pane: Pane;
};

export const useMarks = create<{ marks: ReaderMark[] }>(() => ({ marks: [] }));

/** Marks the text; the same text again by the same owner only changes color */
export function addMark(mark: ReaderMark) {
  const marks = useMarks
    .getState()
    .marks.filter(
      (m) =>
        !(m.cfi === mark.cfi && m.owner === mark.owner && m.pane === mark.pane),
    );
  useMarks.setState({ marks: [...marks, mark] });
}

/** Takes back the marks of an owner, or those of a pane (its book closed) */
export function clearMarks(by: { owner?: string; pane?: Pane }) {
  const marks = useMarks
    .getState()
    .marks.filter(
      (m) =>
        !(
          (by.owner === undefined || m.owner === by.owner) &&
          (by.pane === undefined || m.pane === by.pane)
        ),
    );
  if (marks.length !== useMarks.getState().marks.length)
    useMarks.setState({ marks });
}
