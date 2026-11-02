import { useEffect, useRef } from "react";
import { useStore } from "@/state/store";
import {
  appStyle,
  createHost,
  type PluginHost,
  type PluginMethods,
} from "./host";
import { isEnabled, pluginUrl, type InstalledPlugin } from "./registry";
import {
  mountTrustedPage,
  trustedError,
  trustedPage,
  useTrustedVersion,
} from "./trusted";

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
  const trusted = plugin.manifest?.mode === "trusted";
  // the latest, without a new host on each render
  const methodsRef = useRef(methods);
  methodsRef.current = methods;
  const onHostRef = useRef(onHost);
  onHostRef.current = onHost;
  const hostRef = useRef<PluginHost | null>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !enabled || trusted) return;
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
  }, [plugin, enabled, trusted]);

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
  if (trusted) {
    return (
      <TrustedPage
        plugin={plugin}
        page={page ?? "main"}
        methods={methodsRef}
        onHost={onHostRef}
        className={className}
      />
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

/** A page of a trusted plugin: drawn by its module into an element, no frame. */
function TrustedPage({
  plugin,
  page,
  methods,
  onHost,
  className,
}: {
  plugin: InstalledPlugin;
  page: string;
  methods: { current: PluginMethods | undefined };
  onHost: { current: ((host: PluginHost | null) => void) | undefined };
  className: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // the module draws its pages once it is loaded
  useTrustedVersion();
  const mount = trustedPage(plugin, page);
  const error = trustedError(plugin.id);

  useEffect(() => {
    const element = ref.current;
    if (!element || !mount) return;
    const host = mountTrustedPage(
      plugin,
      mount,
      element,
      () => methods.current ?? {},
    );
    const tell = onHost.current;
    tell?.(host);
    const observer = new MutationObserver(() => host.emit("style", appStyle()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    });
    return () => {
      observer.disconnect();
      host.dispose();
      tell?.(null);
      element.replaceChildren();
    };
  }, [plugin, mount, methods, onHost]);

  return (
    <div className={`h-full w-full overflow-auto ${className}`}>
      {error ? (
        <p className="p-4 text-sm text-error">{error}</p>
      ) : !mount ? (
        <p className="p-4 text-sm text-base-content/70">
          {plugin.manifest?.name ?? plugin.id} has no page {page}.
        </p>
      ) : null}
      {/* the module's own, React leaves it alone */}
      <div ref={ref} className="h-full w-full" data-testid="trusted-page" />
    </div>
  );
}
