/**
 * Back up the notes (the virtual file system in IndexedDB): to a zip file,
 * or (Chromium) to a folder on the device; and restore a backup zip.
 */
import { t } from "@/i18n";
import * as fs from "./fs";
import { KV, get, put } from "./idb";
import { ROOT, normalize, parent } from "./path";
import { createZipOfBlobs, type BlobZipEntry } from "./zip";
import { downloadBlob, showMessage } from "./browser";
import { ask } from "./dialog";

/** KV key: when the last backup was made, ms since epoch */
export const LAST_BACKUP_KEY = "last_backup";

/** The entries of dir (itself included unless the root), by path. */
async function entriesOf(dir: string) {
  const d = normalize(dir);
  const self = d === ROOT ? undefined : await fs.stat(d);
  if (d !== ROOT && !self?.is_dir) throw new Error(`No such folder: ${dir}`);
  // keep the folder itself in the backup, e.g. `mdSilo/Welcome.md`
  const base = d === ROOT ? ROOT : parent(d);
  const prefixLen = base === ROOT ? 1 : base.length + 1;
  const entries = [...(self ? [self] : []), ...(await fs.walk(d))].sort(
    (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
  );
  return entries.map((e) => ({ entry: e, name: e.path.slice(prefixLen) }));
}

export async function buildBackup(
  dir = ROOT,
): Promise<{ blob: Blob; count: number }> {
  const zipEntries: BlobZipEntry[] = [];
  let count = 0;
  for (const { entry: e, name } of await entriesOf(dir)) {
    if (e.is_dir) {
      zipEntries.push({ name: `${name}/`, modified: e.modified });
      continue;
    }
    // the Blobs (books, dictionaries) go into the zip as they are, not copied
    zipEntries.push({ name, data: e.data ?? "", modified: e.modified });
    count += 1;
  }
  return { blob: await createZipOfBlobs(zipEntries), count };
}

export function backupFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `mdsilo-backup-${date}-${time}.zip`;
}

async function markBackedUp(): Promise<void> {
  await put(KV, Date.now(), LAST_BACKUP_KEY).catch(() => undefined);
}

/** When the last backup was made, ms since epoch; undefined if never. */
export async function lastBackup(): Promise<number | undefined> {
  const value = await get<unknown>(KV, LAST_BACKUP_KEY).catch(() => undefined);
  return typeof value === "number" ? value : undefined;
}

/** build the backup and download it, return the number of files */
export async function exportBackup(dir = ROOT): Promise<number> {
  const { blob, count } = await buildBackup(dir);
  downloadBlob(blob, backupFileName());
  if (normalize(dir) === ROOT) await markBackedUp();
  showMessage(t("Backup"), `${count} file(s) exported`);
  return count;
}

type DirHandle = {
  name: string;
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<DirHandle>;
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<{
    createWritable(): Promise<{
      write(data: Blob | string): Promise<void>;
      close(): Promise<void>;
    }>;
  }>;
};

type DirPicker = (options?: {
  id?: string;
  mode?: "read" | "readwrite";
}) => Promise<DirHandle>;

const dirPicker = (): DirPicker | undefined =>
  typeof window === "undefined"
    ? undefined
    : (window as unknown as { showDirectoryPicker?: DirPicker })
        .showDirectoryPicker;

/** The browser can write to a folder of the device (Chromium on desktop). */
export const canExportToFolder = () => Boolean(dirPicker());

/** Write the files under dir into the folder `target`, return the count. */
export async function writeToFolder(
  target: DirHandle,
  dir = ROOT,
): Promise<number> {
  const dirs = new Map<string, DirHandle>([["", target]]);
  const dirOf = async (rel: string): Promise<DirHandle> => {
    const known = dirs.get(rel);
    if (known) return known;
    const cut = rel.lastIndexOf("/");
    const up = await dirOf(cut < 0 ? "" : rel.slice(0, cut));
    const handle = await up.getDirectoryHandle(rel.slice(cut + 1), {
      create: true,
    });
    dirs.set(rel, handle);
    return handle;
  };
  let count = 0;
  for (const { entry, name } of await entriesOf(dir)) {
    if (entry.is_dir) {
      await dirOf(name);
      continue;
    }
    const cut = name.lastIndexOf("/");
    const folder = await dirOf(cut < 0 ? "" : name.slice(0, cut));
    const file = await folder.getFileHandle(name.slice(cut + 1), {
      create: true,
    });
    const out = await file.createWritable();
    // a Blob is written by the browser as it reads it, not copied first
    await out.write(entry.data ?? "");
    await out.close();
    count += 1;
  }
  return count;
}

