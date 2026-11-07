import { store } from "@/state/store";
import type { Box } from "./popups";
import { withDefaults } from "./settings";
import { pageLayout } from "./styles";
import type { FoliateView } from "./view";

/**
 * The text of the pages, in the window: the pages of the renderer, less the
 * margins of the chapter and the progress, above and below them (or on the
 * sides, written down the page).
 */
export function readingArea(
  view: FoliateView | null,
  vertical = false,
): Box | undefined {
  if (!view) return undefined;
  const rect = (
    view.renderer.shadowRoot?.querySelector("#container") ?? view
  ).getBoundingClientRect();
  const { margins } = pageLayout(
    withDefaults(store.getState().readerSettings),
    vertical,
  );
  return vertical
    ? {
        left: rect.left + margins.left,
        top: rect.top,
        right: rect.right - margins.right,
        bottom: rect.bottom,
      }
    : {
        left: rect.left,
        top: rect.top + margins.top,
        right: rect.right,
        bottom: rect.bottom - margins.bottom,
      };
}
