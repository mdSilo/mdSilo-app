/** The book of a book window (see shell/windows), as in its URL. */
export type BookWindowParams = {
  path: string;
  /** the workspace of the book */
  ws: string;
  /** the place to open the book at */
  cfi?: string;
};

export function bookWindowParams(
  search = typeof location === "undefined" ? "" : location.search,
): BookWindowParams | undefined {
  const params = new URLSearchParams(search);
  const path = params.get("book");
  const ws = params.get("ws");
  if (!path || !ws) return undefined;
  const cfi = params.get("cfi");
  return cfi ? { path, ws, cfi } : { path, ws };
}

/**
 * A window of one book. It reads the settings but does not write them: the
 * main window does, with what the book window changed (see windowSync).
 */
export const isBookWindow = Boolean(bookWindowParams());
