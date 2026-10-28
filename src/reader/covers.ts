import { invoke } from '@tauri-apps/api/core';
import { joinPath } from 'file/util';
import { DATA_DIR, localDirOf } from 'workspace/layout';
import type { BookDoc } from './document';
import type { BookEntry } from './library';

/**
 * The covers of the books, small:
 *   .mdsilo/local/covers/<id>.jpg  of the book, made when opened; this device only
 *   .mdsilo/covers/<id>.jpg        chosen by the user, synced
 */
export const COVER_HEIGHT = 320;

/** The images a cover can be chosen from. */
export const COVER_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

export const coverPathOf = (ws: string, hash: string) => joinPath(localDirOf(ws), 'covers', `${hash}.jpg`);
export const customCoverPathOf = (ws: string, hash: string) => joinPath(ws, DATA_DIR, 'covers', `${hash}.jpg`);

/** A smaller JPEG of the image, if the browser can draw it. */
async function thumbnail(blob: Blob): Promise<Blob | undefined> {
  if (typeof createImageBitmap !== 'function') return undefined;
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, COVER_HEIGHT / bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? undefined), 'image/jpeg', 0.8));
}

/** Cache the cover of a book, unless it is there already. */
export async function cacheCover(ws: string, hash: string, book: BookDoc): Promise<boolean> {
  const path = coverPathOf(ws, hash);
  if (await invoke<boolean>('file_exist', { filePath: path })) return true;
  try {
    const cover = await book.getCover();
    const small = cover ? await thumbnail(cover) : undefined;
    if (!small) return false;
    const data = Array.from(new Uint8Array(await small.arrayBuffer()));
    return await invoke<boolean>('write_file_bytes', { filePath: path, data });
  } catch (e) {
    console.warn('No cover of the book', e);
    return false;
  }
}

/** Make an image file the cover of a book. */
export async function setCustomCover(ws: string, hash: string, imagePath: string): Promise<boolean> {
  const data = await invoke<ArrayBuffer | number[]>('read_file_bytes', { filePath: imagePath });
  const bytes = data instanceof ArrayBuffer ? data : new Uint8Array(data);
  const small = await thumbnail(new Blob([bytes]));
  if (!small) return false;
  const out = Array.from(new Uint8Array(await small.arrayBuffer()));
  return invoke<boolean>('write_file_bytes', { filePath: customCoverPathOf(ws, hash), data: out });
}

/** Remove the covers of some books: chosen and cached. */
export async function deleteCovers(ws: string, hashes: string | string[]) {
  const paths = [hashes].flat().flatMap((hash) => [customCoverPathOf(ws, hash), coverPathOf(ws, hash)]);
  await invoke('delete_files', { paths });
}

/**
 * An URL of the cover of a book, to revoke once shown; undefined if none:
 * the one chosen, else the one of the book cached. By the hash alone, the
 * cover cached.
 */
export async function coverUrl(
  ws: string, book: string | Pick<BookEntry, 'hash' | 'cover'>
): Promise<string | undefined> {
  const { hash, cover } = typeof book === 'string' ? { hash: book, cover: undefined } : book;
  if (cover === 'none') return undefined;
  const path = cover === 'custom' ? customCoverPathOf(ws, hash) : coverPathOf(ws, hash);
  if (!(await invoke<boolean>('file_exist', { filePath: path }))) return undefined;
  const data = await invoke<ArrayBuffer | number[]>('read_file_bytes', { filePath: path });
  const bytes = data instanceof ArrayBuffer ? data : new Uint8Array(data);
  return URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
}
