/**
 * Back up the notes (the virtual file system in IndexedDB) to a zip file.
 * To restore: unzip it, then import the folder via Open Folder > Import Folder.
 */
import * as fs from './fs';
import { ROOT, normalize, parent } from './path';
import { createZip, ZipEntry } from './zip';
import { downloadBlob, showMessage } from './browser';

export async function buildBackup(dir = ROOT): Promise<{ blob: Blob; count: number }> {
  const d = normalize(dir);
  const self = d === ROOT ? undefined : await fs.stat(d);
  if (d !== ROOT && !self?.is_dir) throw new Error(`No such folder: ${dir}`);
  // keep the folder itself in the zip, e.g. `mdSilo/Welcome.md`
  const base = d === ROOT ? ROOT : parent(d);
  const prefixLen = base === ROOT ? 1 : base.length + 1;
  const entries = [...(self ? [self] : []), ...(await fs.walk(d))]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const encoder = new TextEncoder();
  const zipEntries: ZipEntry[] = [];
  let count = 0;
  for (const e of entries) {
    const name = e.path.slice(prefixLen);
    if (e.is_dir) {
      zipEntries.push({ name: `${name}/`, modified: e.modified });
      continue;
    }
    const raw = e.data ?? '';
    const data = typeof raw === 'string' ? encoder.encode(raw) : new Uint8Array(await raw.arrayBuffer());
    zipEntries.push({ name, data, modified: e.modified });
    count += 1;
  }
  return { blob: createZip(zipEntries), count };
}

export function backupFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `mdsilo-backup-${date}-${time}.zip`;
}

/** build the backup and download it, return the number of files */
export async function exportBackup(dir = ROOT): Promise<number> {
  const { blob, count } = await buildBackup(dir);
  downloadBlob(blob, backupFileName());
  showMessage('Backup', `${count} file(s) exported`);
  return count;
}
