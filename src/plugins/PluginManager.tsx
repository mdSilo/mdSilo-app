import { useState } from "react";
import { ask, open } from "@tauri-apps/plugin-dialog";
import { TbRefresh as IconRefresh, TbTrash as IconTrash } from "react-icons/tb";
import { useStore } from "@/state/store";
import { BaseModal } from "@/ui/BaseModal";
import { isTauri } from "@/workspace/util";
import { dataRoot } from "@/workspace/layout";
import { t, useT } from "@/i18n";
import { PERMISSION_LABELS, type Permission } from "./manifest";
import {
  developPlugin,
  disablePlugin,
  enablePlugin,
  grantedPermissions,
  installPlugin,
  installPluginZip,
  isChanged,
  isEnabled,
  loadPlugins,
  movePlugin,
  stopDeveloping,
  uninstallPlugin,
  updatePlugin,
  type InstalledPlugin,
} from "./registry";
import { PluginIcon } from "./PluginIcon";
import { trustedError, trustedPage, useTrustedVersion } from "./trusted";
import PluginFrame from "./PluginFrame";
import { devError } from "./dev";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The plugin manager, a dialog of its own: from the Plugins menu of the side menu, or the settings */
export function PluginsModal() {
  const t = useT();
  const isOpen = useStore((state) => state.isPluginsOpen);
  const setIsOpen = useStore((state) => state.setIsPluginsOpen);
  return (
    <BaseModal
      title={t("Plugins")}
      scrollBody
      isOpen={isOpen}
      handleClose={() => setIsOpen(false)}
    >
      <PluginManager />
    </BaseModal>
  );
}

