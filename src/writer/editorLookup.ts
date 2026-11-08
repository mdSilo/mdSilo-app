import { create } from "zustand";
import type { Box } from "@/reader/popups";
import type { LookupTarget } from "@/reader/dictionary/DictionaryLookup";

/**
 * The text selected in a note looked up in the dictionaries, as in a book:
 * the same popup, at the text; gone on a click elsewhere, Escape, a scroll.
 */

type EditorLookup = LookupTarget & { box: Box };

export const useEditorLookup = create<{
  lookup?: EditorLookup;
  show: (text: string, range?: Range, toolbar?: DOMRect) => void;
  clear: () => void;
}>((set) => ({
  show: (text, range, toolbar) => {
    const rect = range?.getBoundingClientRect();
    // no range (or not laid out): over the middle of the window
    const box =
      rect && (rect.width || rect.height)
        ? {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
          }
        : {
            left: window.innerWidth / 2,
            right: window.innerWidth / 2,
            top: window.innerHeight / 3,
            bottom: window.innerHeight / 3,
          };
    // the toolbar over the text: the popup above or below both, not on it
    if (toolbar && (toolbar.width || toolbar.height)) {
      box.top = Math.min(box.top, toolbar.top);
      box.bottom = Math.max(box.bottom, toolbar.bottom);
    }
    set({ lookup: { text: text.trim(), range, box } });
  },
  clear: () => set({ lookup: undefined }),
}));
