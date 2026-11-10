import { useMemo, useRef } from "react";
import { useStore } from "@/state/store";
import { useCurrentViewContext } from "@/state/useCurrentView";
import { useT } from "@/i18n";
import type { PluginHost, PluginMethods } from "./host";
import { useWorkspaceChanged } from "./changes";
import { workspaceMethods } from "./workspaceApi";
import PluginFrame from "./PluginFrame";
import { contributesOf } from "./registry";
import { useTrustedVersion } from "./trusted";

/** A view of the workspace made by a plugin, opened from the side menu. */
export default function PluginView() {
  const t = useT();
  const { state, dispatch } = useCurrentViewContext();
  const { pluginId = "", pluginViewId = "" } = state;
  const plugin = useStore((s) =>
    s.installedPlugins.find((p) => p.id === pluginId),
  );
  // views added as a trusted plugin runs too
  useTrustedVersion();
  const view =
    plugin && contributesOf(plugin).views.find((v) => v.id === pluginViewId);
  const host = useRef<PluginHost | null>(null);
  useWorkspaceChanged(host);
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
        {t("The view {view} of {id} is not installed.", {
          view: pluginViewId,
          id: pluginId,
        })}
      </div>
    );
  }
  return (
    <PluginFrame
      key={`${plugin.id}/${view.id}`}
      plugin={plugin}
      page={view.page}
      methods={methods}
      onHost={(h) => {
        host.current = h;
      }}
    />
  );
}
