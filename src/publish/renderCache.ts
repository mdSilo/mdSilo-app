import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { md5 } from "js-md5";
import type { Renderers } from "mdsilo-publish";
import { store } from "@/state/store";
import { codeBlockPlugins } from "@/plugins/codeBlocks";
import { localDirOf } from "@/workspace/layout";
import { joinPath } from "@/workspace/util";

/**
 * The pictures of the site drawn before, kept on this device: a diagram
 * not changed is not drawn again. By what it is drawn of: its code, its
 * language, the theme, what draws it (the app's version for the built-in
 * ones, the plugin's version and files for the others; none kept of a
 * plugin in development). Only the ones of the last build are kept.
 */
export const RENDER_CACHE_FILE = "site-renders.json";

/** changed when the built-in ones are drawn otherwise, see renderers.ts */
const BUILT_IN = 1;

export type RenderCache = {
  /** as read: by key, the picture */
  saved: Record<string, string>;
  /** the ones of this build, to write */
  used: Record<string, string>;
  /** of the built-in renderers */
  version: string;
};

const cachePath = (ws: string) => joinPath(localDirOf(ws), RENDER_CACHE_FILE);

export async function readRenderCache(ws: string): Promise<RenderCache> {
  const version = `${BUILT_IN}:${await getVersion().catch(() => "")}`;
  try {
    const text = await invoke<string>("read_file", { filePath: cachePath(ws) });
    const saved = text?.trim()
      ? (JSON.parse(text) as Record<string, string>)
      : {};
    return { saved, used: {}, version };
  } catch {
    return { saved: {}, used: {}, version };
  }
}

/** Keep the pictures of this build, the others dropped. */
export async function writeRenderCache(ws: string, cache: RenderCache) {
  await invoke("create_dir_recursive", { dirPath: localDirOf(ws) });
  await invoke("write_file", {
    filePath: cachePath(ws),
    text: JSON.stringify(cache.used),
  });
}

/** What draws a language, undefined if not to be kept. */
function drawerOf(lang: string, version: string): string | undefined {
  const plugin = codeBlockPlugins().get(lang);
  if (!plugin) return `app:${version}`;
  if (store.getState().pluginStates[plugin.id]?.devSource) return undefined;
  return `${plugin.id}@${plugin.manifest?.version ?? ""}:${plugin.hash}`;
}

/** The renderers, their pictures kept in the cache. */
export function cachedRenderers(
  renderers: Renderers,
  cache: RenderCache,
  theme: "light" | "dark",
): Renderers {
  return Object.fromEntries(
    Object.entries(renderers).map(([lang, draw]) => {
      if (!draw) return [lang, draw];
      const drawer = drawerOf(lang, cache.version);
      if (drawer === undefined) return [lang, draw];
      return [
        lang,
        async (code: string) => {
          const key = md5(`${drawer}\n${theme}\n${lang}\n${code}`);
          const svg = cache.used[key] ?? cache.saved[key] ?? (await draw(code));
          cache.used[key] = svg;
          return svg;
        },
      ];
    }),
  );
}
