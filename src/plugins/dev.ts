import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { useStore } from "@/state/store";
import { isTauri } from "@/workspace/util";
import { loadPlugins } from "./registry";

// Plugins in development (`devSource` in their state, see
// registry.developPlugin): the folder each is installed from is watched
// (src-tauri/src/custom_plugins.rs); when its files change, it is installed
// again and the plugins are listed again, which reloads it: trusted
// plugins and the hidden frames see a new plugin, the frames a new key.

type DevReload = { id: string; error: string };

/** The folders watched, by plugin id */
const watched = new Map<string, string>();

/** Why a plugin in development could not be installed again, by id */
const errors = new Map<string, string>();
export const devError = (id: string) => errors.get(id);

/** Watches the folders of the plugins in development, as the states say. */
export function syncDevWatchers(sources: Record<string, string>) {
  for (const [id, src] of watched) {
    if (sources[id] === src) continue;
    watched.delete(id);
    errors.delete(id);
    invoke("unwatch_plugin_dev", { id }).catch(() => undefined);
  }
  for (const [id, src] of Object.entries(sources)) {
    if (watched.has(id)) continue;
    watched.set(id, src);
    invoke("watch_plugin_dev", { id, src }).catch((e) => {
      errors.set(id, String(e));
      console.error(`Error on watching the plugin ${id}:`, e);
    });
  }
}

/** Reloads a plugin in development installed again. */
export async function onDevReload({ id, error }: DevReload) {
  if (error) {
    errors.set(id, error);
    console.error(`Error on installing the plugin ${id} again:`, error);
  } else errors.delete(id);
  await loadPlugins();
}

/** Keeps the plugins in development watched; in the app. */
export function PluginDev() {
  const pluginStates = useStore((state) => state.pluginStates);
  const key = JSON.stringify(
    Object.entries(pluginStates).flatMap(([id, s]) =>
      s.devSource ? [[id, s.devSource]] : [],
    ),
  );

  useEffect(() => {
    if (isTauri)
      syncDevWatchers(Object.fromEntries(JSON.parse(key) as string[][]));
  }, [key]);

  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    let gone = false;
    import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<DevReload>("plugin-dev", ({ payload }) => {
          onDevReload(payload).catch((e) =>
            console.error("Error on reloading a plugin:", e),
          );
        }),
      )
      .then((fn) => {
        if (gone) fn();
        else unlisten = fn;
      })
      .catch((e) => console.error("Error on listening to plugins:", e));
    return () => {
      gone = true;
      unlisten?.();
    };
  }, []);

  return null;
}
