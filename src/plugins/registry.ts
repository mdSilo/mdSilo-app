import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { useEffect } from "react";
import { store, useStore } from "@/state/store";
import { isTauri, joinPath } from "@/workspace/util";
import { getFileExt } from "@/workspace/process";
import { dataRoot } from "@/workspace/layout";
import { defineKind, moveTo, workspaceData, type Where } from "@/custom/store";
import {
  MANIFEST_FILE,
  parseManifest,
  supportsApp,
  type Contributes,
  type NoteModeContribution,
  type Permission,
  type PluginManifest,
  type ViewContribution,
  type ViewerContribution,
} from "./manifest";

/**
 * The plugins installed (src-tauri/src/custom_plugins.rs): on this device,
 * or in the workspace (`.mdsilo/plugins/<id>`, synced); the one of this
 * device is used when a plugin is in both. Which of them are enabled with
 * which permissions is kept in the settings of this device only: a plugin
 * that comes with a synced workspace never runs before the user enables it
 * here, nor after a sync changed it.
 */
export type InstalledPlugin = {
  id: string;
  dir: string;
  where: Where;
  /** of the files of a plugin of the workspace, '' for one of this device */
  hash: string;
  /** missing when the manifest can't be read, see `error` */
  manifest?: PluginManifest;
  /** why the plugin can't run */
  error?: string;
};

export type PluginState = {
  enabled: boolean;
  /** the permissions the user gave, of those the manifest asks for */
  granted: Permission[];
  /** the files of a plugin of the workspace when it was enabled */
  hash?: string;
  /** in development: the folder it is installed from again when its files change, see plugins/dev */
  devSource?: string;
};

type PluginFolder = {
  id: string;
  dir: string;
  manifest: string;
  where?: Where;
  hash?: string;
};

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function readPlugin(
  folder: PluginFolder,
  appVersion: string,
): InstalledPlugin {
  const plugin = {
    id: folder.id,
    dir: folder.dir,
    where: folder.where ?? "device",
    hash: folder.hash ?? "",
  };
  if (!folder.manifest) return { ...plugin, error: `No ${MANIFEST_FILE}` };
  try {
    const manifest = parseManifest(folder.manifest);
    if (manifest.id !== plugin.id)
      return {
        ...plugin,
        manifest,
        error: `Installed as ${plugin.id}, but its id is ${manifest.id}`,
      };
    if (appVersion && !supportsApp(manifest, appVersion)) {
      return {
        ...plugin,
        manifest,
        error: `Needs mdSilo ${manifest.minAppVersion} or later`,
      };
    }
    return { ...plugin, manifest };
  } catch (e) {
    return { ...plugin, error: errorText(e) };
  }
}

const appVersion = () => getVersion().catch(() => "");

/** Reads the plugins installed, of this device and of the workspace, into the store. */
export async function loadPlugins(
  workspace = dataRoot(),
): Promise<InstalledPlugin[]> {
  const folders = await invoke<PluginFolder[]>("list_plugins", {
    workspace: workspace ?? null,
  });
  const version = await appVersion();
  const plugins = folders.map((folder) => readPlugin(folder, version));
  store.getState().setInstalledPlugins(plugins);
  return plugins;
}

/**
 * Installs, or updates, the plugin in a folder. It is not enabled, and an
 * update keeps only the permissions granted before.
 */
export async function installPlugin(srcDir: string): Promise<PluginManifest> {
  const text = await invoke<string>("read_file", {
    filePath: joinPath(srcDir, MANIFEST_FILE),
  });
  if (!text) throw new Error(`No ${MANIFEST_FILE} in ${srcDir}`);
  const manifest = parseManifest(text);
  const version = await appVersion();
  if (version && !supportsApp(manifest, version)) {
    throw new Error(
      `${manifest.name} needs mdSilo ${manifest.minAppVersion} or later`,
    );
  }
  await invoke<string>("install_plugin", { src: srcDir, id: manifest.id });
  await loadPlugins();
  return manifest;
}

/** Installs, or updates, the plugin in a .zip: of its folder, or of what is in it. */
export async function installPluginZip(zip: string): Promise<PluginManifest> {
  const dir = await invoke<string>("unpack_plugin", { zip });
  try {
    return await installPlugin(dir);
  } finally {
    await invoke("forget_unpacked").catch(() => undefined);
  }
}

const workspaceArg = (where: Where) =>
  where === "workspace" ? workspaceData() : null;

