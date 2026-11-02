import { useMemo } from "react";
import { useStore } from "@/state/store";
import { useCurrentViewContext } from "@/state/useCurrentView";
import type { PluginMethods } from "./host";
import { workspaceMethods } from "./workspaceApi";
import PluginFrame from "./PluginFrame";
import { contributesOf } from "./registry";
import { useTrustedVersion } from "./trusted";

/** A view of the workspace made by a plugin, opened from the side menu. */
export default function PluginView() {
  const { state, dispatch } = useCurrentViewContext();
  const { pluginId = "", pluginViewId = "" } = state;
  const plugin = useStore((s) =>
    s.installedPlugins.find((p) => p.id === pluginId),
  );
  // views added as a trusted plugin runs too
  useTrustedVersion();
  const view = plugin && contributesOf(plugin).views.find(
    (v) => v.id === pluginViewId,
  );
  const methods: PluginMethods = useMemo(
    () => ({
      ...workspaceMethods(dispatch),
      "view.info": { handler: () => ({ id: pluginViewId }) },
    }),
    [dispatch, pluginViewId],
  );

  if (!plugin || !view) {
    return (
      <div className="p-4 text-sm text-base-content/70">
        The view {pluginViewId} of {pluginId} is not installed.
      </div>
    );
  }
  return (
    <PluginFrame
      key={`${plugin.id}/${view.id}`}
      plugin={plugin}
      page={view.page}
      methods={methods}
    />
  );
}
