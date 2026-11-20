/**
 * Minimal zip writer (stored, no compression), no dependency.
 * Notes are small text and images are compressed already, so storing is fine.
 * An entry deflated already (e.g. the text of a book, see deflateRaw) is
 * written deflated.
 * NOTE: no zip64, up to 65535 entries and 4GB.
 * createZipOfBlobs makes a zip of large files without copying them.
 */

export interface ZipEntry {
  /** relative path, '/' separated; ends with '/' for a directory */
  name: string;
  data?: Uint8Array;
  /** `data` deflated (raw, no header), written instead of it */
  deflated?: Uint8Array;
  modified?: number; // ms since epoch
}

/** Raw deflate, as in a zip file; undefined where the browser has no CompressionStream. */
export async function deflateRaw(
  data: Uint8Array,
): Promise<Uint8Array | undefined> {
  if (typeof CompressionStream === "undefined") return undefined;
  try {
    const stream = new Response(data as BodyInit).body!.pipeThrough(
      new CompressionStream("deflate-raw"),
    );
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return undefined;
  }
}

let crcTable: Uint32Array | null = null;

/** crc32 of data; pass the crc of the parts before to go on from it */
export function crc32(data: Uint8Array, previous = 0): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = (previous ^ 0xffffffff) >>> 0;
  for (let i = 0; i < data.length; i++)
    crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(ms: number): [number, number] {
  const d = new Date(ms);
  const year = Math.max(1980, d.getFullYear());
  const time =
    (d.getHours() << 11) |
    (d.getMinutes() << 5) |
    Math.floor(d.getSeconds() / 2);
  const date = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return [time, date];
}

/** an entry as written: its data stored as is, size and crc known */
type Prepared = {
  name: Uint8Array;
  stored: BlobPart;
  storedSize: number;
  size: number;
  crc: number;
  method: number;
  isDir: boolean;
  modified: number;
};

function buildZip(entries: Prepared[]): Blob {
  if (entries.length > 0xffff) throw new Error("Too many files for a zip file");
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const { name, stored, storedSize, size, crc, method, isDir } = entry;
    if (offset + storedSize > 0xffffffff)
      throw new Error("Too large for a zip file (4GB)");
    const [time, date] = dosDateTime(entry.modified);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // utf-8 names
    local.setUint16(8, method, true); // stored or deflated
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, storedSize, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name as BlobPart, stored);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true); // version made by
    cd.setUint16(6, 20, true); // version needed
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, method, true);
    cd.setUint16(12, time, true);
    cd.setUint16(14, date, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, storedSize, true);
    cd.setUint32(24, size, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(38, isDir ? 0x10 : 0, true); // external attrs: directory
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);

    offset += 30 + name.length + storedSize;
  }

  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);

  return new Blob(
    [...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[],
    { type: "application/zip" },
  );
}

export function createZip(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  return buildZip(
    entries.map((entry) => {
      const data = entry.data ?? new Uint8Array(0);
      // deflated if smaller
      const deflated =
        entry.deflated && entry.deflated.length < data.length
          ? entry.deflated
          : undefined;
      const stored = deflated ?? data;
      return {
        name: encoder.encode(entry.name),
        stored: stored as BlobPart,
        storedSize: stored.length,
        size: data.length,
        crc: crc32(data),
        method: deflated ? 8 : 0,
        isDir: entry.name.endsWith("/"),
        modified: entry.modified ?? Date.now(),
      };
    }),
  );
}

/** the bytes read at a time for the crc of a Blob */
const CHUNK = 4 * 1024 * 1024;

/** crc32 of a Blob, read by parts: never all of it in memory */
export async function crc32Blob(blob: Blob): Promise<number> {
  let crc = 0;
  for (let at = 0; at < blob.size; at += CHUNK) {
    const part = blob.slice(at, at + CHUNK);
    crc = crc32(new Uint8Array(await part.arrayBuffer()), crc);
  }
  return crc;
}

export interface BlobZipEntry {
  /** relative path, '/' separated; ends with '/' for a directory */
  name: string;
  data?: string | Blob;
  modified?: number; // ms since epoch
}

/**
 * A zip of large files (stored): the zip is made of the Blobs themselves, as
 * the browser keeps them (e.g. on disk for IndexedDB), never copied into
 * memory; only the crc reads them, by parts.
 */
export async function createZipOfBlobs(entries: BlobZipEntry[]): Promise<Blob> {
  const encoder = new TextEncoder();
  const prepared: Prepared[] = [];
  for (const entry of entries) {
    const raw = entry.data ?? "";
    const blob = typeof raw === "string" ? undefined : raw;
    const bytes = typeof raw === "string" ? encoder.encode(raw) : undefined;
    const size = blob ? blob.size : bytes!.length;
    prepared.push({
      name: encoder.encode(entry.name),
      stored: (blob ?? bytes) as BlobPart,
      storedSize: size,
      size,
      crc: blob ? await crc32Blob(blob) : crc32(bytes!),
      method: 0,
      isDir: entry.name.endsWith("/"),
      modified: entry.modified ?? Date.now(),
    });
  }
  return buildZip(prepared);
}
