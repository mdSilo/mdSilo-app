import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { useEffect } from 'react';
import { store, useStore } from '@/state/store';
import { isTauri, joinPath } from '@/workspace/util';
import { MANIFEST_FILE, parseManifest, supportsApp, type Permission, type PluginManifest } from './manifest';

/**
 * The plugins installed on this device (src-tauri/src/custom_plugins.rs), and
 * which of them are enabled with which permissions. That is kept in the
 * settings of this device only: a plugin that comes with a synced workspace
 * never runs before the user enables it here.
 */
export type InstalledPlugin = {
  id: string;
  dir: string;
  /** missing when the manifest can't be read, see `error` */
  manifest?: PluginManifest;
  /** why the plugin can't run */
  error?: string;
};

export type PluginState = {
  enabled: boolean;
  /** the permissions the user gave, of those the manifest asks for */
  granted: Permission[];
};

type PluginFolder = { id: string; dir: string; manifest: string };

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function readPlugin(folder: PluginFolder, appVersion: string): InstalledPlugin {
  const { id, dir } = folder;
  if (!folder.manifest) return { id, dir, error: `No ${MANIFEST_FILE}` };
  try {
    const manifest = parseManifest(folder.manifest);
    if (manifest.id !== id) return { id, dir, manifest, error: `Installed as ${id}, but its id is ${manifest.id}` };
    if (appVersion && !supportsApp(manifest, appVersion)) {
      return { id, dir, manifest, error: `Needs mdSilo ${manifest.minAppVersion} or later` };
    }
    return { id, dir, manifest };
  } catch (e) {
    return { id, dir, error: errorText(e) };
  }
}

const appVersion = () => getVersion().catch(() => '');

/** Reads the plugins installed, into the store. */
export async function loadPlugins(): Promise<InstalledPlugin[]> {
  const folders = await invoke<PluginFolder[]>('list_plugins');
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
  const text = await invoke<string>('read_file', { filePath: joinPath(srcDir, MANIFEST_FILE) });
  if (!text) throw new Error(`No ${MANIFEST_FILE} in ${srcDir}`);
  const manifest = parseManifest(text);
  const version = await appVersion();
  if (version && !supportsApp(manifest, version)) {
    throw new Error(`${manifest.name} needs mdSilo ${manifest.minAppVersion} or later`);
  }
  await invoke<string>('install_plugin', { src: srcDir, id: manifest.id });
  await loadPlugins();
  return manifest;
}

export async function uninstallPlugin(id: string) {
  await invoke('remove_plugin', { id });
  const { pluginStates, setPluginStates } = store.getState();
  const { [id]: _removed, ...rest } = pluginStates;
  setPluginStates(rest);
  await loadPlugins();
}

const setState = (id: string, state: PluginState) => {
  const { pluginStates, setPluginStates } = store.getState();
  setPluginStates({ ...pluginStates, [id]: state });
};

/** Enables a plugin with the permissions given, all it asks for by default. */
export function enablePlugin(plugin: InstalledPlugin, granted = plugin.manifest?.permissions ?? []) {
  if (!plugin.manifest || plugin.error) throw new Error(plugin.error ?? 'Not a plugin');
  const asked = plugin.manifest.permissions;
  setState(plugin.id, { enabled: true, granted: granted.filter((p) => asked.includes(p)) });
}

export function disablePlugin(id: string) {
  const state = store.getState().pluginStates[id];
  if (state) setState(id, { ...state, enabled: false });
}

/** What the plugin may do now: granted and still asked for by its manifest. */
export function grantedPermissions(plugin: InstalledPlugin, states = store.getState().pluginStates): Permission[] {
  const asked = plugin.manifest?.permissions ?? [];
  return (states[plugin.id]?.granted ?? []).filter((p) => asked.includes(p));
}

export const isEnabled = (plugin: InstalledPlugin, states = store.getState().pluginStates) =>
  Boolean(plugin.manifest && !plugin.error && states[plugin.id]?.enabled);

/** The plugins that run: installed, without error, enabled on this device. */
export const enabledPlugins = (
  plugins = store.getState().installedPlugins,
  states = store.getState().pluginStates,
) => plugins.filter((plugin) => isEnabled(plugin, states));

export const PLUGIN_SCHEME = 'mdsplugin';

/**
 * The URL of a file of a plugin, served by src-tauri/src/plugin_scheme.rs:
 * `mdsplugin://localhost/<id>/<path>`, `http://mdsplugin.localhost/…` on Windows.
 */
export function pluginUrl(id: string, path = '') {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return `${convertFileSrc('', PLUGIN_SCHEME)}${encodeURIComponent(id)}/${encoded}`;
}

/** The plugins that may reach the network: the CSP of their pages lets them. */
export const netPlugins = (
  plugins = store.getState().installedPlugins,
  states = store.getState().pluginStates,
) => enabledPlugins(plugins, states)
  .filter((plugin) => grantedPermissions(plugin, states).includes('net'))
  .map((plugin) => plugin.id);

/** Reads the plugins installed on startup (desktop only, for now). */
export function usePlugins() {
  const installedPlugins = useStore((state) => state.installedPlugins);
  const pluginStates = useStore((state) => state.pluginStates);

  useEffect(() => {
    if (isTauri) loadPlugins().catch((e) => console.error('Error on loading plugins:', e));
  }, []);

  useEffect(() => {
    if (!isTauri) return;
    invoke('set_plugin_net', { ids: netPlugins(installedPlugins, pluginStates) })
      .catch((e) => console.error('Error on setting plugin network:', e));
  }, [installedPlugins, pluginStates]);
}
