import { useSyncExternalStore } from "react";
import type { Extension } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";

// The CodeMirror of the Markdown mode of notes (writer/md/Markdown.tsx), for
// trusted plugins: the extensions they add (Obsidian's editor extensions are
// CodeMirror ones), and the view open, for the commands that edit it.

let extensions: Extension[] = [];
const listeners = new Set<() => void>();

const changed = () => listeners.forEach((fn) => fn());

/** Adds an extension to the Markdown mode; gives what takes it back. */
export function addCmExtension(extension: Extension): () => void {
  extensions = [...extensions, extension];
  changed();
  return () => {
    extensions = extensions.filter((e) => e !== extension);
    changed();
  };
}

/** The extensions added, in a component: a new array when they change */
export const useCmExtensions = () =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => extensions,
  );

/** The views of the Markdown mode open, the last opened last */
const views: EditorView[] = [];

/** Keeps the views of the Markdown mode known while they are open */
export const cmTracker: Extension = ViewPlugin.define((view) => {
  views.push(view);
  return {
    destroy: () => {
      const i = views.indexOf(view);
      if (i >= 0) views.splice(i, 1);
    },
  };
});

/** The view of the Markdown mode open, if one is */
export const activeCmView = (): EditorView | undefined =>
  views.findLast((view) => view.dom.isConnected) ?? views.at(-1);
