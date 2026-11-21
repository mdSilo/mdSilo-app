import { useEffect, useState } from "react";
import { useStore } from "@/state/store";
import { useT } from "@/i18n";
import { useAiProviders } from "./providers";

/**
 * The digest of the feeds (see ./digest), among the settings of the feed
 * reader: made each day if set, or now. It needs an AI provider: without
 * one, said so, with the way to set one up.
 */
export default function DigestSetting() {
  const t = useT();
  const aiSettings = useStore((state) => state.aiSettings);
  const setAiSettings = useStore((state) => state.setAiSettings);
  const setIsAiSettingsOpen = useStore((state) => state.setIsAiSettingsOpen);
  const ws = useStore((state) => state.initDir);
  const loaded = useAiProviders((s) => s.loaded);
  const hasProvider = useAiProviders((s) => s.providers.length > 0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loaded)
      void useAiProviders
        .getState()
        .load()
        .catch(() => undefined);
  }, [loaded]);
  if (!ws) return null;

  const now = async () => {
    setBusy(true);
    setMessage("");
    try {
      const { makeDigest } = await import("./digest");
      const id = await makeDigest();
      setMessage(
        id
          ? t("Made: {note}", { note: id.split(/[\\/]/).pop() ?? id })
          : t("No new unread articles"),
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1 text-sm" data-testid="ai-digest">
      <span className="font-semibold">{t("Digest of the feeds")}</span>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          className="checkbox checkbox-xs"
          disabled={!hasProvider}
          checked={Boolean(aiSettings.digest) && hasProvider}
          onChange={(e) =>
            setAiSettings({ ...aiSettings, digest: e.target.checked })
          }
        />
        <span>
          {t(
            "Each day, summarize the new unread articles into a note in chats/",
          )}
        </span>
      </label>
      {hasProvider ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-xs"
            disabled={busy}
            onClick={() => void now()}
          >
            {busy ? t("Making…") : t("Make today's digest now")}
          </button>
          {message ? (
            <span className="text-xs text-base-content/70">{message}</span>
          ) : null}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-base-content/70">
          <span>{t("It needs an AI provider.")}</span>
          <button
            type="button"
            className="btn btn-xs"
            onClick={() => setIsAiSettingsOpen(true)}
          >
            {t("Set up AI")}
          </button>
        </div>
      )}
    </div>
  );
}
