import { useEffect, useRef } from "react";
import { useStore } from "@/state/store";
import {
  appStyle,
  createHost,
  type PluginHost,
  type PluginMethods,
} from "./host";
import { isEnabled, pluginUrl, type InstalledPlugin } from "./registry";

type Props = {
  plugin: InstalledPlugin;
  /** the page, in the folder of the plugin; its main page by default */
  page?: string;
  /** the methods of this place, besides app.info and app.style */
  methods?: PluginMethods;
  /** gets the host, to tell the plugin of changes */
  onHost?: (host: PluginHost | null) => void;
  className?: string;
};

/**
 * The page of a plugin, sandboxed: scripts run, but in an opaque origin,
 * so it reaches the app only by the calls of src/plugins/host.ts.
 */
export default function PluginFrame({
  plugin,
  page,
  methods,
  onHost,
  className = "",
}: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const pluginStates = useStore((state) => state.pluginStates);
  const font = useStore((state) => state.font);
  const enabled = isEnabled(plugin, pluginStates);
  // the latest, without a new host on each render
  const methodsRef = useRef(methods);
  methodsRef.current = methods;
  const onHostRef = useRef(onHost);
  onHostRef.current = onHost;
  const hostRef = useRef<PluginHost | null>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !enabled) return;
    const host = createHost(plugin, frame, () => methodsRef.current ?? {});
    hostRef.current = host;
    onHostRef.current?.(host);
    // the look of the app, when it changes
    const observer = new MutationObserver(() => host.emit("style", appStyle()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    });
    return () => {
      observer.disconnect();
      host.dispose();
      hostRef.current = null;
      onHostRef.current?.(null);
    };
  }, [plugin, enabled]);

  useEffect(() => {
    hostRef.current?.emit("style", appStyle());
  }, [font]);

  if (!enabled) {
    return (
      <div className="p-4 text-sm text-base-content/70">
        {plugin.manifest?.name ?? plugin.id} is not enabled.
      </div>
    );
  }
  const main = page ?? plugin.manifest?.main ?? "index.html";
  return (
    <iframe
      ref={frameRef}
      title={plugin.manifest?.name ?? plugin.id}
      src={pluginUrl(plugin.id, main)}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      className={`h-full w-full border-0 bg-base-100 ${className}`}
    />
  );
}
