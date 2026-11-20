import { useEffect, useState } from "react";
import { TbDatabaseExport, TbRefresh, TbX } from "react-icons/tb";
import { applyUpdate, syncThemeColor, usePwa } from "@/host/web/pwa";
import { exportBackup } from "@/host/web/backup";
import { backupReminderDue, snoozeBackupReminder } from "@/host/web/siteData";
import { useT } from "@/i18n";

/** wait after the start before looking: the workspace opens first */
const REMINDER_DELAY = 20_000;

/**
 * The web version as an installed app: offers to reload into a new version,
 * keeps the browser's bar (theme-color) in the colors of the theme.
 */
export default function PwaPrompts() {
  const t = useT();
  const updateReady = usePwa((s) => s.updateReady);
  const [later, setLater] = useState(false);

  // the theme is set as data-theme on <html> (useTheme): follow it
  useEffect(() => {
    syncThemeColor();
    const observer = new MutationObserver(() => syncThemeColor());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class", "style"],
    });
    return () => observer.disconnect();
  }, []);

  if (!updateReady || later) return <BackupReminder />;
  return (
    <div
      role="status"
      className="fixed inset-x-0 z-50 flex items-center gap-2 p-2 pl-3 mx-auto text-sm rounded-sm w-fit shadow-popover bg-base-200 text-base-content max-w-[calc(100vw-2rem)]"
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <span>{t("A new version of mdSilo is ready.")}</span>
      <button
        className="flex items-center gap-1 px-2 py-1 rounded-sm btn-primary bg-primary text-primary-content"
        onClick={applyUpdate}
      >
        <TbRefresh size={16} />
        {t("Reload")}
      </button>
      <button
        aria-label={t("Later")}
        className="p-1 rounded-sm hover:bg-base-content/10"
        onClick={() => setLater(true)}
      >
        <TbX size={16} />
      </button>
    </div>
  );
}

/** Some time since the last backup, and notes changed since: offer one. */
function BackupReminder() {
  const t = useT();
  const [due, setDue] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      void backupReminderDue()
        .then(setDue)
        .catch(() => setDue(false));
    }, REMINDER_DELAY);
    return () => clearTimeout(timer);
  }, []);

  if (!due) return null;
  const later = () => {
    setDue(false);
    void snoozeBackupReminder().catch(() => undefined);
  };
  return (
    <div
      role="status"
      className="fixed inset-x-0 z-50 flex items-center gap-2 p-2 pl-3 mx-auto text-sm rounded-sm w-fit shadow-popover bg-base-200 text-base-content max-w-[calc(100vw-2rem)]"
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <span>
        {t(
          "Your notes are kept only in this browser, and not backed up for a while.",
        )}
      </span>
      <button
        className="flex items-center gap-1 px-2 py-1 rounded-sm btn-primary bg-primary text-primary-content"
        onClick={() => {
          setDue(false);
          void exportBackup().catch((e) =>
            console.error("Failed to export backup:", e),
          );
        }}
      >
        <TbDatabaseExport size={16} />
        {t("Back Up")}
      </button>
      <button
        aria-label={t("Later")}
        className="p-1 rounded-sm hover:bg-base-content/10"
        onClick={later}
      >
        <TbX size={16} />
      </button>
    </div>
  );
}
