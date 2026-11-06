import type { MarkColor, ReaderInfo } from "@mdsilo/plugin-api";
import { readBlocks } from "@/reader/blocks";
import { addMark, clearMarks } from "@/reader/marks";
import { activeStore, storeOf } from "@/reader/readerStore";
import { activePane, getView, type Pane } from "@/reader/view";
import { HIGHLIGHT_COLORS } from "@/reader/annotations/annotations";
import type { PluginMethods } from "./host";
import type { InstalledPlugin } from "./registry";
import { openBookPlace } from "./context";

/**
 * What a plugin with `reader:read` can do with the book open (of the pane in
 * use): where the reader is, the text as blocks from a place on, go to a
 * place, mark text while the book is open. For the panels of the reader,
 * and the hidden page of a plugin (actions, commands).
 */

const asObject = (params: unknown): Record<string, unknown> =>
  typeof params === "object" && params !== null
    ? (params as Record<string, unknown>)
    : {};

const isCfi = (value: unknown): value is string =>
  typeof value === "string" && /^epubcfi\(.+\)$/.test(value);

function openView() {
  const view = getView();
  if (!view || !activeStore().getState().path)
    throw new Error("No book is open");
  return view;
}

/** Where the reader is in the book open; null if none is open */
export async function readerInfo(): Promise<ReaderInfo | null> {
  const { location } = activeStore().getState();
  if (!getView() || !location?.cfi) return null;
  const place = await openBookPlace();
  if (!place) return null;
  return { ...place, cfi: location.cfi, fraction: location.fraction ?? 0 };
}

async function blocks(params: unknown) {
  const view = openView();
  const { from = "current", count } = asObject(params);
  const start =
    from === "current" ? (activeStore().getState().location?.cfi ?? "") : from;
  if (!isCfi(start))
    throw new Error(`Not a place in the book: ${String(from)}`);
  if (count !== undefined && typeof count !== "number")
    throw new Error("count should be a number");
  return readBlocks(view, start, count ?? 50);
}

function placeOf(params: unknown) {
  const { cfi } = asObject(params);
  if (!isCfi(cfi)) throw new Error(`Not a place in the book: ${String(cfi)}`);
  const view = openView();
  if (!view.resolveNavigation(cfi))
    throw new Error(`Not a place in the book: ${cfi}`);
  return { view, cfi };
}

export const readerMethods = (plugin: InstalledPlugin): PluginMethods => ({
  "reader.info": { permission: "reader:read", handler: readerInfo },
  "reader.blocks": { permission: "reader:read", handler: blocks },
  "reader.goTo": {
    permission: "reader:read",
    handler: async (params) => {
      const { view, cfi } = placeOf(params);
      await view.goTo(cfi);
      return true;
    },
  },
  "reader.mark": {
    permission: "reader:read",
    handler: (params) => {
      const { cfi } = placeOf(params);
      const { color = "yellow" } = asObject(params);
      if (!HIGHLIGHT_COLORS.includes(color as MarkColor))
        throw new Error(
          `color should be one of ${HIGHLIGHT_COLORS.join(", ")}`,
        );
      addMark({
        cfi,
        color: color as MarkColor,
        owner: plugin.id,
        pane: activePane(),
      });
      return true;
    },
  },
  "reader.clearMarks": {
    permission: "reader:read",
    handler: () => {
      clearMarks({ owner: plugin.id });
      return true;
    },
  },
});

/** Calls `changed` when the page shown changes, in the pane in use */
export function onRelocated(changed: () => void): () => void {
  const panes: Pane[] = ["main", "side"];
  const offs = panes.map((pane) =>
    storeOf(pane).subscribe((state, prev) => {
      if (state.location !== prev.location && activePane() === pane) changed();
    }),
  );
  return () => offs.forEach((off) => off());
}
