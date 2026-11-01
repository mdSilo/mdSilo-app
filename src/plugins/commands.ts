import { store } from "@/state/store";
import { sanitizeHtml } from "@/lib/sanitize";
import { askPlugin } from "./background";
import type { CommandContribution } from "./manifest";
import { showAnswer } from "./PluginAnswer";
import { enabledPlugins, type InstalledPlugin } from "./registry";

/**
 * Commands of plugins, in the Plugins menu of the side menu: the main page of
 * the plugin is asked `command.run({ command })`, in its hidden frame (see
 * background.ts, which has app.info and app.style only); an answer, text or
 * `{ html }`, is shown.
 */
export type PluginCommand = {
  plugin: InstalledPlugin;
  command: CommandContribution;
};

export const pluginCommands = (
  plugins = store.getState().installedPlugins,
  states = store.getState().pluginStates,
): PluginCommand[] =>
  enabledPlugins(plugins, states).flatMap((plugin) =>
    (plugin.manifest?.contributes.commands ?? []).map((command) => ({
      plugin,
      command,
    })),
  );

/** Runs the command, and shows what it answers, or its error. */
export async function runCommand({
  plugin,
  command,
}: PluginCommand): Promise<void> {
  let result: unknown;
  try {
    result = await askPlugin(plugin, "command.run", { command: command.id });
  } catch (e) {
    await showAnswer(command.title, {
      error: e instanceof Error ? e.message : String(e),
    });
    return;
  }
  if (typeof result === "string" && result) {
    await showAnswer(command.title, { text: result });
  } else if (typeof result === "object" && result !== null) {
    const { html, text } = result as Record<string, unknown>;
    if (typeof html === "string")
      await showAnswer(command.title, { html: sanitizeHtml(html) });
    else if (typeof text === "string")
      await showAnswer(command.title, { text });
  }
}