/**
 * Pick a folder of the device and write all files into it; the count, or
 * null if no folder was picked.
 */
export async function exportToFolder(dir = ROOT): Promise<number | null> {
  const pick = dirPicker();
  if (!pick) throw new Error("This browser can not write to a folder");
  let target: DirHandle;
  try {
    target = await pick({ id: "mdsilo-backup", mode: "readwrite" });
  } catch (e) {
    if ((e as { name?: string }).name === "AbortError") return null;
    throw e;
  }
  const count = await writeToFolder(target, dir);
  if (normalize(dir) === ROOT) await markBackedUp();
  showMessage(
    t("Backup"),
    t("{count} file(s) exported to {folder}", { count, folder: target.name }),
  );
  return count;
}

type ZipReaderEntry = {
  filename: string;
  directory?: boolean;
  getData?: (writer: unknown) => Promise<Blob>;
};

/** The entries of a backup zip, the extras of macOS left out. */
async function zipEntries(file: Blob) {
  const zip = await import("foliate-js/vendor/zip.js");
  zip.configure({ useWebWorkers: false });
  const reader = new zip.ZipReader(new zip.BlobReader(file));
  const entries = ((await reader.getEntries()) as ZipReaderEntry[]).filter(
    (e) => !e.filename.startsWith("__MACOSX/"),
  );
  return { zip, reader, entries };
}

/** The number of files in a backup zip, to ask before restoring it. */
export async function countBackupFiles(file: Blob): Promise<number> {
  const { reader, entries } = await zipEntries(file);
  await reader.close?.();
  return entries.filter((e) => !e.directory).length;
}

/**
 * Restore a backup zip (of buildBackup) at the root: the files at the same
 * paths are replaced, the others are kept. Returns the number of files.
 */
export async function restoreBackup(file: Blob): Promise<number> {
  const { zip, reader, entries } = await zipEntries(file);
  let count = 0;
  try {
    for (const entry of entries) {
      const path = normalize(`/${entry.filename}`);
      if (path === ROOT) continue;
      if (entry.directory || !entry.getData) {
        await fs.mkdirp(path);
        continue;
      }
      // one file at a time in memory
      const blob = await entry.getData(new zip.BlobWriter());
      if (await fs.writeFile(path, blob)) count += 1;
    }
  } finally {
    await reader.close?.();
  }
  return count;
}

/** Let the user pick a zip file of the device; null if none. */
function pickZipFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip,application/zip";
    input.style.display = "none";
    const done = (file: File | null) => {
      input.remove();
      resolve(file);
    };
    input.onchange = () => done(input.files?.[0] ?? null);
    input.addEventListener("cancel", () => done(null));
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Pick a backup zip, ask, and restore it; the number of files restored, or
 * null if not restored. The page should be reloaded after.
 */
export async function chooseAndRestoreBackup(): Promise<number | null> {
  const file = await pickZipFile();
  if (!file) return null;
  let total: number;
  try {
    total = await countBackupFiles(file);
  } catch {
    showMessage(
      t("Restore Backup"),
      t("Not a zip file: {name}", { name: file.name }),
    );
    return null;
  }
  const ok = await ask(
    t(
      "Restore {count} file(s) from {name}? Files at the same paths are replaced, the others are kept.",
      { count: total, name: file.name },
    ),
    { title: t("Restore Backup") },
  );
  if (!ok) return null;
  const count = await restoreBackup(file);
  showMessage(t("Restore Backup"), t("{count} file(s) restored", { count }));
  return count;
}
