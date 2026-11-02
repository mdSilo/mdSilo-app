import { useMemo } from "react";
import type { CodeRenderer } from "mdsmirror";
import { store, useStore } from "@/state/store";
import { sanitizePluginPicture } from "@/lib/sanitize";
import { askPlugin } from "./background";
import { useTrustedVersion } from "./trusted";
import {
  contributesOf,
  enabledPlugins,
  type InstalledPlugin,
} from "./registry";

/**
 * Code blocks drawn by plugins, ```plantuml: the main page of the plugin, in
 * its hidden frame (see background.ts), is asked `code.render({ lang, code, dark })`
 * and answers SVG or HTML, sanitized here.
 */

/** The enabled plugin drawing each language; the first one wins */
export function codeBlockPlugins(
  plugins = store.getState().installedPlugins,
  states = store.getState().pluginStates,
): Map<string, InstalledPlugin> {
  const byLang = new Map<string, InstalledPlugin>();
  for (const plugin of enabledPlugins(plugins, states)) {
    for (const lang of contributesOf(plugin).codeBlocks) {
      if (!byLang.has(lang)) byLang.set(lang, plugin);
    }
  }
  return byLang;
}

/** The code block drawn by its plugin, sanitized; throws if none draws it, or it fails. */
export async function renderCode(
  lang: string,
  code: string,
  dark = store.getState().darkMode,
): Promise<string> {
  const plugin = codeBlockPlugins().get(lang.toLowerCase());
  if (!plugin) throw new Error(`No plugin draws ${lang}`);
  const result = await askPlugin(plugin, "code.render", {
    lang: lang.toLowerCase(),
    code,
    dark,
  });
  if (typeof result !== "string")
    throw new Error(
      `${plugin.manifest?.name ?? plugin.id} drew no SVG or HTML`,
    );
  return sanitizePluginPicture(result);
}

/**
 * The renderers of the languages the enabled plugins draw, for the editor,
 * and a key to make a new editor when they change (it reads them on creation).
 */
export function useCodeRenderers(): {
  codeRenderers: Record<string, CodeRenderer>;
  key: string;
} {
  const installedPlugins = useStore((state) => state.installedPlugins);
  const pluginStates = useStore((state) => state.pluginStates);
  // and the languages trusted plugins add as they run
  useTrustedVersion();
  const languages = [...codeBlockPlugins(installedPlugins, pluginStates).keys()]
    .sort()
    .join(",");
  return useMemo(() => {
    const codeRenderers: Record<string, CodeRenderer> = {};
    for (const lang of languages ? languages.split(",") : []) {
      codeRenderers[lang] = (code, dark) => renderCode(lang, code, dark);
    }
    return { codeRenderers, key: languages };
  }, [languages]);
}
