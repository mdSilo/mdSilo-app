import { store } from "@/state/store";
import type { ViewState } from "@/state/viewReducer";
import { sanitizeHtml } from "@/lib/sanitize";
import { askPlugin } from "./background";
import type { CommandContribution } from "./manifest";
import { showAnswer } from "./PluginAnswer";
import { imageOf } from "./image";
import { viewContext } from "./context";
import {
  contributesOf,
  enabledPlugins,
  type InstalledPlugin,
} from "./registry";

/**
 * Commands of plugins, in the Plugins menu of the side menu: the main page of
 * the plugin is asked `command.run({ command })`, with the note or the book
 * of the view shown (see context.ts), in its hidden frame (see
 * background.ts); an answer, text, `{ html }` or `{ image }`, is shown.
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
    contributesOf(plugin).commands.map((command) => ({
      plugin,
      command,
    })),
  );

/** Runs the command, and shows what it answers, or its error. */
export async function runCommand(
  { plugin, command }: PluginCommand,
  view?: ViewState,
): Promise<void> {
  let result: unknown;
  let image: Awaited<ReturnType<typeof imageOf>>;
  try {
    result = await askPlugin(plugin, "command.run", {
      ...(await viewContext(plugin, view)),
      command: command.id,
    });
    image = await imageOf(result);
  } catch (e) {
    await showAnswer(command.title, {
      error: e instanceof Error ? e.message : String(e),
    });
    return;
  }
  if (image) {
    await showAnswer(command.title, { image });
  } else if (typeof result === "string" && result) {
    await showAnswer(command.title, { text: result });
  } else if (typeof result === "object" && result !== null) {
    const { html, text } = result as Record<string, unknown>;
    if (typeof html === "string")
      await showAnswer(command.title, { html: sanitizeHtml(html) });
    else if (typeof text === "string")
      await showAnswer(command.title, { text });
  }
}
