import { store } from '@/state/store';
import { themeVarsOf } from '@/custom/themes';
import { fontFamilyOf } from '@/custom/fonts';
import type { Permission } from './manifest';
import { grantedPermissions, type InstalledPlugin } from './registry';

/**
 * The app side of a sandboxed plugin: its page, in an iframe without
 * `allow-same-origin`, can't reach Tauri or the app, only post messages.
 * A call is `{ mdsilo: 1, id, method, params }`, answered with
 * `{ mdsilo: 1, id, result }` or `{ mdsilo: 1, id, error }`; the app tells
 * the plugin of changes with `{ mdsilo: 1, event, data }`.
 */
export const PROTOCOL = 1;

export type PluginCall = { mdsilo: typeof PROTOCOL; id: number | string; method: string; params?: unknown };

/** A method a plugin can call, allowed only with its permission */
export type PluginMethod = {
  permission?: Permission;
  handler: (params: unknown) => unknown;
};

export type PluginMethods = Record<string, PluginMethod>;

/** The look of the app, for a plugin to match it */
export type PluginStyle = { theme: string; dark: boolean; vars: Record<string, string>; font: string };

export function appStyle(): PluginStyle {
  const { darkMode, font, customFonts } = store.getState();
  const theme = document.documentElement.dataset.theme ?? '';
  return { theme, dark: darkMode, vars: themeVarsOf(theme), font: fontFamilyOf(font, customFonts) };
}

/** Methods every plugin has, whatever it is granted. */
const BASE_METHODS = (plugin: InstalledPlugin): PluginMethods => ({
  'app.info': {
    handler: () => ({
      id: plugin.id,
      version: plugin.manifest?.version,
      permissions: grantedPermissions(plugin),
    }),
  },
  'app.style': { handler: appStyle },
});

const isCall = (data: unknown): data is PluginCall => {
  if (typeof data !== 'object' || data === null) return false;
  const call = data as Partial<PluginCall>;
  return call.mdsilo === PROTOCOL && typeof call.method === 'string'
    && (typeof call.id === 'number' || typeof call.id === 'string');
};

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export type PluginHost = {
  /** tells the plugin of a change */
  emit: (event: string, data?: unknown) => void;
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
): PluginHost {
  const base = BASE_METHODS(plugin);
  // the origin of a sandboxed page is opaque, so no target origin can be named
  const post = (message: object) => frame.contentWindow?.postMessage({ mdsilo: PROTOCOL, ...message }, '*');

  const onMessage = async (event: MessageEvent) => {
    // only the page in this frame, not the app nor another plugin
    if (!frame.contentWindow || event.source !== frame.contentWindow || !isCall(event.data)) return;
    const { id, method, params } = event.data;
    const all = { ...methods(), ...base };
    const found = Object.hasOwn(all, method) ? all[method] : undefined;
    if (!found) return post({ id, error: `Unknown method: ${method}` });
    if (found.permission && !grantedPermissions(plugin).includes(found.permission)) {
      return post({ id, error: `Not permitted: ${found.permission}` });
    }
    try {
      post({ id, result: await found.handler(params) });
    } catch (e) {
      post({ id, error: errorText(e) });
    }
  };

  window.addEventListener('message', onMessage);
  return {
    emit: (event, data) => post({ event, data }),
    dispose: () => window.removeEventListener('message', onMessage),
  };
}
