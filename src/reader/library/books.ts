import { useEffect } from 'react';
import { create } from 'zustand';
import { store, useStore } from '@/state/store';
import type { BookEntry } from './library';

type BooksState = {
  /** the workspace of the books */
  ws?: string;
  books: Record<string, BookEntry>;
};

/**
 * The books of the library, as last read or written (see library.ts): for
 * what needs them at once, e.g. to search or draw them, not to change them.
 */
export const useBooks = create<BooksState>(() => ({ books: {} }));

/** The library read or written: the books of the workspace now. */
export function setLibraryBooks(ws: string, books: Record<string, BookEntry>) {
  useBooks.setState({ ws, books });
}

let loading: Promise<unknown> | undefined;

/** The books of the open workspace, read if not yet. */
export async function loadBooks(): Promise<Record<string, BookEntry>> {
  const ws = store.getState().initDir;
  if (!ws) return {};
  if (useBooks.getState().ws !== ws) {
    loading ??= import('./library').then((l) => l.readLibrary(ws)).finally(() => (loading = undefined));
    await loading;
  }
  return useBooks.getState().ws === ws ? useBooks.getState().books : {};
}

/** The books of the open workspace, read on first use. */
export function useLibraryBooks(): Record<string, BookEntry> {
  const ws = useStore((state) => state.initDir);
  const state = useBooks();
  useEffect(() => {
    if (ws && state.ws !== ws) void loadBooks();
  }, [ws, state.ws]);
  return ws && state.ws === ws ? state.books : EMPTY;
}

const EMPTY: Record<string, BookEntry> = {};
