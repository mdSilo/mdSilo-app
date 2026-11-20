import { useCallback, useEffect, useState } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { useT } from "@/i18n";
import {
  canExportToFolder,
  chooseAndRestoreBackup,
  exportBackup,
  exportToFolder,
  lastBackup,
} from "@/host/web/backup";
import { persistStorage } from "@/host/web/pwa";
import {
  clearAllData,
  formatBytes,
  storageStatus,
  type StorageStatus,
} from "@/host/web/siteData";

const run = (what: string, fn: () => Promise<unknown>) => () =>
  void fn().catch((e) => console.error(`Failed to ${what}:`, e));

/**
 * The web version keeps all in this browser: how much, whether the browser
 * may clear it, the backups, and clearing it all.
 */
export function StorageSetting() {
  const t = useT();
  const [status, setStatus] = useState<StorageStatus>();
  const [backedUp, setBackedUp] = useState<number | undefined | null>(null);
  const [denied, setDenied] = useState(false);

  const refresh = useCallback(async () => {
    setStatus(await storageStatus());
    setBackedUp(await lastBackup());
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const keep = async () => {
    const ok = await persistStorage();
    setDenied(!ok);
    await refresh();
  };

  const restore = async () => {
    const count = await chooseAndRestoreBackup();
    // the notes, issues and the library are loaded again
    if (count !== null) window.location.reload();
  };

  const clearAll = async () => {
    const ok = await ask(
      t(
        "Delete all the notes, books, feeds, fonts and settings kept in this browser? Back up first: this cannot be undone.",
      ),
      { title: t("Clear All Data") },
    );
    if (!ok) return;
    await clearAllData();
    window.location.reload();
  };

  const btn = "btn btn-xs";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span>{t("Storage")}</span>
        <span className="text-xs text-base-content/70">
          {status?.usage !== undefined && status.quota
            ? t("Used {used} of {quota}", {
                used: formatBytes(status.usage),
                quota: formatBytes(status.quota),
              })
            : null}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-base-content/70">
          {status?.persisted
            ? t("Kept: the browser does not clear it when short of space.")
            : t(
                "Not kept: the browser may clear it when short of space, Safari after 7 days without a visit.",
              )}
          {denied && !status?.persisted
            ? ` ${t("The browser said no: install the app (Add to Home Screen) to keep it.")}`
            : null}
        </span>
        {status && !status.persisted && status.canPersist ? (
          <button
            type="button"
            className={btn}
            onClick={run("keep the data", keep)}
          >
            {t("Keep My Data")}
          </button>
        ) : null}
      </div>
      <div className="text-xs text-base-content/70">
        {backedUp === null
          ? null
          : backedUp === undefined
            ? t("Never backed up.")
            : t("Last backup: {date}", {
                date: new Date(backedUp).toLocaleString(),
              })}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className={btn}
          onClick={run("back up", async () => {
            await exportBackup();
            await refresh();
          })}
        >
          {t("Back Up (zip)")}
        </button>
        {canExportToFolder() ? (
          <button
            type="button"
            className={btn}
            onClick={run("back up to a folder", async () => {
              await exportToFolder();
              await refresh();
            })}
          >
            {t("Back Up to Folder")}
          </button>
        ) : null}
        <button
          type="button"
          className={btn}
          onClick={run("restore the backup", restore)}
        >
          {t("Restore Backup")}
        </button>
        <button
          type="button"
          className={`${btn} btn-error btn-outline`}
          onClick={run("clear the data", clearAll)}
        >
          {t("Clear All Data")}
        </button>
      </div>
    </div>
  );
}
