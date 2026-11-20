/**
 * What the web version keeps in the browser, as a whole: how much space it
 * takes, whether the browser may clear it, a reminder to back it up, and
 * clearing all of it. The data is in three places:
 * - IndexedDB `mdsilo`: the files, the settings (kv), the feeds (idb.ts)
 * - IndexedDB `mdsilo-fonts`: the font files added (src/custom/fonts.ts)
 * - localStorage: the language of the interface, read before IndexedDB opens
 * The app itself (for offline use) is in Cache Storage, kept on clearing.
 */
import { t } from "@/i18n";
import { DB_NAME, KV, closeDB, get, isQuotaError, put } from "./idb";
import * as fs from "./fs";
import { ROOT } from "./path";
import { lastBackup } from "./backup";
import { showMessage } from "./browser";

export const FONTS_DB_NAME = "mdsilo-fonts";

export type StorageStatus = {
  /** bytes used by the site, all its storage; undefined if not told */
  usage?: number;
  /** bytes the browser gives the site */
  quota?: number;
  /** the browser keeps the data when it is short of space */
  persisted: boolean;
  /** the browser can be asked to keep it */
  canPersist: boolean;
};

const storageManager = () =>
  typeof navigator !== "undefined" ? navigator.storage : undefined;

export async function storageStatus(): Promise<StorageStatus> {
  const storage = storageManager();
  const status: StorageStatus = {
    persisted: false,
    canPersist: Boolean(storage?.persist),
  };
  try {
    const estimate = await storage?.estimate?.();
    status.usage = estimate?.usage;
    status.quota = estimate?.quota;
  } catch {
    // not told
  }
  try {
    status.persisted = Boolean(await storage?.persisted?.());
  } catch {
    // not told
  }
  return status;
}

/** `12.3 MB` */
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

// ---- the browser is out of space ----

let lastQuotaMessage = 0;

/** Say the storage is full (once in a while), with how much is used. */
export async function reportQuotaError(e: unknown): Promise<boolean> {
  if (!isQuotaError(e)) return false;
  const now = Date.now();
  if (now - lastQuotaMessage < 10_000) return true;
  lastQuotaMessage = now;
  const { usage, quota } = await storageStatus();
  const used =
    usage !== undefined && quota
      ? ` ${t("Used {used} of {quota}", {
          used: formatBytes(usage),
          quota: formatBytes(quota),
        })}.`
      : "";
  showMessage(
    t("The storage of this browser is full"),
    t(
      "The change was not saved.{used} Remove some books or dictionaries, or back up and free space in Settings > Storage.",
      { used },
    ),
  );
  return true;
}

// ---- the reminder to back up ----

/** KV key: until when the reminder is put off, ms since epoch */
export const BACKUP_SNOOZE_KEY = "backup_reminder_until";
const DAY = 24 * 60 * 60 * 1000;
export const BACKUP_REMIND_DAYS = 14;

/**
 * Time to remind of a backup: none for BACKUP_REMIND_DAYS (since the first
 * run if never), not put off, and files changed since the last one.
 */
export async function backupReminderDue(now = Date.now()): Promise<boolean> {
  const until = await get<unknown>(KV, BACKUP_SNOOZE_KEY).catch(() => 0);
  if (typeof until === "number" && now < until) return false;
  const last = await lastBackup();
  const since = last ?? (await fs.stat(ROOT))?.created ?? now;
  if (now - since < BACKUP_REMIND_DAYS * DAY) return false;
  // the files changed since, the demo of the first run not counted
  const entries = await fs.walk(ROOT);
  return entries.some((e) => !e.is_dir && e.modified > since + 60_000);
}

/** Put the reminder off for some days. */
export async function snoozeBackupReminder(days = 7): Promise<void> {
  await put(KV, Date.now() + days * DAY, BACKUP_SNOOZE_KEY);
}

// ---- clearing it all ----

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve();
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    // another tab keeps it open: it is deleted once that one closes it
    req.onblocked = () => resolve();
  });
}

/**
 * Delete everything the app keeps in this browser: the files, the settings,
 * the feeds, the fonts, the language. The page should be reloaded after.
 */
export async function clearAllData(): Promise<void> {
  await closeDB();
  await deleteDatabase(DB_NAME);
  await deleteDatabase(FONTS_DB_NAME);
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // no storage (private mode): nothing kept there
  }
}