/** Plugins of each place; their folders are their list, nothing else to save. */
export const plugins = defineKind<InstalledPlugin>({
  paths: ["plugins"],
  list: (where) =>
    store.getState().installedPlugins.filter((p) => p.where === where),
  copy: async (plugin, to) => {
    const dir = await invoke<string>("install_plugin", {
      src: plugin.dir,
      id: plugin.id,
      workspace: workspaceArg(to),
    });
    return { ...plugin, dir, where: to };
  },
  remove: (plugin, from) =>
    invoke("remove_plugin", { id: plugin.id, workspace: workspaceArg(from) }),
  load: async () => {
    await loadPlugins();
  },
});

/**
 * Keeps a plugin on this device or in the workspace. Enabled, it stays
 * enabled here: what is in the workspace now is what the user enabled.
 */
export async function movePlugin(plugin: InstalledPlugin, to: Where) {
  try {
    await moveTo(plugins, plugin, to);
  } finally {
    await loadPlugins();
  }
  const state = store.getState().pluginStates[plugin.id];
  const moved = store
    .getState()
    .installedPlugins.find((p) => p.id === plugin.id && p.where === to);
  if (state?.enabled && moved)
    setState(plugin.id, { ...state, hash: moved.hash });
  // developed on this device only: installed again there
  if (to === "workspace" && state?.devSource) stopDeveloping(plugin.id);
}

/**
 * Installs the plugin in a folder to develop it: installed again (on this
 * device) each time its files change, and reloaded, see plugins/dev.
 */
export async function developPlugin(srcDir: string): Promise<PluginManifest> {
  const manifest = await installPlugin(srcDir);
  const state = store.getState().pluginStates[manifest.id];
  setState(manifest.id, {
    ...(state ?? { enabled: false, granted: [] }),
    devSource: srcDir,
  });
  return manifest;
}

export function stopDeveloping(id: string) {
  const state = store.getState().pluginStates[id];
  if (!state?.devSource) return;
  const { devSource: _source, ...rest } = state;
  setState(id, rest);
}

/** Removes the plugin from where it is: this device, or the workspace (for all devices). */
export async function uninstallPlugin(plugin: InstalledPlugin) {
  await invoke("remove_plugin", {
    id: plugin.id,
    workspace: workspaceArg(plugin.where),
  });
  const { pluginStates, setPluginStates } = store.getState();
  const { [plugin.id]: _removed, ...rest } = pluginStates;
  setPluginStates(rest);
  await loadPlugins();
}

const setState = (id: string, state: PluginState) => {
  const { pluginStates, setPluginStates } = store.getState();
  setPluginStates({ ...pluginStates, [id]: state });
};

/** Enables a plugin with the permissions given, all it asks for by default. */
export function enablePlugin(
  plugin: InstalledPlugin,
  granted = plugin.manifest?.permissions ?? [],
) {
  if (!plugin.manifest || plugin.error)
    throw new Error(plugin.error ?? "Not a plugin");
  const asked = plugin.manifest.permissions;
  const devSource = store.getState().pluginStates[plugin.id]?.devSource;
  setState(plugin.id, {
    enabled: true,
    granted: granted.filter((p) => asked.includes(p)),
    ...(plugin.where === "workspace" ? { hash: plugin.hash } : {}),
    ...(devSource ? { devSource } : {}),
  });
}

export function disablePlugin(id: string) {
  const state = store.getState().pluginStates[id];
  if (state) setState(id, { ...state, enabled: false });
}

/** What the plugin may do now: granted and still asked for by its manifest. */
export function grantedPermissions(
  plugin: InstalledPlugin,
  states = store.getState().pluginStates,
): Permission[] {
  const asked = plugin.manifest?.permissions ?? [];
  return (states[plugin.id]?.granted ?? []).filter((p) => asked.includes(p));
}

/** A plugin of the workspace enabled here, then changed (by a sync): to be enabled again. */
export const isChanged = (
  plugin: InstalledPlugin,
  states = store.getState().pluginStates,
) =>
  plugin.where === "workspace" &&
  Boolean(states[plugin.id]?.enabled) &&
  states[plugin.id]?.hash !== plugin.hash;

export const isEnabled = (
  plugin: InstalledPlugin,
  states = store.getState().pluginStates,
) =>
  Boolean(plugin.manifest && !plugin.error && states[plugin.id]?.enabled) &&
  !isChanged(plugin, states);

/** The plugins that run: installed, without error, enabled on this device. */
export const enabledPlugins = (
  plugins = store.getState().installedPlugins,
  states = store.getState().pluginStates,
) => plugins.filter((plugin) => isEnabled(plugin, states));

// what trusted plugins contribute as they run (src/plugins/trusted.ts), by plugin id
const runtimeContributes = new Map<string, Partial<Contributes>>();

