import { create } from 'zustand';

/** A box on the screen, in the coordinates of the window. */
export type Box = { left: number; top: number; right: number; bottom: number };

export type TextSelection = {
  text: string;
  cfi: string;
  /** the section of the book */
  index: number;
  box: Box;
};

type Popups = {
  /** the text selected in the book */
  selection?: TextSelection;
  /** the annotation clicked */
  annotation?: { id: string; box: Box };
  setSelection: (selection?: TextSelection) => void;
  setAnnotation: (annotation?: { id: string; box: Box }) => void;
  clear: () => void;
};

/** The popups over the book: on a selection, on an annotation. */
export const usePopups = create<Popups>((set) => ({
  setSelection: (selection) => set({ selection, annotation: undefined }),
  setAnnotation: (annotation) => set({ annotation, selection: undefined }),
  clear: () => set({ selection: undefined, annotation: undefined }),
}));

/** The box of a range in a page of the book, in the window. */
export function boxOfRange(range: Range): Box {
  const rect = range.getBoundingClientRect();
  const frame = range.startContainer.ownerDocument?.defaultView?.frameElement;
  const offset = frame ? frame.getBoundingClientRect() : { left: 0, top: 0 };
  return {
    left: rect.left + offset.left,
    top: rect.top + offset.top,
    right: rect.right + offset.left,
    bottom: rect.bottom + offset.top,
  };
}
