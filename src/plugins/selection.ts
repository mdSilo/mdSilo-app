import type { PluginContext } from "@mdsilo/plugin-api";
import { store } from "@/state/store";
import { sanitizeHtml } from "@/lib/sanitize";
import { askPlugin } from "./background";
import { imageOf, type PluginImage } from "./image";
import type { SelectionAction, SelectionPlace } from "./manifest";
import {
  contributesOf,
  enabledPlugins,
  type InstalledPlugin,
} from "./registry";

/**
 * Actions of plugins on the text selected, in the reader or the editor: the
 * main page of the plugin is asked `selection.action({ action, text, where, lang })`,
 * with the note or the book it is in (see context.ts) and in the editor the
 * text as Markdown too; it answers text, `{ html }` (sanitized here) or
 * `{ image }` (checked in image.ts) to show; in the editor, also `{ replace }`
 * or `{ insert }` to change the text.
 */
export type PluginSelectionAction = {
  plugin: InstalledPlugin;
  action: SelectionAction;
};

export type SelectionResult =
  | { text: string }
  | { html: string }
  | { image: PluginImage }
  | { replace: string }
  | { insert: string };

/** The actions of the enabled plugins in a place */
export const selectionActionsIn = (
  where: SelectionPlace,
  plugins = store.getState().installedPlugins,
  states = store.getState().pluginStates,
): PluginSelectionAction[] =>
  enabledPlugins(plugins, states).flatMap((plugin) =>
    contributesOf(plugin)
      .selectionActions.filter((action) => action.where.includes(where))
      .map((action) => ({ plugin, action })),
  );

/** Runs the action on the text; throws what the plugin says is wrong. */
export async function runSelectionAction(
  { plugin, action }: PluginSelectionAction,
  text: string,
  where: SelectionPlace,
  lang?: string,
  more: PluginContext & { markdown?: string } = {},
): Promise<SelectionResult> {
  const result = await askPlugin(plugin, "selection.action", {
    ...more,
    action: action.id,
    text,
    where,
    lang,
  });
  if (typeof result === "string") return { text: result };
  const image = await imageOf(result);
  if (image) return { image };
  if (typeof result === "object" && result !== null) {
    const {
      html,
      text: answer,
      replace,
      insert,
    } = result as Record<string, unknown>;
    if (typeof html === "string") return { html: sanitizeHtml(html) };
    if (typeof answer === "string") return { text: answer };
    if (where === "editor" && typeof replace === "string") return { replace };
    if (where === "editor" && typeof insert === "string") return { insert };
  }
  throw new Error(`${plugin.manifest?.name ?? plugin.id} gave no text`);
}

/** The text of a result, e.g. to keep as a note */
export function textOf(result: SelectionResult): string {
  if ("text" in result) return result.text;
  if ("replace" in result) return result.replace;
  if ("insert" in result) return result.insert;
  if ("image" in result) return result.image.alt;
  const div = document.createElement("div");
  div.innerHTML = result.html;
  return div.textContent?.trim() ?? "";
}
