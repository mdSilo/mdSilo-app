import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/workspace/util";
import { indexBookText, readsInRust } from "../bookIndex";
import { openBook } from "../document";
import { readBookFile } from "../readerStore";
import { cacheCover, coverPathOf, coverUrl } from "./covers";
import type { ShelfBook } from "./shelf";
import {
  bookMetaOf,
  isImportable,
  META_FIELDS,
  saveBookEntry,
  withBookMeta,
  type BookEntry,
  type BookMeta,
} from "./library";

/**
 * The metadata of a book file and its cover cached (unless one is chosen):
 * read in Rust if it can (src-tauri/src/ebook), else of the book opened here.
 */
export async function readBook(
  ws: string,
  book: ShelfBook,
): Promise<{ made: boolean; meta: BookMeta }> {
  if (readsInRust(book.path)) {
    const info = await invoke<{ meta: BookMeta; cover: boolean } | null>(
      "book_info",
      {
        filePath: book.path,
        coverPath: book.cover ? null : coverPathOf(ws, book.hash),
      },
    ).catch(() => null);
    if (info) return { made: !book.cover && info.cover, meta: info.meta };
  }
  const { book: doc } = await openBook(await readBookFile(book.path));
  try {
    const made = !book.cover && (await cacheCover(ws, book.hash, doc));
    return { made, meta: bookMetaOf(doc, book.path) };
  } finally {
    await doc.destroy?.();
  }
}

// the books opened for a cover they have not: not again in this session,
// opening one is slow (parsed whole, on the main thread)
const coverless = new Set<string>();

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
  const key = books?.map((b) => `${b.hash}:${b.cover ?? ""}`).join(",");
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
      // all at once: the shelf drawn once, not once a book
      const found = await Promise.all(
        books.map((book) => coverUrl(ws, book).catch(() => undefined)),
      );
      found.forEach((url) => url && urls.push(url));
      if (cancelled) return;
      setCovers(
        Object.fromEntries(
          books.flatMap((book, i) => (found[i] ? [[book.hash, found[i]]] : [])),
        ),
      );
      const todo = books.filter(
        (book, i) =>
          book.here &&
          (!book.metaRead ||
            (!found[i] && !book.cover && !coverless.has(`${ws}:${book.hash}`))),
      );
      for (const book of todo) {
        if (cancelled) return;
        try {
          const { made, meta } = await readBook(ws, book);
          const next = withBookMeta(book, meta);
          const keys = [...META_FIELDS, "metaRead"] as const;
          const patch = Object.fromEntries(
            keys
              .filter(
                (k) => JSON.stringify(next[k]) !== JSON.stringify(book[k]),
              )
              .map((k) => [k, next[k]]),
          );
          if (Object.keys(patch).length) {
            await saveBookEntry(ws, { hash: book.hash, ...patch });
            if (!cancelled) onMetaRef.current(book.hash, patch);
          }
          if (made) show(book.hash, await coverUrl(ws, book.hash));
          else if (!book.cover) coverless.add(`${ws}:${book.hash}`);
        } catch {
          // no cover, no metadata of a book failing to open
          coverless.add(`${ws}:${book.hash}`);
        }
      }
      // their text for the search, of the files read in Rust: the books
      // found without being opened; the ones indexed already skipped
      for (const book of books) {
        if (cancelled) return;
        if (book.here && readsInRust(book.path))
          await indexBookText(
            book.hash,
            book.title,
            undefined,
            false,
            book.path,
          );
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

/**
 * `data-scrolling` on the element as it scrolls, removed once it stops: the
 * covers drawn with a cheaper filter meanwhile (styles.css).
 */
export function useScrolling(el: HTMLElement | null) {
  useEffect(() => {
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      if (!timer) el.dataset.scrolling = "";
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        delete el.dataset.scrolling;
      }, 150);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      el.removeEventListener("scroll", onScroll);
      delete el.dataset.scrolling;
    };
  }, [el]);
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
      void import("@tauri-apps/api/webview")
        .then(({ getCurrentWebview }) =>
          getCurrentWebview().onDragDropEvent(({ payload }) => {
            if (payload.type === "over" || payload.type === "enter") {
              setDragging(true);
            } else if (payload.type === "drop") {
              setDragging(false);
              const books = payload.paths.filter(isImportable);
              if (payload.paths.length)
                onDropRef.current(
                  books.map((path) => ({ path })),
                  payload.paths.length - books.length,
                );
            } else {
              setDragging(false);
            }
          }),
        )
        .then((fn) => {
          if (gone) fn();
          else unlisten = fn;
        })
        .catch(() => undefined);
      return () => {
        gone = true;
        unlisten?.();
      };
    }
    const el = target.current;
    if (!el) return;
    const hasFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      // left the element, not into a child of it
      if (e.relatedTarget instanceof Node && el.contains(e.relatedTarget))
        return;
      setDragging(false);
    };
    const drop = async (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      const books = files.filter((f) => isImportable(f.name));
      const data = await Promise.all(
        books.map(async (f) => ({
          name: f.name,
          data: new Uint8Array(await f.arrayBuffer()),
        })),
      );
      if (files.length) onDropRef.current(data, files.length - books.length);
    };
    el.addEventListener("dragover", over);
    el.addEventListener("dragleave", leave);
    el.addEventListener("drop", drop);
    return () => {
      el.removeEventListener("dragover", over);
      el.removeEventListener("dragleave", leave);
      el.removeEventListener("drop", drop);
    };
  }, [target]);

  return dragging;
}
