import { useEffect, useSyncExternalStore } from "react";
import { Extension } from "mdsmirror";
import type {
  Contributes,
  MountPage,
  PageClient,
  TrustedApi,
  TrustedModule,
} from "@mdsilo/plugin-api";
import { store, useStore } from "@/state/store";
import { useCurrentViewContext } from "@/state/useCurrentView";
import type { ViewAction } from "@/state/viewReducer";
import { baseMethods, type PluginHost, type PluginMethods } from "./host";
import { workspaceMethods } from "./workspaceApi";
import type { CommonJs } from "./obsidian";
import {
  enabledPlugins,
  pluginUrl,
  setRuntimeContributes,
  type InstalledPlugin,
} from "./registry";

/**
 * Trusted plugins: the module of the plugin (its `main`) runs in the app,
 * not in a sandbox; enabled only after a warning (PluginManager). It does
 * what a sandboxed plugin does, by the same methods, with no permission
 * asked, and has hooks a frame can't have: extensions of the editor,
 * styles of the books. Its pages draw into an element of the app in place
 * of a frame (see PluginFrame).
 */
type Loaded = {
  plugin: InstalledPlugin;
  ready: Promise<void>;
  handlers: Map<string, (params: unknown) => unknown>;
  pages: Map<string, MountPage>;
  extensions: Set<object>;
  styles: Set<string>;
  /** what it added as it runs, see registry/contributesOf */
  contributes: Partial<Contributes>;
  unloads: (() => void)[];
  deactivate?: () => void | Promise<void>;
  error?: string;
};

const loaded = new Map<string, Loaded>();
const listeners = new Set<() => void>();
let version = 0;
const changed = () => {
  version += 1;
  listeners.forEach((l) => l());
};

/** Changes when trusted plugins load, unload, or change what they add. */
export const useTrustedVersion = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
  );

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

let importModule = (url: string): Promise<TrustedModule> =>
  import(/* @vite-ignore */ url) as Promise<TrustedModule>;

/** For tests: how a module is imported */
export function setModuleLoader(fn: typeof importModule) {
  importModule = fn;
}

// opens views from the plugin (app.open), set by <TrustedPlugins />
let dispatch: (action: ViewAction) => void = () => {
  throw new Error("The app is not ready");
};

/** Shows a view of the app, for the layers of trusted plugins (src/plugins/obsidian) */
export const dispatchView = (action: ViewAction) => dispatch(action);

const isTrusted = (plugin: InstalledPlugin) =>
  plugin.manifest?.mode === "trusted";

/** Calls a method of `methods`, all of them allowed: trusted asks no permission. */
function caller(methods: () => PluginMethods) {
  return async (method: string, params?: unknown) => {
    const all = methods();
    if (!Object.hasOwn(all, method))
      throw new Error(`Unknown method: ${method}`);
    return all[method].handler(params);
  };
}

// changes only with the extensions of the editor: a new editor each time
let extensionsVersion = 0;

/** A key of the extensions of the editor, to make the editor again when they change */
export const trustedExtensionsKey = () => extensionsVersion;

/** Add to a set, give the function to take it out again. */
function adder<T>(set: Set<T>, onChange = () => {}) {
  return (item: T) => {
    set.add(item);
    onChange();
    changed();
    return () => {
      set.delete(item);
      onChange();
      changed();
    };
  };
}

const extensionsChanged = () => {
  extensionsVersion += 1;
};

// loaded again: the module URL changes, not to get the module imported before
let loads = 0;

function load(plugin: InstalledPlugin): Loaded {
  const entry: Loaded = {
    plugin,
    ready: Promise.resolve(),
    handlers: new Map(),
    pages: new Map(),
    extensions: new Set(),
    styles: new Set(),
    contributes: {},
    unloads: [],
  };
  const setContributes = <K extends keyof Contributes>(
    kind: K,
    items: Contributes[K],
  ) => {
    entry.contributes = { ...entry.contributes, [kind]: items };
    // only while it is the one loaded
    if (loaded.get(plugin.id) === entry)
      setRuntimeContributes(plugin.id, entry.contributes);
    changed();
  };
  const manifest = plugin.manifest!;
  const api: TrustedApi = {
    plugin: { id: plugin.id, version: manifest.version, dir: plugin.dir },
    call: caller(() => ({
      ...workspaceMethods((action) => dispatch(action)),
      ...baseMethods(plugin),
    })) as TrustedApi["call"],
    handle: (request, handler) => {
      entry.handlers.set(request, handler as (params: unknown) => unknown);
      return () => entry.handlers.delete(request);
    },
    page: (name, mount) => {
      entry.pages.set(name, mount);
      changed();
      return () => {
        entry.pages.delete(name);
        changed();
      };
    },
    editor: {
      Extension: Extension as unknown as TrustedApi["editor"]["Extension"],
      addExtension: adder(entry.extensions, extensionsChanged),
    },
    reader: { addStyles: adder(entry.styles) },
    contribute: (kind, item) => {
      type Item = typeof item;
      const items = () => (entry.contributes[kind] ?? []) as Item[];
      setContributes(kind, [...items(), item] as Contributes[typeof kind]);
      return () =>
        setContributes(
          kind,
          items().filter((i) => i !== item) as Contributes[typeof kind],
        );
    },
    onUnload: (fn) => entry.unloads.push(fn),
  };
  loads += 1;
  // an Obsidian plugin: its CommonJS main.js, as a module (plugin_scheme.rs)
  const obsidian = manifest.compat === "obsidian";
  const main = obsidian ? "__cjs/main.js" : manifest.main;
  entry.ready = importModule(`${pluginUrl(plugin.id, main)}?v=${loads}`)
    .then(async (mod) => {
      const activate = obsidian
        ? (await import("./obsidian")).obsidianActivate(
            mod.default as unknown as CommonJs,
            plugin,
          )
        : (mod.activate ?? mod.default);
      if (typeof activate !== "function")
        throw new Error("The module has no activate function");
      entry.deactivate = mod.deactivate;
      await activate(api);
    })
    .catch((e) => {
      entry.error = errorText(e);
      console.error(`Error on loading the plugin ${plugin.id}:`, e);
    })
    .finally(changed);
  return entry;
}

