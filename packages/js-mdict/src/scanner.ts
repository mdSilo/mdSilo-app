/**
 * Scanner abstraction.
 *
 * Two implementations ship with the package:
 *
 *  - {@link BlobScanner} — browser-friendly, async. Wraps any `Blob` /`File`
 *    (including `NativeFile` / `RemoteFile`) and reads bytes lazily
 *    via `blob.slice(start, end).arrayBuffer()`. Reads return Promises.
 *
 *  - {@link FileScanner} (in `./file-scanner.js`) — Node-only, sync. Uses
 *    `node:fs` `openSync` / `readSync`. Reads return values directly.
 *
 * Code that needs to support both (notably `MDictBase`) inspects the optional
 * `sync` discriminator at runtime to choose between the sync and async paths,
 * which preserves the legacy `new MDX(path)` synchronous API while enabling
 * the new browser-friendly `MDX.create(blob)` async path.
 */

export interface Scanner {
  /**
   * Discriminator. `true` for synchronous scanners (e.g. {@link FileScanner}),
   * `false` for asynchronous scanners (e.g. {@link BlobScanner}). Optional so
   * existing third-party scanners default to async.
   */
  readonly sync?: boolean;

  readBuffer(offset: number | bigint, length: number): Uint8Array | Promise<Uint8Array>;
  readNumber(offset: number, length: number): DataView | Promise<DataView>;
  close(): void | Promise<void>;
}

/**
 * BlobScanner wraps a Blob/File. Each `readBuffer` call slices the blob and
 * resolves the slice's `arrayBuffer()`. When the blob is 
 * `NativeFile` / `RemoteFile`, `.slice()` returns a `DeferredBlob` which only
 * fetches/reads the bytes when `.arrayBuffer()` is called — i.e. truly lazy.
 */
export class BlobScanner implements Scanner {
  readonly sync = false as const;

  private blob: Blob;

  constructor(blob: Blob) {
    this.blob = blob;
  }

  async readBuffer(offset: number | bigint, length: number): Promise<Uint8Array> {
    const start = typeof offset === 'bigint' ? Number(offset) : offset;
    const end = start + length;
    const slice = this.blob.slice(start, end);
    const buffer = await slice.arrayBuffer();
    return new Uint8Array(buffer);
  }

  async readNumber(offset: number, length: number): Promise<DataView> {
    const slice = this.blob.slice(offset, offset + length);
    const buffer = await slice.arrayBuffer();
    return new DataView(buffer);
  }

  close(): void {
    // No-op. Caller owns the underlying Blob/File lifecycle.
  }
}
