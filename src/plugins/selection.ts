import { store } from '@/state/store';
import { sanitizeHtml } from '@/lib/sanitize';
import { askPlugin } from './background';
import type { SelectionAction, SelectionPlace } from './manifest';
import { enabledPlugins, type InstalledPlugin } from './registry';

/**
 * Actions of plugins on the text selected, in the reader or the editor: the
 * main page of the plugin is asked `selection.action({ action, text, where, lang })`
 * and answers text, or `{ html }` (sanitized here) to show.
 */
export type PluginSelectionAction = { plugin: InstalledPlugin; action: SelectionAction };

export type SelectionResult = { text: string } | { html: string };

/** The actions of the enabled plugins in a place */
export const selectionActionsIn = (
  where: SelectionPlace,
  plugins = store.getState().installedPlugins,
  states = store.getState().pluginStates,
): PluginSelectionAction[] => enabledPlugins(plugins, states).flatMap((plugin) =>
  (plugin.manifest?.contributes.selectionActions ?? [])
    .filter((action) => action.where.includes(where))
    .map((action) => ({ plugin, action })));

/** Runs the action on the text; throws what the plugin says is wrong. */
export async function runSelectionAction(
  { plugin, action }: PluginSelectionAction,
  text: string,
  where: SelectionPlace,
  lang?: string,
): Promise<SelectionResult> {
  const result = await askPlugin(plugin, 'selection.action', { action: action.id, text, where, lang });
  if (typeof result === 'string') return { text: result };
  if (typeof result === 'object' && result !== null) {
    const { html, text: answer } = result as { html?: unknown; text?: unknown };
    if (typeof html === 'string') return { html: sanitizeHtml(html) };
    if (typeof answer === 'string') return { text: answer };
  }
  throw new Error(`${plugin.manifest?.name ?? plugin.id} gave no text`);
}

/** The text of a result, e.g. to keep as a note */
export function textOf(result: SelectionResult): string {
  if ('text' in result) return result.text;
  const div = document.createElement('div');
  div.innerHTML = result.html;
  return div.textContent?.trim() ?? '';
}
