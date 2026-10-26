import { create } from 'zustand';

/** A box on the screen, in the coordinates of the window. */
export type Box = { left: number; top: number; right: number; bottom: number };

export type TextSelection = {
  text: string;
  cfi: string;
  /** the section of the book */
  index: number;
  box: Box;
  /** the range selected, while the section is shown */
  range?: Range;
};

export type LookupKind = 'dictionary' | 'wikipedia' | 'translate';

type Popups = {
  /** the text selected in the book */
  selection?: TextSelection;
  /** the annotation clicked */
  annotation?: { id: string; box: Box };
  /** the text selected looked up */
  lookup?: { kind: LookupKind; selection: TextSelection };
  /** a footnote shown, at its link (rendered by FoliateViewer) */
  footnote?: { box: Box };
  setSelection: (selection?: TextSelection) => void;
  setAnnotation: (annotation?: { id: string; box: Box }) => void;
  setLookup: (lookup?: { kind: LookupKind; selection: TextSelection }) => void;
  setFootnote: (footnote?: { box: Box }) => void;
  clear: () => void;
};

const NONE = { selection: undefined, annotation: undefined, lookup: undefined, footnote: undefined };

/** The popups over the book: one at a time. */
export const usePopups = create<Popups>((set) => ({
  setSelection: (selection) => set({ ...NONE, selection }),
  setAnnotation: (annotation) => set({ ...NONE, annotation }),
  setLookup: (lookup) => set({ ...NONE, lookup }),
  setFootnote: (footnote) => set({ ...NONE, footnote }),
  clear: () => set(NONE),
}));

/** The box of a range or an element in a page of the book, in the window. */
export function boxOfRange(range: Range | Element): Box {
  const rect = range.getBoundingClientRect();
  const node = 'startContainer' in range ? range.startContainer : range;
  const frame = node.ownerDocument?.defaultView?.frameElement;
  const offset = frame ? frame.getBoundingClientRect() : { left: 0, top: 0 };
  return {
    left: rect.left + offset.left,
    top: rect.top + offset.top,
    right: rect.right + offset.left,
    bottom: rect.bottom + offset.top,
  };
}
