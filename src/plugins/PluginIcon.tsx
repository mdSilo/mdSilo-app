import { useState } from "react";
import { TbPuzzle } from "react-icons/tb";
import { pluginUrl, type InstalledPlugin } from "./registry";

/** The URL of the icon of the plugin (`icon` of its manifest), if it has one */
export const pluginIconUrl = (plugin: InstalledPlugin): string | undefined =>
  plugin.manifest?.icon
    ? pluginUrl(plugin.id, plugin.manifest.icon)
    : undefined;

/** The icon of the plugin; a puzzle piece if it has none, or it can't be shown */
export function PluginIcon({
  plugin,
  size = 18,
  className = "",
}: {
  plugin: InstalledPlugin;
  size?: number;
  className?: string;
}) {
  const url = pluginIconUrl(plugin);
  const [failed, setFailed] = useState<string>();
  if (!url || failed === url)
    return <TbPuzzle size={size} className={`shrink-0 ${className}`} />;
  return (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 object-contain ${className}`}
      onError={() => setFailed(url)}
    />
  );
}
