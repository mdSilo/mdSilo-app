import { PROTOCOL, type PluginStyle } from "@mdsilo/plugin-api";
import { store } from "@/state/store";
import { openUrl } from "@/workspace/open";
import { themeVarsOf } from "@/custom/themes";
import { allFonts, fontFamilyOf } from "@/custom/fonts";
import type { Permission } from "./manifest";
import { grantedPermissions, type InstalledPlugin } from "./registry";

/**
 * The app side of a sandboxed plugin: its page, in an iframe without
 * `allow-same-origin`, can't reach Tauri or the app, only post messages.
 * A call is `{ mdsilo: 1, id, method, params }`, answered with
 * `{ mdsilo: 1, id, result }` or `{ mdsilo: 1, id, error }`; the app tells
 * the plugin of changes with `{ mdsilo: 1, event, data }`. The app asks the
 * plugin with `{ mdsilo: 1, request, method, params }`, the plugin answers
 * `{ mdsilo: 1, reply: request, result }` or `{ …, error }`.
 */
export { PROTOCOL };
export type { PluginStyle };

export type PluginCall = {
  mdsilo: typeof PROTOCOL;
  id: number | string;
  method: string;
  params?: unknown;
};

/** A method a plugin can call, allowed only with its permission */
export type PluginMethod = {
  permission?: Permission;
  handler: (params: unknown) => unknown;
};

export type PluginMethods = Record<string, PluginMethod>;

export function appStyle(): PluginStyle {
  const state = store.getState();
  const { darkMode, font } = state;
  const theme = document.documentElement.dataset.theme ?? "";
  return {
    theme,
    dark: darkMode,
    vars: themeVarsOf(theme),
    font: fontFamilyOf(font, allFonts(state)),
  };
}

/** A web page a plugin may open: http(s) only, not too long; the URL, or throws */
export function webUrl(url: unknown): string {
  if (typeof url !== "string" || url.length > 8192)
    throw new Error("A URL is wanted");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Not a URL: ${url}`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    throw new Error(`Only web pages can be opened: ${url}`);
  return parsed.href;
}

/** the last time each plugin opened a page */
const lastOpened = new Map<string, number>();
export const OPEN_URL_INTERVAL = 1000;

/** Opens a web page in the browser for a plugin: one a second at most. */
async function openUrlFor(plugin: InstalledPlugin, params: unknown) {
  const url = webUrl(
    typeof params === "object" && params !== null
      ? (params as { url?: unknown }).url
      : undefined,
  );
  const now = Date.now();
  if (now - (lastOpened.get(plugin.id) ?? -Infinity) < OPEN_URL_INTERVAL)
    throw new Error("Pages are opened one a second at most");
  lastOpened.set(plugin.id, now);
  if (!(await openUrl(url))) throw new Error(`Can't open ${url}`);
  return true;
}

/** Methods every plugin has, whatever it is granted. */
export const baseMethods = (plugin: InstalledPlugin): PluginMethods => ({
  "app.openUrl": { handler: (params) => openUrlFor(plugin, params) },
  "app.info": {
    handler: () => ({
      id: plugin.id,
      version: plugin.manifest?.version,
      permissions: grantedPermissions(plugin),
    }),
  },
  "app.style": { handler: appStyle },
});

const isCall = (data: unknown): data is PluginCall => {
  if (typeof data !== "object" || data === null) return false;
  const call = data as Partial<PluginCall>;
  return (
    call.mdsilo === PROTOCOL &&
    typeof call.method === "string" &&
    (typeof call.id === "number" || typeof call.id === "string")
  );
};

type PluginReply = {
  mdsilo: typeof PROTOCOL;
  reply: number;
  result?: unknown;
  error?: unknown;
};

const isReply = (data: unknown): data is PluginReply =>
  typeof data === "object" &&
  data !== null &&
  (data as Partial<PluginReply>).mdsilo === PROTOCOL &&
  typeof (data as Partial<PluginReply>).reply === "number";

/** how long the app waits for the answer of a plugin */
export const CALL_TIMEOUT = 15_000;

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export type PluginHost = {
  /** tells the plugin of a change */
  emit: (event: string, data?: unknown) => void;
  /** asks the plugin, e.g. to render a code block */
  call: (method: string, params?: unknown) => Promise<unknown>;
  dispose: () => void;
};

/**
 * Answers the calls of the plugin in `frame`. Methods and permissions are
 * read on each call, so revoking a permission takes effect at once.
 */
export function createHost(
  plugin: InstalledPlugin,
  frame: HTMLIFrameElement,
  methods: () => PluginMethods = () => ({}),
  options: {
    /**
     * a frame the user doesn't see: it opens pages only while it answers
     * what the user did (an action, a command), not on its own
     */
    hidden?: boolean;
  } = {},
): PluginHost {
  const base = baseMethods(plugin);
  // the origin of a sandboxed page is opaque, so no target origin can be named
  const post = (message: object) =>
    frame.contentWindow?.postMessage({ mdsilo: PROTOCOL, ...message }, "*");

  let seq = 0;
  const waiting = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (e: Error) => void }
  >();

  const onMessage = async (event: MessageEvent) => {
    // only the page in this frame, not the app nor another plugin
    if (!frame.contentWindow || event.source !== frame.contentWindow) return;
    if (isReply(event.data)) {
      const { reply, result, error } = event.data;
      const pending = waiting.get(reply);
      waiting.delete(reply);
      if (error !== undefined) pending?.reject(new Error(String(error)));
      else pending?.resolve(result);
      return;
    }
    if (!isCall(event.data)) return;
    const { id, method, params } = event.data;
    const all = { ...methods(), ...base };
    const found = Object.hasOwn(all, method) ? all[method] : undefined;
    if (!found) return post({ id, error: `Unknown method: ${method}` });
    if (method === "app.openUrl" && options.hidden && waiting.size === 0)
      return post({
        id,
        error: "A page is opened only while answering the user",
      });
    if (
      found.permission &&
      !grantedPermissions(plugin).includes(found.permission)
    ) {
      return post({ id, error: `Not permitted: ${found.permission}` });
    }
    try {
      post({ id, result: await found.handler(params) });
    } catch (e) {
      post({ id, error: errorText(e) });
    }
  };

  const call = (method: string, params?: unknown) =>
    new Promise<unknown>((resolve, reject) => {
      const request = ++seq;
      const timer = setTimeout(() => {
        waiting.delete(request);
        reject(
          new Error(
            `${plugin.manifest?.name ?? plugin.id} did not answer ${method}`,
          ),
        );
      }, CALL_TIMEOUT);
      const done =
        <T>(fn: (value: T) => void) =>
        (value: T) => {
          clearTimeout(timer);
          fn(value);
        };
      waiting.set(request, { resolve: done(resolve), reject: done(reject) });
      post({ request, method, params });
    });

  window.addEventListener("message", onMessage);
  return {
    emit: (event, data) => post({ event, data }),
    call,
    dispose: () => {
      window.removeEventListener("message", onMessage);
      for (const pending of waiting.values())
        pending.reject(new Error("The plugin is closed"));
      waiting.clear();
    },
  };
}
