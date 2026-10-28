import { md5 } from 'js-md5';

const CHUNK = 1024;

/** 0, then 1 KiB << 2i for i in 0..=10, as src-tauri/src/books.rs */
const OFFSETS = [0, ...Array.from({ length: 11 }, (_, i) => CHUNK * 4 ** i)];

/**
 * The partial MD5 of a file (the id of a book): of 1 KiB chunks at growing
 * offsets, quick even for a big book. Same as the Rust `book_hash`.
 */
export async function partialMd5(blob: Blob): Promise<string> {
  const hasher = md5.create();
  for (const offset of OFFSETS) {
    if (offset >= blob.size) break;
    const chunk = await blob.slice(offset, Math.min(offset + CHUNK, blob.size)).arrayBuffer();
    hasher.update(new Uint8Array(chunk));
  }
  return hasher.hex();
}
