import { useEffect, useState } from "react";
import { get, set } from "@/state/storage";
import { useStore } from "@/state/store";
import { BaseModal } from "@/ui/BaseModal";
import { tr, useT } from "@/i18n";

/** storage key, read by the web feed fetcher: src/host/web/feed.ts */
export const CORS_PROXY_KEY = "cors_proxy";

/** The proxy this site has of its own (built in, or set at build time), or the public one. */
type SiteProxy = { proxy: string; isPublic: boolean };

/**
 * The CORS proxy of the web version, for feeds (browsers block most of them
 * without one) and for the AI (the services that do not answer browsers,
 * relayed; see web/cors-proxy-core.mjs). Says which proxy is in use: the
 * user's, the one this site has, or for feeds only the public one.
 */
export function CorsProxySetting() {
  const t = useT();
  const [proxy, setProxy] = useState("");
  const [saved, setSaved] = useState("");
  const [site, setSite] = useState<SiteProxy | null>(null);

  useEffect(() => {
    let active = true;
    get(CORS_PROXY_KEY)
      .then((value) => {
        if (active && typeof value === "string") {
          setProxy(value);
          setSaved(value);
        }
      })
      .catch(() => undefined);
    import("@/host/web/feed")
      .then(async (m) => {
        const proxy = await m.defaultCorsProxy();
        if (active) setSite({ proxy, isPublic: proxy === m.PUBLIC_CORS_PROXY });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const save = async () => {
    const value = proxy.trim();
    if (value === saved) return;
    await set(CORS_PROXY_KEY, value);
    setSaved(value);
  };

  const mine = saved.trim();
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-base-content/80">
        {tr(
          "Used when a feed, or an AI service, can not be reached directly from the browser. {url} is replaced by the address, or the address is appended. {none} for no proxy. Empty: the proxy of this site, said below.",
          { url: <code>{"{url}"}</code>, none: <code>none</code> },
        )}
      </p>
      <input
        type="text"
        aria-label={t("CORS Proxy")}
        className="w-full input input-sm"
        placeholder="https://proxy.example.com/?url={url}"
        value={proxy}
        onChange={(e) => setProxy(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
        }}
      />
      <p
        className="p-2 rounded bg-base-100 text-base-content/80"
        data-testid="cors-proxy-status"
      >
        {mine.toLowerCase() === "none"
          ? t("No proxy: feeds and AI are only fetched directly.")
          : mine
            ? t("In use: your proxy, for feeds and AI.")
            : !site
              ? null
              : site.isPublic
                ? t(
                    "This site has no proxy of its own. Feeds then use a public proxy (api.allorigins.win), which can see their addresses; the AI never uses it, your keys would pass through it: to reach AI services that do not answer browsers, set your own.",
                  )
                : tr(
                    "This site has a proxy already, in use for feeds and AI: {proxy}. Leave the field empty to keep using it.",
                    { proxy: <code className="break-all">{site.proxy}</code> },
                  )}
      </p>
      <p className="text-xs text-base-content/70">
        {tr(
          "Through a proxy for the AI, your keys pass through it. To run your own: {worker} (Cloudflare Workers, free tier) or {node}.",
          {
            worker: <code>web/cors-proxy-worker.mjs</code>,
            node: <code>web/cors-proxy.mjs</code>,
          },
        )}
      </p>
    </div>
  );
}

/** The CORS proxy in a dialog of its own, from the settings (web only). */
export default function CorsProxyModal() {
  const t = useT();
  const isOpen = useStore((state) => state.isCorsProxyOpen);
  const setIsOpen = useStore((state) => state.setIsCorsProxyOpen);
  return (
    <BaseModal
      title={t("CORS Proxy")}
      isOpen={isOpen}
      handleClose={() => setIsOpen(false)}
    >
      <div className="p-3 text-left bg-base-200">
        <CorsProxySetting />
      </div>
    </BaseModal>
  );
}
