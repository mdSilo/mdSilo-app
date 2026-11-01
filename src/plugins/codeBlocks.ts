import { useMemo } from 'react';
import type { CodeRenderer } from 'mdsmirror';
import { store, useStore } from '@/state/store';
import { sanitizePluginPicture } from '@/lib/sanitize';
import { createHost, type PluginHost } from './host';
import { enabledPlugins, pluginUrl, type InstalledPlugin } from './registry';

/**
 * Code blocks drawn by plugins, ```plantuml: the main page of the plugin runs
 * in a hidden sandboxed frame, asked `code.render({ lang, code, dark })`, and
 * answers SVG or HTML, sanitized here.
 */

/** The enabled plugin drawing each language; the first one wins */
export function codeBlockPlugins(
  plugins = store.getState().installedPlugins,
  states = store.getState().pluginStates,
): Map<string, InstalledPlugin> {
  const byLang = new Map<string, InstalledPlugin>();
  for (const plugin of enabledPlugins(plugins, states)) {
    for (const lang of plugin.manifest?.contributes.codeBlocks ?? []) {
      if (!byLang.has(lang)) byLang.set(lang, plugin);
    }
  }
  return byLang;
}

type Renderer = { plugin: InstalledPlugin; frame: HTMLIFrameElement; host: PluginHost; ready: Promise<void> };

const renderers = new Map<string, Renderer>();

function rendererOf(plugin: InstalledPlugin): Renderer {
  const old = renderers.get(plugin.id);
  if (old?.plugin === plugin) return old;
  if (old) closeRenderer(plugin.id);
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
  // the scripts of the page run before its load event: then it listens
  const ready = new Promise<void>((resolve) => frame.addEventListener('load', () => resolve(), { once: true }));
  frame.src = pluginUrl(plugin.id, plugin.manifest?.main ?? 'index.html');
  document.body.append(frame);
  const renderer = { plugin, frame, host: createHost(plugin, frame), ready };
  renderers.set(plugin.id, renderer);
  return renderer;
}

function closeRenderer(id: string) {
  const renderer = renderers.get(id);
  if (!renderer) return;
  renderer.host.dispose();
  renderer.frame.remove();
  renderers.delete(id);
}

/** Closes the frames of the plugins no longer enabled, or installed again. */
export function syncRenderers() {
  const enabled = new Map(enabledPlugins().map((plugin) => [plugin.id, plugin]));
  for (const [id, renderer] of renderers) {
    if (enabled.get(id) !== renderer.plugin) closeRenderer(id);
  }
}

store.subscribe((state, prev) => {
  if (state.installedPlugins !== prev.installedPlugins || state.pluginStates !== prev.pluginStates) syncRenderers();
});

/** The code block drawn by its plugin, sanitized; throws if none draws it, or it fails. */
export async function renderCode(lang: string, code: string, dark = store.getState().darkMode): Promise<string> {
  const plugin = codeBlockPlugins().get(lang.toLowerCase());
  if (!plugin) throw new Error(`No plugin draws ${lang}`);
  const { host, ready } = rendererOf(plugin);
  await ready;
  const result = await host.call('code.render', { lang: lang.toLowerCase(), code, dark });
  if (typeof result !== 'string') throw new Error(`${plugin.manifest?.name ?? plugin.id} drew no SVG or HTML`);
  return sanitizePluginPicture(result);
}

/**
 * The renderers of the languages the enabled plugins draw, for the editor,
 * and a key to make a new editor when they change (it reads them on creation).
 */
export function useCodeRenderers(): { codeRenderers: Record<string, CodeRenderer>; key: string } {
  const installedPlugins = useStore((state) => state.installedPlugins);
  const pluginStates = useStore((state) => state.pluginStates);
  const languages = [...codeBlockPlugins(installedPlugins, pluginStates).keys()].sort().join(',');
  return useMemo(() => {
    const codeRenderers: Record<string, CodeRenderer> = {};
    for (const lang of languages ? languages.split(',') : []) {
      codeRenderers[lang] = (code, dark) => renderCode(lang, code, dark);
    }
    return { codeRenderers, key: languages };
  }, [languages]);
}