function unload(id: string) {
  const entry = loaded.get(id);
  if (!entry) return;
  loaded.delete(id);
  setRuntimeContributes(id, undefined);
  if (entry.extensions.size > 0) extensionsChanged();
  for (const fn of entry.unloads) {
    try {
      fn();
    } catch (e) {
      console.error(`Error on unloading the plugin ${id}:`, e);
    }
  }
  Promise.resolve(entry.deactivate?.()).catch((e) =>
    console.error(`Error on deactivating the plugin ${id}:`, e),
  );
  changed();
}

/** Loads the trusted plugins enabled, unloads the others; one installed again is loaded again. */
export function syncTrusted(
  plugins = store.getState().installedPlugins,
  states = store.getState().pluginStates,
) {
  const enabled = new Map(
    enabledPlugins(plugins, states)
      .filter(isTrusted)
      .map((plugin) => [plugin.id, plugin]),
  );
  for (const [id, entry] of loaded) {
    if (enabled.get(id) !== entry.plugin) unload(id);
  }
  for (const [id, plugin] of enabled) {
    if (!loaded.has(id)) loaded.set(id, load(plugin));
  }
}

/** Why a trusted plugin could not load, if it could not */
export const trustedError = (id: string) => loaded.get(id)?.error;

const entryOf = async (plugin: InstalledPlugin) => {
  const entry = loaded.get(plugin.id);
  if (!entry || entry.plugin !== plugin)
    throw new Error(`${plugin.manifest?.name ?? plugin.id} is not loaded`);
  await entry.ready;
  if (entry.error) throw new Error(entry.error);
  return entry;
};

/** Asks a trusted plugin, as the main page of a sandboxed one is asked. */
export async function askTrusted(
  plugin: InstalledPlugin,
  method: string,
  params?: unknown,
): Promise<unknown> {
  const entry = await entryOf(plugin);
  const handler = entry.handlers.get(method);
  if (!handler) throw new Error(`Unknown method: ${method}`);
  return handler(params);
}

/** The page of a trusted plugin, if it has drawn it */
export const trustedPage = (plugin: InstalledPlugin, name: string) => {
  const entry = loaded.get(plugin.id);
  return entry?.plugin === plugin ? entry.pages.get(name) : undefined;
};

/** The extensions of the editor added by trusted plugins */
export const trustedExtensions = (): object[] =>
  [...loaded.values()].flatMap((entry) => [...entry.extensions]);

/** The CSS for the books added by trusted plugins */
export const trustedReaderCss = (): string =>
  [...loaded.values()].flatMap((entry) => [...entry.styles]).join("\n");

/**
 * A page of a trusted plugin drawn into `element`, with the methods of its
 * place; the host tells it of changes as a frame is told.
 */
export function mountTrustedPage(
  plugin: InstalledPlugin,
  mount: MountPage,
  element: HTMLElement,
  methods: () => PluginMethods,
): PluginHost {
  const pageListeners = new Map<string, Set<(data: unknown) => void>>();
  const page: PageClient = {
    call: caller(() => ({
      ...methods(),
      ...baseMethods(plugin),
    })) as PageClient["call"],
    on: (event, listener) => {
      const set = pageListeners.get(event) ?? new Set();
      pageListeners.set(event, set);
      const fn = listener as (data: unknown) => void;
      set.add(fn);
      return () => set.delete(fn);
    },
  };
  let cleanup: void | (() => void);
  try {
    cleanup = mount(element, page);
  } catch (e) {
    element.textContent = errorText(e);
  }
  return {
    emit: (event, data) =>
      pageListeners.get(event)?.forEach((listener) => listener(data)),
    call: (method, params) => askTrusted(plugin, method, params),
    dispose: () => {
      pageListeners.clear();
      try {
        cleanup?.();
      } catch (e) {
        console.error(`Error on closing a page of ${plugin.id}:`, e);
      }
    },
  };
}

/** Keeps the trusted plugins loaded as enabled; in the app, to open views for them. */
export function TrustedPlugins() {
  const { dispatch: viewDispatch } = useCurrentViewContext();
  const installedPlugins = useStore((state) => state.installedPlugins);
  const pluginStates = useStore((state) => state.pluginStates);

  useEffect(() => {
    dispatch = viewDispatch;
  }, [viewDispatch]);

  useEffect(() => {
    syncTrusted(installedPlugins, pluginStates);
  }, [installedPlugins, pluginStates]);

  return null;
}
