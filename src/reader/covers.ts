import { invoke } from '@tauri-apps/api/core';
import { joinPath } from 'file/util';
import { localDirOf } from 'workspace/layout';
import type { BookDoc } from './document';

/**
 * The covers of the books, small, cached on this device only:
 * `.mdsilo/local/covers/<id>.jpg`, made from the book when opened.
 */
export const COVER_HEIGHT = 320;

export const coverPathOf = (ws: string, hash: string) => joinPath(localDirOf(ws), 'covers', `${hash}.jpg`);

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

/** An URL of the cover cached, to revoke once shown; undefined if none. */
export async function coverUrl(ws: string, hash: string): Promise<string | undefined> {
  const path = coverPathOf(ws, hash);
  if (!(await invoke<boolean>('file_exist', { filePath: path }))) return undefined;
  const data = await invoke<ArrayBuffer | number[]>('read_file_bytes', { filePath: path });
  const bytes = data instanceof ArrayBuffer ? data : new Uint8Array(data);
  return URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
}