/** The plugins installed on this device: install, enable with permissions, uninstall. */
export default function PluginManager() {
  const t = useT();
  const plugins = useStore((state) => state.installedPlugins);
  const [error, setError] = useState("");
  const isTrusted = (p: InstalledPlugin) => p.manifest?.mode === "trusted";
  const sandboxed = plugins.filter((p) => !isTrusted(p));
  const trusted = plugins.filter(isTrusted);

  const onInstall = async () => {
    setError("");
    const dir = await open({
      title: t("Install Plugin from Folder"),
      directory: true,
      multiple: false,
    });
    if (typeof dir !== "string") return;
    try {
      await installPlugin(dir);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const onDevelop = async () => {
    setError("");
    const dir = await open({
      title: t("Develop Plugin from Folder"),
      directory: true,
      multiple: false,
    });
    if (typeof dir !== "string") return;
    try {
      await developPlugin(dir);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const onInstallZip = async () => {
    setError("");
    const zip = await open({
      title: t("Install Plugin from .zip"),
      multiple: false,
      filters: [{ name: "Plugin", extensions: ["zip"] }],
    });
    if (typeof zip !== "string") return;
    try {
      await installPluginZip(zip);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const onReload = () => {
    setError("");
    loadPlugins().catch((e) => setError(errorText(e)));
  };

  if (!isTauri) {
    return (
      <div
        className="flex items-center justify-between"
        data-testid="plugin-manager"
      >
        <span>{t("Plugins")}</span>
        <span className="text-xs text-base-content/60">
          {t("In the desktop app")}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1" data-testid="plugin-manager">
      <div className="flex items-center justify-center gap-1">
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          aria-label={t("Reload Plugins")}
          title={t(
            "Read the plugins installed again; to take the changes of a plugin's folder, use its Update",
          )}
          onClick={onReload}
        >
          <IconRefresh size={14} />
        </button>
        <button
          type="button"
          className="btn btn-xs"
          onClick={() => void onInstall()}
        >
          {t("Install Folder")}
        </button>
        <button
          type="button"
          className="btn btn-xs"
          onClick={() => void onInstallZip()}
        >
          {t("Install .zip")}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          title={t(
            "Install a plugin from its folder, and again each time its files change",
          )}
          onClick={() => void onDevelop()}
        >
          {t("Develop")}
        </button>
      </div>
      {error ? <p className="text-xs text-error">{error}</p> : null}
      {plugins.length > 0 ? (
        <>
          <ul className="flex flex-col gap-2">
            {sandboxed.map((plugin) => (
              <PluginItem key={plugin.id} plugin={plugin} onError={setError} />
            ))}
          </ul>
          {trusted.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-warning">
                {t("Trusted: run in the app, with full access")}
              </h3>
              <ul className="flex flex-col gap-2">
                {trusted.map((plugin) => (
                  <PluginItem
                    key={plugin.id}
                    plugin={plugin}
                    onError={setError}
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <p className="text-xs text-base-content/60">
          {t(
            "No plugin yet. A plugin is a folder with a manifest.json, it runs in a sandbox.",
          )}
        </p>
      )}
    </div>
  );
}

function PluginItem({
  plugin,
  onError,
}: {
  plugin: InstalledPlugin;
  onError: (error: string) => void;
}) {
  const t = useT();
  const pluginStates = useStore((state) => state.pluginStates);
  const initDir = useStore((state) => state.initDir);
  const layout = useStore((state) => state.layout);
  const hasWorkspace = Boolean(dataRoot({ initDir, layout }));
  const [moving, setMoving] = useState(false);
  const enabled = isEnabled(plugin, pluginStates);
  const changed = isChanged(plugin, pluginStates);
  const granted = grantedPermissions(plugin, pluginStates);
  const { manifest } = plugin;
  const asked = manifest?.permissions ?? [];
  // the permissions to grant, chosen before enabling
  const [choosing, setChoosing] = useState<Permission[] | null>(null);
  const trusted = manifest?.mode === "trusted";
  const name = manifest?.name ?? plugin.id;
  useTrustedVersion();
  const loadError = trusted && enabled ? trustedError(plugin.id) : undefined;
  // a page of settings, as a trusted plugin (or an Obsidian one) may have
  const hasSettings =
    trusted && enabled && Boolean(trustedPage(plugin, "settings"));
  const [showSettings, setShowSettings] = useState(false);

  const onToggle = async () => {
    if (enabled) disablePlugin(plugin.id);
    else if (trusted) {
      const ok = await ask(
        t(
          "{name} is a trusted plugin: it runs in the app itself, not in a sandbox, with full access to your files, your notes and the internet, and it can change how the app works. Enable it only if you trust {author}.",
          { name, author: manifest?.author ?? t("its author") },
        ),
        { title: t("Enable Trusted Plugin"), kind: "warning" },
      );
      if (ok) enablePlugin(plugin);
    } else if (asked.length > 0)
      setChoosing(
        pluginStates[plugin.id]?.granted.filter((p) => asked.includes(p)) ??
          asked,
      );
    else enablePlugin(plugin);
  };

  const onGrant = (permission: Permission, on: boolean) => {
    const current = choosing ?? granted;
    const next = on
      ? [...current, permission]
      : current.filter((p) => p !== permission);
    if (choosing) setChoosing(next);
    else enablePlugin(plugin, next);
  };

  const inWorkspace = plugin.where === "workspace";

  const onUninstall = async () => {
    const ok = await ask(
      inWorkspace
        ? `Uninstall ${name}? Its files are removed from the workspace, and from the other devices after a sync.`
        : `Uninstall ${name}? Its files are removed from this device.`,
      { title: t("Uninstall Plugin") },
    );
    if (!ok) return;
    uninstallPlugin(plugin).catch((e) => onError(errorText(e)));
  };

  const onSync = (on: boolean) => {
    setMoving(true);
    movePlugin(plugin, on ? "workspace" : "device")
      .catch((e) => onError(errorText(e)))
      .finally(() => setMoving(false));
  };

  const devSource = pluginStates[plugin.id]?.devSource;
  const reloadError = devSource ? devError(plugin.id) : undefined;
  // installed from a folder or a .zip here: updated from there
  const source = devSource ? undefined : pluginStates[plugin.id]?.source;
  const [updating, setUpdating] = useState(false);
  const onUpdate = () => {
    setUpdating(true);
    onError("");
    updatePlugin(plugin)
      .catch((e) => onError(errorText(e)))
      .finally(() => setUpdating(false));
  };

  const viewers =
    manifest?.contributes.viewers.flatMap((v) => v.extensions) ?? [];
  const shown = choosing ?? (enabled ? granted : null);

  return (
    <li
      className="flex flex-col gap-1 rounded-box border border-base-300 p-2"
      data-testid={`plugin-${plugin.id}`}
    >
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          className="toggle toggle-sm toggle-primary"
          aria-label={t("Enable {name}", { name })}
          checked={enabled || choosing !== null}
          disabled={Boolean(plugin.error)}
          onChange={() => void onToggle()}
        />
        <PluginIcon plugin={plugin} size={18} />
        <span className="flex-1 truncate">
          {name}
          <span className="ml-2 text-xs text-base-content/60">
            {manifest?.version}
          </span>
          {manifest?.compat === "obsidian" ? (
            <span
              className="ml-2 badge badge-xs badge-outline"
              title={t(
                "An Obsidian plugin, run by a partial compatibility layer: simple plugins work, those using Obsidian's editor or layout don't",
              )}
            >
              {t("Obsidian (partial)")}
            </span>
          ) : null}
          {devSource ? (
            <span
              className="ml-2 badge badge-xs badge-info"
              title={t(
                "Installed again from {devSource} when its files change",
                { devSource },
              )}
            >
              {t("Dev")}
            </span>
          ) : null}
        </span>
        {devSource ? (
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            aria-label={t("Stop developing {name}", { name })}
            onClick={() => stopDeveloping(plugin.id)}
          >
            {t("Stop Dev")}
          </button>
        ) : null}
        {source ? (
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            title={t("Install again from {path}, to take its changes", {
              path: source.path,
            })}
            disabled={updating}
            onClick={onUpdate}
          >
            <IconRefresh size={14} className={updating ? "animate-spin" : ""} />
            {t("Update")}
          </button>
        ) : null}
        {hasSettings ? (
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            aria-expanded={showSettings}
            onClick={() => setShowSettings(!showSettings)}
          >
            {t("Settings")}
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          aria-label={t("Uninstall {name}", { name })}
          onClick={() => void onUninstall()}
        >
          <IconTrash size={14} />
        </button>
      </div>
      {manifest?.description ? (
        <p className="text-xs text-base-content/70">{manifest.description}</p>
      ) : null}
      {viewers.length > 0 ? (
        <p className="text-xs text-base-content/70">
          {t("Opens {extensions}", {
            extensions: viewers.map((ext) => `.${ext}`).join(", "),
          })}
        </p>
      ) : null}
      {plugin.error ? (
        <p className="text-xs text-error">{plugin.error}</p>
      ) : null}
      {reloadError ? <p className="text-xs text-error">{reloadError}</p> : null}
      {changed && !plugin.error ? (
        <p className="text-xs text-warning">
          {t(
            "Changed in the workspace since you enabled it; enable it again to run it.",
          )}
        </p>
      ) : null}
      <label className="flex items-center gap-2 text-xs text-base-content/70">
        <input
          type="checkbox"
          className="checkbox checkbox-xs"
          checked={inWorkspace}
          disabled={moving || (!inWorkspace && !hasWorkspace)}
          onChange={(e) => onSync(e.target.checked)}
        />
        {t("Sync with workspace")}
        {inWorkspace ? (
          <span className="text-base-content/50">
            {t("(other devices get it disabled)")}
          </span>
        ) : null}
      </label>
      {trusted && !plugin.error ? (
        <p className="text-xs text-warning">
          {t("Runs in the app with full access to your files.")}
        </p>
      ) : null}
      {loadError ? <p className="text-xs text-error">{loadError}</p> : null}
      {hasSettings && showSettings ? (
        <div
          className="max-h-96 overflow-auto rounded-box border border-base-300 p-2"
          data-testid={`plugin-settings-${plugin.id}`}
        >
          <PluginFrame plugin={plugin} page="settings" />
        </div>
      ) : null}
      {!trusted && shown && asked.length > 0 ? (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-xs text-base-content/70">
            {choosing ? t("{name} asks to:", { name }) : t("Allowed to:")}
          </legend>
          {asked.map((permission) => (
            <label key={permission} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                className="checkbox checkbox-xs"
                checked={shown.includes(permission)}
                onChange={(e) => onGrant(permission, e.target.checked)}
              />
              {t(PERMISSION_LABELS[permission])}
            </label>
          ))}
          {choosing ? (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => setChoosing(null)}
              >
                {t("Cancel")}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-xs"
                onClick={() => {
                  enablePlugin(plugin, choosing);
                  setChoosing(null);
                }}
              >
                {t("Enable")}
              </button>
            </div>
          ) : null}
        </fieldset>
      ) : null}
    </li>
  );
}
