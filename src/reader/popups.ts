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

export type Footnote = { box: Box; size: { width: number; height: number } };

export type LookupKind = 'dictionary' | 'wikipedia' | 'translate';

export type AnnotationTarget = {
  id: string;
  box: Box;
  /** its note edited: of a highlight made for it (gone if cancelled), or there before */
  edit?: 'new' | 'existing';
};

type Popups = {
  /** the text selected in the book */
  selection?: TextSelection;
  /** the annotation clicked, or just made */
  annotation?: AnnotationTarget;
  /** the text selected looked up */
  lookup?: { kind: LookupKind; selection: TextSelection };
  /** a footnote shown, at its link, of the size of the note (rendered by FoliateViewer) */
  footnote?: Footnote;
  setSelection: (selection?: TextSelection) => void;
  setAnnotation: (annotation?: AnnotationTarget) => void;
  setLookup: (lookup?: { kind: LookupKind; selection: TextSelection }) => void;
  setFootnote: (footnote?: Footnote) => void;
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

/**
 * The box of a range or an element in a page of the book, in the window.
 * With the page in view (`area`): of its lines in it only, as a range over
 * pages goes off it; all of it, if none is.
 */
export function boxOfRange(range: Range | Element, area?: Box): Box {
  const node = 'startContainer' in range ? range.startContainer : range;
  const frame = node.ownerDocument?.defaultView?.frameElement;
  const offset = frame ? frame.getBoundingClientRect() : { left: 0, top: 0 };
  const inWindow = (rect: Box): Box => ({
    left: rect.left + offset.left,
    top: rect.top + offset.top,
    right: rect.right + offset.left,
    bottom: rect.bottom + offset.top,
  });
  if (area) {
    const lines = Array.from(range.getClientRects()).map(inWindow).filter((r) => {
      const x = (r.left + r.right) / 2;
      const y = (r.top + r.bottom) / 2;
      return x > area.left && x < area.right && y > area.top && y < area.bottom;
    });
    if (lines.length) {
      return {
        left: Math.min(...lines.map((r) => r.left)),
        top: Math.min(...lines.map((r) => r.top)),
        right: Math.max(...lines.map((r) => r.right)),
        bottom: Math.max(...lines.map((r) => r.bottom)),
      };
    }
  }
  return inWindow(range.getBoundingClientRect());
}
