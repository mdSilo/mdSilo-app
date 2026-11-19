import { useEffect } from "react";
import { TbDownload, TbX } from "react-icons/tb";
import { useStore } from "@/state/store";
import { openUrl } from "@/workspace/open";
import { useT } from "@/i18n";
import {
  checkForUpdate,
  installUpdate,
  releaseUrl,
  useUpdater,
} from "./updater";

/** after the start, not to slow it down */
const CHECK_DELAY = 5000;

/**
 * The desktop app offers its new version: checked on startup (the setting
 * Check for Updates on Startup) or from About, see ./updater.
 */
export default function UpdatePrompt() {
  const t = useT();
  const checkOnStartup = useStore((state) => state.checkForUpdates);
  const { status, update, percent, error, dismissed } = useUpdater();

  useEffect(() => {
    if (!checkOnStartup) return;
    const timer = setTimeout(() => void checkForUpdate(), CHECK_DELAY);
    return () => clearTimeout(timer);
    // once per run: not again when the setting is turned on
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // a failed check says nothing here (offline...); About shows it
  const shown =
    update &&
    !dismissed &&
    (status === "available" || status === "installing" || status === "error");
  if (!shown) return null;

  const close = () => useUpdater.setState({ dismissed: true });
  const download = () => void openUrl(releaseUrl(update.version));

  return (
    <div
      role="status"
      className="fixed inset-x-0 z-50 flex flex-wrap items-center gap-2 p-2 pl-3 mx-auto text-sm rounded-sm w-fit shadow-popover bg-base-200 text-base-content max-w-[calc(100vw-2rem)]"
      style={{ bottom: "1rem" }}
    >
      {status === "installing" ? (
        <span>
          {percent === null
            ? t("Updating mdSilo to {version}…", { version: update.version })
            : t("Updating mdSilo to {version}… {percent}%", {
                version: update.version,
                percent,
              })}
        </span>
      ) : status === "error" ? (
        <span className="text-error" title={error ?? undefined}>
          {t("Could not update to {version}.", { version: update.version })}
        </span>
      ) : (
        <span>
          {t("mdSilo {version} is available.", { version: update.version })}
        </span>
      )}
      {status === "available" ? (
        <button className="ms-link" onClick={download}>
          {t("What's New")}
        </button>
      ) : null}
      {status === "available" && update.canInstall ? (
        <button
          className="flex items-center gap-1 px-2 py-1 rounded-sm btn-primary bg-primary text-primary-content"
          onClick={() => void installUpdate()}
        >
          <TbDownload size={16} />
          {t("Update and Restart")}
        </button>
      ) : status !== "installing" ? (
        <button
          className="flex items-center gap-1 px-2 py-1 rounded-sm btn-primary bg-primary text-primary-content"
          onClick={download}
        >
          <TbDownload size={16} />
          {t("Download")}
        </button>
      ) : null}
      {status !== "installing" ? (
        <button
          aria-label={t("Later")}
          className="p-1 rounded-sm hover:bg-base-content/10"
          onClick={close}
        >
          <TbX size={16} />
        </button>
      ) : null}
    </div>
  );
}
