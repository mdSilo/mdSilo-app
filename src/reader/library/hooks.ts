import { useEffect, useRef, useState } from 'react';
import { isTauri } from '@/workspace/util';
import { openBook } from '../document';
import { readBookFile } from '../readerStore';
import { cacheCover, coverUrl } from './covers';
import type { ShelfBook } from './shelf';
import { bookMetaOf, isImportable, META_FIELDS, saveBookEntry, withBookMeta, type BookEntry } from './library';

/**
 * The covers of the books: chosen, or cached; the missing ones made one book
 * at a time, the books here only. On the way, the metadata of the books
 * never read: written unless edited.
 * @param version changed to show the covers again, e.g. one chosen
 */
export function useCovers(
  ws: string | undefined,
  books: ShelfBook[] | undefined,
  version: number,
  onMeta: (hash: string, patch: Partial<BookEntry>) => void,
) {
  const onMetaRef = useRef(onMeta);
  onMetaRef.current = onMeta;
  // once per book and cover, not per change of the books
  const key = books?.map((b) => `${b.hash}:${b.cover ?? ''}`).join(',');
  const [covers, setCovers] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!ws || !books) return;
    let cancelled = false;
    const urls: string[] = [];
    const show = (hash: string, url: string | undefined) => {
      if (url) urls.push(url);
      if (cancelled) return;
      setCovers((c) => {
        const { [hash]: _old, ...rest } = c;
        return url ? { ...rest, [hash]: url } : rest;
      });
    };
    (async () => {
      const todo: ShelfBook[] = [];
      for (const book of books) {
        const url = await coverUrl(ws, book).catch(() => undefined);
        if (cancelled) return;
        show(book.hash, url);
        if (book.here && (!book.metaRead || (!url && !book.cover))) todo.push(book);
      }
      for (const book of todo) {
        if (cancelled) return;
        try {
          const { book: doc } = await openBook(await readBookFile(book.path));
          const made = !book.cover && (await cacheCover(ws, book.hash, doc));
          const next = withBookMeta(book, bookMetaOf(doc, book.path));
          await doc.destroy?.();
          const keys = [...META_FIELDS, 'metaRead'] as const;
          const patch = Object.fromEntries(keys
            .filter((k) => JSON.stringify(next[k]) !== JSON.stringify(book[k]))
            .map((k) => [k, next[k]]));
          if (Object.keys(patch).length) {
            await saveBookEntry(ws, { hash: book.hash, ...patch });
            if (!cancelled) onMetaRef.current(book.hash, patch);
          }
          if (made) show(book.hash, await coverUrl(ws, book.hash));
        } catch {
          // no cover, no metadata of a book failing to open
        }
      }
    })();
    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, key, version]);
  return covers;
}

/** A book file dropped in: by its path (desktop), or its data (web). */
export type DroppedBook = { path: string } | { name: string; data: Uint8Array };

/**
 * The book files dropped on the element from the device: on the desktop by
 * the webview (its paths), on the web by the page (its data). Other files
 * are left out.
 */
export function useBookDrop(
  target: React.RefObject<HTMLElement | null>,
  onDrop: (books: DroppedBook[], skipped: number) => void,
) {
  const [dragging, setDragging] = useState(false);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  useEffect(() => {
    if (isTauri) {
      let unlisten: (() => void) | undefined;
      let gone = false;
      void import('@tauri-apps/api/webview').then(({ getCurrentWebview }) =>
        getCurrentWebview().onDragDropEvent(({ payload }) => {
          if (payload.type === 'over' || payload.type === 'enter') {
            setDragging(true);
          } else if (payload.type === 'drop') {
            setDragging(false);
            const books = payload.paths.filter(isImportable);
            if (payload.paths.length) onDropRef.current(books.map((path) => ({ path })), payload.paths.length - books.length);
          } else {
            setDragging(false);
          }
        })).then((fn) => {
        if (gone) fn();
        else unlisten = fn;
      }).catch(() => undefined);
      return () => {
        gone = true;
        unlisten?.();
      };
    }
    const el = target.current;
    if (!el) return;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      // left the element, not into a child of it
      if (e.relatedTarget instanceof Node && el.contains(e.relatedTarget)) return;
      setDragging(false);
    };
    const drop = async (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      const books = files.filter((f) => isImportable(f.name));
      const data = await Promise.all(books.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) })));
      if (files.length) onDropRef.current(data, files.length - books.length);
    };
    el.addEventListener('dragover', over);
    el.addEventListener('dragleave', leave);
    el.addEventListener('drop', drop);
    return () => {
      el.removeEventListener('dragover', over);
      el.removeEventListener('dragleave', leave);
      el.removeEventListener('drop', drop);
    };
  }, [target]);

  return dragging;
}
