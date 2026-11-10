import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { t } from "@/i18n";

/**
 * Big files chosen to sync (git): a reminder first. Git hosts limit the size
 * of a file (GitHub refuses one over 100 MB, warns over 50 MB), and every
 * version of a file synced stays in the history, on each device.
 */
export const BIG_FILE_BYTES = 50 * 1024 * 1024;
/** GitHub refuses a file bigger. */
export const HOST_LIMIT_BYTES = 100 * 1024 * 1024;

export const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 * 1024
    ? `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
    : bytes >= 1024 * 1024
      ? `${Math.round(bytes / 1024 / 1024)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** The size of a file, 0 if it cannot be told (e.g. not on this device). */
export async function fileSize(path: string): Promise<number> {
  try {
    const meta = await invoke<{ size?: number } | null>("get_file_meta", {
      filePath: path,
    });
    return meta?.size ?? 0;
  } catch {
    return 0;
  }
}

/** A thing to sync, e.g. a book or a dictionary, with the size of its biggest file. */
export type SyncItem = { name: string; size: number };

/** The reminder for things to sync with big files; none if no file is big. */
export function bigSyncMessage(items: SyncItem[]): string | undefined {
  const big = items
    .filter((item) => item.size > BIG_FILE_BYTES)
    .sort((a, b) => b.size - a.size);
  if (!big.length) return undefined;
  const names = big
    .slice(0, 5)
    .map((item) => `${item.name} (${formatSize(item.size)})`)
    .join(", ");
  const files =
    big.length > 5
      ? t("{names} and {count} more", { names, count: big.length - 5 })
      : names;
  const over = big.some((item) => item.size > HOST_LIMIT_BYTES);
  return (
    t("Big files to sync: {files}.", { files }) +
    "\n\n" +
    (over
      ? t(
          "GitHub refuses a file over 100 MB, and other hosts have limits too: the sync may fail.",
        ) + " "
      : "") +
    t(
      "Every version of a file synced stays in the history, on each device, and makes the syncs slow.",
    ) +
    "\n\n" +
    t("Sync anyway?")
  );
}

/** Ask before syncing big files; true to go on (also when none is big). */
export async function confirmBigSync(items: SyncItem[]): Promise<boolean> {
  const message = bigSyncMessage(items);
  if (!message) return true;
  return ask(message, { title: t("Sync big files?"), kind: "warning" });
}
