import { invoke } from '@tauri-apps/api/core';
import { store } from '@/state/store';
import {
  disablePlugin, enabledPlugins, enablePlugin, grantedPermissions, installPlugin, isEnabled,
  loadPlugins, readPlugin, uninstallPlugin,
} from './registry';

const manifest = (more: Record<string, unknown> = {}) => JSON.stringify({
  id: 'csv', name: 'CSV', version: '1.0.0', permissions: ['file:read', 'file:write'], ...more,
});

/** a plugin folder on disk, as list_plugins gives it */
let folders: { id: string; dir: string; manifest: string }[] = [];

beforeEach(() => {
  folders = [];
  store.setState({ installedPlugins: [], pluginStates: {} });
  vi.mocked(invoke).mockImplementation(async (cmd, args) => {
    const a = args as Record<string, string>;
    if (cmd === 'list_plugins') return folders;
    if (cmd === 'read_file') return a.filePath === '/src/csv/manifest.json' ? manifest() : '';
    if (cmd === 'install_plugin') {
      folders = [{ id: a.id, dir: `/data/${a.id}`, manifest: manifest() }];
      return `/data/${a.id}`;
    }
    if (cmd === 'remove_plugin') {
      folders = folders.filter((f) => f.id !== a.id);
      return;
    }
    throw new Error(`unexpected ${cmd}`);
  });
});

describe('readPlugin', () => {
  const folder = { id: 'csv', dir: '/data/csv', manifest: manifest() };

  it('reads the manifest', () => {
    const plugin = readPlugin(folder, '1.0.0');
    expect(plugin.error).toBeUndefined();
    expect(plugin.manifest?.name).toBe('CSV');
  });

  it('says why a plugin can not run', () => {
    expect(readPlugin({ ...folder, manifest: '' }, '1.0.0').error).toBe('No manifest.json');
    expect(readPlugin({ ...folder, manifest: '{' }, '1.0.0').error).toBeTruthy();
    expect(readPlugin({ ...folder, id: 'other' }, '1.0.0').error).toContain('its id is csv');
    expect(readPlugin({ ...folder, manifest: manifest({ minAppVersion: '2.0.0' }) }, '1.0.0').error)
      .toBe('Needs mdSilo 2.0.0 or later');
  });
});

describe('installing', () => {
  it('installs a plugin, not enabled', async () => {
    const installed = await installPlugin('/src/csv');
    expect(installed.id).toBe('csv');
    expect(invoke).toHaveBeenCalledWith('install_plugin', { src: '/src/csv', id: 'csv' });
    const [plugin] = store.getState().installedPlugins;
    expect(plugin.id).toBe('csv');
    expect(isEnabled(plugin)).toBe(false);
  });

  it('refuses a folder without a manifest', async () => {
    await expect(installPlugin('/src/empty')).rejects.toThrow('No manifest.json');
    expect(invoke).not.toHaveBeenCalledWith('install_plugin', expect.anything());
  });

  it('forgets the plugin when uninstalled', async () => {
    await installPlugin('/src/csv');
    enablePlugin(store.getState().installedPlugins[0]);
    await uninstallPlugin('csv');
    expect(store.getState().installedPlugins).toEqual([]);
    expect(store.getState().pluginStates).toEqual({});
  });
});

describe('enabling', () => {
  beforeEach(async () => {
    folders = [{ id: 'csv', dir: '/data/csv', manifest: manifest() }];
    await loadPlugins();
  });

  const plugin = () => store.getState().installedPlugins[0];

  it('enables with what the manifest asks, or less', () => {
    enablePlugin(plugin());
    expect(grantedPermissions(plugin())).toEqual(['file:read', 'file:write']);
    enablePlugin(plugin(), ['file:read', 'net']);
    expect(grantedPermissions(plugin())).toEqual(['file:read']);
    expect(enabledPlugins()).toEqual([plugin()]);
  });

  it('keeps the permissions when disabled', () => {
    enablePlugin(plugin(), ['file:read']);
    disablePlugin('csv');
    expect(isEnabled(plugin())).toBe(false);
    expect(store.getState().pluginStates.csv.granted).toEqual(['file:read']);
    expect(enabledPlugins()).toEqual([]);
  });

  it('gives no permission the manifest does not ask for anymore', async () => {
    enablePlugin(plugin());
    folders = [{ id: 'csv', dir: '/data/csv', manifest: manifest({ permissions: ['file:read'] }) }];
    await loadPlugins();
    expect(grantedPermissions(plugin())).toEqual(['file:read']);
  });

  it('does not run a plugin with an error, even if enabled before', async () => {
    enablePlugin(plugin());
    folders = [{ id: 'csv', dir: '/data/csv', manifest: '' }];
    await loadPlugins();
    expect(isEnabled(plugin())).toBe(false);
    expect(() => enablePlugin(plugin())).toThrow('No manifest.json');
  });
});
