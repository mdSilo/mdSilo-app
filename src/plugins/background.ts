import { store } from "@/state/store";
import { createHost, type PluginHost } from "./host";
import { enabledPlugins, pluginUrl, type InstalledPlugin } from "./registry";

/**
 * The main page of a plugin running in the background, in a hidden sandboxed
 * frame, to be asked: to draw a code block, to act on the text selected...
 * One frame per plugin, loaded on its first use, closed when it is disabled.
 */
type Background = {
  plugin: InstalledPlugin;
  frame: HTMLIFrameElement;
  host: PluginHost;
  ready: Promise<void>;
};

const backgrounds = new Map<string, Background>();

function backgroundOf(plugin: InstalledPlugin): Background {
  const old = backgrounds.get(plugin.id);
  if (old?.plugin === plugin) return old;
  if (old) closeBackground(plugin.id);
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText =
    "position:absolute;width:0;height:0;border:0;visibility:hidden";
  // the scripts of the page run before its load event: then it listens
  const ready = new Promise<void>((resolve) =>
    frame.addEventListener("load", () => resolve(), { once: true }),
  );
  frame.src = pluginUrl(plugin.id, plugin.manifest?.main ?? "index.html");
  document.body.append(frame);
  const background = { plugin, frame, host: createHost(plugin, frame), ready };
  backgrounds.set(plugin.id, background);
  return background;
}

function closeBackground(id: string) {
  const background = backgrounds.get(id);
  if (!background) return;
  background.host.dispose();
  background.frame.remove();
  backgrounds.delete(id);
}

/** Closes the frames of the plugins no longer enabled, or installed again. */
export function syncBackgrounds() {
  const enabled = new Map(
    enabledPlugins().map((plugin) => [plugin.id, plugin]),
  );
  for (const [id, background] of backgrounds) {
    if (enabled.get(id) !== background.plugin) closeBackground(id);
  }
}

store.subscribe((state, prev) => {
  if (
    state.installedPlugins !== prev.installedPlugins ||
    state.pluginStates !== prev.pluginStates
  )
    syncBackgrounds();
});

/** Asks the main page of the plugin, loaded in the background if not yet. */
export async function askPlugin(
  plugin: InstalledPlugin,
  method: string,
  params?: unknown,
): Promise<unknown> {
  const { host, ready } = backgroundOf(plugin);
  await ready;
  return host.call(method, params);
}
