import { useState } from 'react';
import { ask, open } from '@tauri-apps/plugin-dialog';
import { TbRefresh as IconRefresh, TbTrash as IconTrash } from 'react-icons/tb';
import { useStore } from '@/state/store';
import { isTauri } from '@/workspace/util';
import { PERMISSION_LABELS, type Permission } from '@/plugins/manifest';
import {
  disablePlugin, enablePlugin, grantedPermissions, installPlugin, isEnabled, loadPlugins, uninstallPlugin,
  type InstalledPlugin,
} from '@/plugins/registry';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The plugins installed on this device: install, enable with permissions, uninstall. */
export default function PluginsSetting() {
  const plugins = useStore((state) => state.installedPlugins);
  const [error, setError] = useState('');

  const onInstall = async () => {
    setError('');
    const dir = await open({ title: 'Install Plugin from Folder', directory: true, multiple: false });
    if (typeof dir !== 'string') return;
    try {
      await installPlugin(dir);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const onReload = () => {
    setError('');
    loadPlugins().catch((e) => setError(errorText(e)));
  };

  if (!isTauri) {
    return (
      <div className="flex items-center justify-between" data-testid="plugins-setting">
        <span>Plugins</span>
        <span className="text-xs text-base-content/60">In the desktop app</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="plugins-setting">
      <div className="flex items-center justify-between gap-2">
        <span className="flex-1">Plugins</span>
        <button type="button" className="btn btn-ghost btn-xs" aria-label="Reload Plugins" onClick={onReload}>
          <IconRefresh size={14} />
        </button>
        <button type="button" className="btn btn-xs" onClick={() => void onInstall()}>Install from Folder</button>
      </div>
      {error ? <p className="text-xs text-error">{error}</p> : null}
      {plugins.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {plugins.map((plugin) => <PluginItem key={plugin.id} plugin={plugin} onError={setError} />)}
        </ul>
      ) : (
        <p className="text-xs text-base-content/60">
          No plugin yet. A plugin is a folder with a manifest.json, it runs in a sandbox.
        </p>
      )}
    </div>
  );
}

function PluginItem({ plugin, onError }: { plugin: InstalledPlugin; onError: (error: string) => void }) {
  const pluginStates = useStore((state) => state.pluginStates);
  const enabled = isEnabled(plugin, pluginStates);
  const granted = grantedPermissions(plugin, pluginStates);
  const { manifest } = plugin;
  const asked = manifest?.permissions ?? [];
  // the permissions to grant, chosen before enabling
  const [choosing, setChoosing] = useState<Permission[] | null>(null);
  const trusted = manifest?.mode === 'trusted';
  const name = manifest?.name ?? plugin.id;

  const onToggle = () => {
    if (enabled) disablePlugin(plugin.id);
    else if (asked.length > 0) setChoosing(pluginStates[plugin.id]?.granted.filter((p) => asked.includes(p)) ?? asked);
    else enablePlugin(plugin);
  };

  const onGrant = (permission: Permission, on: boolean) => {
    const current = choosing ?? granted;
    const next = on ? [...current, permission] : current.filter((p) => p !== permission);
    if (choosing) setChoosing(next);
    else enablePlugin(plugin, next);
  };

  const onUninstall = async () => {
    const ok = await ask(`Uninstall ${name}? Its files are removed from this device.`, { title: 'Uninstall Plugin' });
    if (!ok) return;
    uninstallPlugin(plugin.id).catch((e) => onError(errorText(e)));
  };

  const viewers = manifest?.contributes.viewers.flatMap((v) => v.extensions) ?? [];
  const shown = choosing ?? (enabled ? granted : null);

  return (
    <li className="flex flex-col gap-1 rounded-box border border-base-300 p-2" data-testid={`plugin-${plugin.id}`}>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          className="toggle toggle-sm toggle-primary"
          aria-label={`Enable ${name}`}
          checked={enabled || choosing !== null}
          disabled={Boolean(plugin.error) || trusted}
          onChange={onToggle}
        />
        <span className="flex-1 truncate">
          {name}
          <span className="ml-2 text-xs text-base-content/60">{manifest?.version}</span>
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          aria-label={`Uninstall ${name}`}
          onClick={() => void onUninstall()}
        >
          <IconTrash size={14} />
        </button>
      </div>
      {manifest?.description ? <p className="text-xs text-base-content/70">{manifest.description}</p> : null}
      {viewers.length > 0 ? (
        <p className="text-xs text-base-content/70">Opens {viewers.map((ext) => `.${ext}`).join(', ')}</p>
      ) : null}
      {plugin.error ? <p className="text-xs text-error">{plugin.error}</p> : null}
      {trusted && !plugin.error ? (
        <p className="text-xs text-warning">
          Trusted plugins run with full access to your files; they can not be enabled yet.
        </p>
      ) : null}
      {shown && asked.length > 0 ? (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-xs text-base-content/70">{choosing ? `${name} asks to:` : 'Allowed to:'}</legend>
          {asked.map((permission) => (
            <label key={permission} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                className="checkbox checkbox-xs"
                checked={shown.includes(permission)}
                onChange={(e) => onGrant(permission, e.target.checked)}
              />
              {PERMISSION_LABELS[permission]}
            </label>
          ))}
          {choosing ? (
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setChoosing(null)}>Cancel</button>
              <button
                type="button"
                className="btn btn-primary btn-xs"
                onClick={() => { enablePlugin(plugin, choosing); setChoosing(null); }}
              >
                Enable
              </button>
            </div>
          ) : null}
        </fieldset>
      ) : null}
    </li>
  );
}
