import { getVersion, getTauriVersion } from "@tauri-apps/api/app";
import { useState, useEffect } from "react";
import { openUrl } from "@/workspace/open";
import { getLog, clearLog } from "@/state/storage";
import { isTauri, isWeb } from "@/workspace/util";
import { BaseModal } from "@/ui/BaseModal";
import { useT } from "@/i18n";
import {
  checkForUpdate,
  installUpdate,
  RELEASES_URL,
  releaseUrl,
  useUpdater,
} from "@/shell/updater";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
};

export default function AboutModal({ isOpen, handleClose }: Props) {
  const t = useT();
  const [appVersion, setAppVersion] = useState("");
  const [tauriVersion, setTauriVersion] = useState("");
  const [hasVersion, setHasVersion] = useState(false);

  useEffect(() => {
    if (!hasVersion) {
      getVersion()
        .then((ver) => setAppVersion(ver))
        .catch(() => {
          /**/
        });
      getTauriVersion()
        .then((ver) => setTauriVersion(ver))
        .catch(() => {
          /**/
        });
    }
    return () => {
      setHasVersion(true);
    };
  }, [hasVersion]);

  return (
    <BaseModal title={t("About")} isOpen={isOpen} handleClose={handleClose}>
      <div className="flex flex-col justify-center px-6">
        <h1>{isWeb ? t("mdSilo Web") : t("mdSilo Desktop")}</h1>
        <p className="mt-4 font-bold">
          {t("App Version: {version}", { version: appVersion })}
        </p>
        {isWeb ? (
          <p className="mt-4">
            {t("Notes are stored in this browser (IndexedDB).")}
          </p>
        ) : (
          <p className="mt-4 font-bold">
            {t("Tauri Version: {version}", { version: tauriVersion })}
          </p>
        )}
        <div className="flex justify-center px-2">
          <button
            className="ms-link m-2"
            onClick={async () => {
              await clearLog();
            }}
          >
            {t("Clear Log")}
          </button>
          <button
            className="ms-link m-2"
            onClick={async () => {
              await navigator.clipboard.writeText(
                `App: ${appVersion} \n Tauri: ${tauriVersion}`,
              );
            }}
          >
            {t("Copy About")}
          </button>
          <button
            className="ms-link m-2"
            onClick={async () => {
              const log = await getLog();
              // console.log("log", log);
              await navigator.clipboard.writeText(JSON.stringify(log));
            }}
          >
            {t("Copy Log")}
          </button>
        </div>
        {isTauri && !isWeb ? (
          <UpdateCheck />
        ) : (
          <button
            className="mt-4 font-bold pop-btn"
            onClick={async () => {
              await openUrl(RELEASES_URL);
            }}
          >
            {t("Check for Updates")}
          </button>
        )}
      </div>
    </BaseModal>
  );
}

/** Check for a new version on GitHub, install it: see shell/updater */
function UpdateCheck() {
  const t = useT();
  const { status, update, percent, error } = useUpdater();

  let message = "";
  if (status === "checking") message = t("Checking for updates…");
  else if (status === "latest") message = t("mdSilo is up to date.");
  else if (status === "installing" && update)
    message =
      percent === null
        ? t("Updating mdSilo to {version}…", { version: update.version })
        : t("Updating mdSilo to {version}… {percent}%", {
            version: update.version,
            percent,
          });
  else if (status === "available" && update)
    message = t("mdSilo {version} is available.", { version: update.version });
  else if (status === "error")
    message = update
      ? t("Could not update to {version}: {error}", {
          version: update.version,
          error: error ?? "",
        })
      : t("Could not check for updates: {error}", { error: error ?? "" });

  const busy = status === "checking" || status === "installing";
  return (
    <div className="flex flex-col items-center mt-4 gap-2">
      {status === "available" && update ? (
        <div className="flex gap-2">
          {update.canInstall ? (
            <button
              className="font-bold pop-btn"
              onClick={() => void installUpdate()}
            >
              {t("Update and Restart")}
            </button>
          ) : null}
          <button
            className="font-bold pop-btn"
            onClick={() => void openUrl(releaseUrl(update.version))}
          >
            {update.canInstall ? t("What's New") : t("Download")}
          </button>
        </div>
      ) : (
        <button
          className="font-bold pop-btn"
          disabled={busy}
          onClick={() => void checkForUpdate()}
        >
          {t("Check for Updates")}
        </button>
      )}
      {message ? (
        <p
          role="status"
          className={`text-sm text-center ${status === "error" ? "text-error" : ""}`}
        >
          {message}
        </p>
      ) : null}
      {status === "error" ? (
        <button
          className="ms-link text-sm"
          onClick={() => void openUrl(RELEASES_URL)}
        >
          {t("Download from GitHub")}
        </button>
      ) : null}
    </div>
  );
}