/** Sets what a trusted plugin contributes as it runs; none when it unloads. */
export function setRuntimeContributes(
  id: string,
  contributes: Partial<Contributes> | undefined,
) {
  if (contributes) runtimeContributes.set(id, contributes);
  else runtimeContributes.delete(id);
}

const NO_CONTRIBUTES: Contributes = {
  viewers: [],
  views: [],
  codeBlocks: [],
  selectionActions: [],
  commands: [],
  noteModes: [],
};

/** What a plugin contributes: its manifest, and what it adds as it runs (trusted only). */
export function contributesOf(plugin: InstalledPlugin): Contributes {
  const declared = plugin.manifest?.contributes ?? NO_CONTRIBUTES;
  const added = runtimeContributes.get(plugin.id);
  if (!added) return declared;
  return {
    viewers: [...declared.viewers, ...(added.viewers ?? [])],
    views: [...declared.views, ...(added.views ?? [])],
    codeBlocks: [
      ...new Set([...declared.codeBlocks, ...(added.codeBlocks ?? [])]),
    ],
    selectionActions: [
      ...declared.selectionActions,
      ...(added.selectionActions ?? []),
    ],
    commands: [...declared.commands, ...(added.commands ?? [])],
    noteModes: [...declared.noteModes, ...(added.noteModes ?? [])],
  };
}

/** The enabled plugins that open files with the extension of `path`. */
export function viewersOf(
  path: string,
  plugins = store.getState().installedPlugins,
  states = store.getState().pluginStates,
): { plugin: InstalledPlugin; viewer: ViewerContribution }[] {
  const ext = getFileExt(path.split(/[/\\]/).pop() ?? "").toLowerCase();
  if (!ext) return [];
  return enabledPlugins(plugins, states).flatMap((plugin) =>
    contributesOf(plugin)
      .viewers.filter((viewer) => viewer.extensions.includes(ext))
      .map((viewer) => ({ plugin, viewer })),
  );
}

/** The views of the enabled plugins, for the side menu */
export const pluginViews = (
  plugins = store.getState().installedPlugins,
  states = store.getState().pluginStates,
): { plugin: InstalledPlugin; view: ViewContribution }[] =>
  enabledPlugins(plugins, states).flatMap((plugin) =>
    contributesOf(plugin).views.map((view) => ({
      plugin,
      view,
    })),
  );

/** The note mode of a plugin, as the `rawMode` setting keeps it */
export const noteModeName = (pluginId: string, modeId: string) =>
  `plugin:${pluginId}:${modeId}`;

/** The note modes of the enabled plugins, for the note header */
export const pluginNoteModes = (
  plugins = store.getState().installedPlugins,
  states = store.getState().pluginStates,
): {
  plugin: InstalledPlugin;
  mode: NoteModeContribution;
  name: string;
}[] =>
  enabledPlugins(plugins, states).flatMap((plugin) =>
    contributesOf(plugin).noteModes.map((mode) => ({
      plugin,
      mode,
      name: noteModeName(plugin.id, mode.id),
    })),
  );

export const PLUGIN_SCHEME = "mdsplugin";

/**
 * The URL of a file of a plugin, served by src-tauri/src/plugin_scheme.rs:
 * `mdsplugin://localhost/<id>/<path>`, `http://mdsplugin.localhost/…` on Windows.
 */
export function pluginUrl(id: string, path = "") {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${convertFileSrc("", PLUGIN_SCHEME)}${encodeURIComponent(id)}/${encoded}`;
}

/** The plugins that may reach the network: the CSP of their pages lets them. */
export const netPlugins = (
  plugins = store.getState().installedPlugins,
  states = store.getState().pluginStates,
) =>
  enabledPlugins(plugins, states)
    .filter((plugin) => grantedPermissions(plugin, states).includes("net"))
    .map((plugin) => plugin.id);

/** Reads the plugins installed on startup and when the workspace changes (desktop only, for now). */
export function usePlugins() {
  const installedPlugins = useStore((state) => state.installedPlugins);
  const pluginStates = useStore((state) => state.pluginStates);
  const initDir = useStore((state) => state.initDir);
  const layout = useStore((state) => state.layout);

  useEffect(() => {
    if (isTauri)
      loadPlugins(dataRoot({ initDir, layout })).catch((e) =>
        console.error("Error on loading plugins:", e),
      );
  }, [initDir, layout]);

  useEffect(() => {
    if (!isTauri) return;
    invoke("set_plugin_net", {
      ids: netPlugins(installedPlugins, pluginStates),
    }).catch((e) => console.error("Error on setting plugin network:", e));
  }, [installedPlugins, pluginStates]);
}
