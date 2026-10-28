import { useCallback } from 'react';
import { store } from '@/state/store';
import { useCurrentViewContext } from '@/state/useCurrentView';
import { issueStore } from '@/issue/issueStore';
import { issueHref, issueLabel, parseIssueHref } from '@/issue/refs';
import { openFilePath, openUrl } from '@/workspace/open';
import { isUrl } from '@/lib/helper';
import { encodeHref, hrefToTitle, legacyLinkTitle } from '@/lib/mdlink';
import useNoteSearch from '../../lib/hooks/useNoteSearch';

export type LinkSearchResult = { title: string; subtitle?: string; url: string };

type Options = {
  /** max number of note (and issue) results */
  numOfResults?: number;
  /**
   * Called when a link points to a note that does not exist.
   * Return the path of the created note to open it, or undefined to do nothing.
   */
  onMissingNote?: (title: string) => Promise<string | undefined>;
};

/** Issues matching `@12` (or `#12`) or a title fragment, as editor link results. */
export function searchIssues(text: string, limit = 10): LinkSearchResult[] {
  const term = text.trim().toLowerCase().replace(/^[@#]/, '');
  if (!term) return [];
  return issueStore.getState().data.issues
    .filter((i) => String(i.number).startsWith(term) || i.title.toLowerCase().includes(term))
    .slice(0, limit)
    .map((i) => ({ title: `${issueLabel(i.number)} ${i.title}`, url: issueHref(i.number) }));
}

/**
 * The book file of a `book:` link (by id or title) in the open workspace,
 * and the place linked; no path if the book is not on this device.
 */
async function findLinkedBook(href: string): Promise<{ path?: string; cfi?: string } | undefined> {
  const { parseBookLink, findBook, isBookId } = await import('@/reader/bookLinks');
  const link = parseBookLink(href);
  const ws = store.getState().initDir;
  if (!link || !ws) return link;
  // by id: maybe not in the library yet, findBookPath looks in reading/
  const { loadBooks } = await import('@/reader/books');
  const hash = isBookId(link.ref) ? link.ref : findBook(await loadBooks(), link.ref)?.hash;
  if (!hash) return { cfi: link.cfi };
  const library = await import('@/reader/library');
  return { path: await library.findBookPath(ws, hash), cfi: link.cfi };
}

/** Books and their annotations, as editor link results: `{{` */
async function searchItems(text: string): Promise<LinkSearchResult[]> {
  const { searchBookItems } = await import('@/reader/bookLinks');
  return searchBookItems(text);
}

/**
 * Link handlers shared by every MsEditor: the note editor and the issue
 * body/comment editors. Links can be URLs, note titles, `issue:N`,
 * `book:<id>#<cfi>` or `book:<title>`.
 */
export default function useLinkHandlers({ numOfResults = 10, onMissingNote }: Options = {}) {
  const { dispatch } = useCurrentViewContext();
  const search = useNoteSearch({ numOfResults });

  const onSearchLink = useCallback(
    async (text: string): Promise<LinkSearchResult[]> => {
      const notes = search(text).map((res) => {
        const title = res.item.title.trim();
        return { title, url: encodeHref(title) }; // used as [title](encodedTitle)
      });
      return [...notes, ...searchIssues(text, numOfResults)];
    },
    [search, numOfResults]
  );

  const onOpenLink = useCallback(
    async (href: string) => {
      if (isUrl(href)) {
        await openUrl(href);
        return;
      }
      const issueNum = parseIssueHref(href);
      if (issueNum !== undefined) {
        dispatch({ view: 'issue', number: issueNum });
        return;
      }
      if (/^book:/i.test(href.trim())) {
        const book = await findLinkedBook(href);
        if (book?.path) dispatch({ view: 'book', path: book.path, cfi: book.cfi });
        return;
      }
      // find the note per title
      const title = hrefToTitle(href);
      // ISSUE ALERT:
      // maybe more than one notes with same title(ci),
      // but only link to first searched one
      const notes = store.getState().notes.values().filter((n) => !n.is_dir);
      const toNote =
        notes.find((n) => n.title === title) ??
        // legacy link: `a_b` for the note `a b`
        (title.includes('_')
          ? notes.find((n) => legacyLinkTitle(n.title) === title)
          : undefined);
      const noteId = toNote ? toNote.id : await onMissingNote?.(title);
      if (!noteId) return;
      await openFilePath(noteId, true);
      dispatch({ view: 'md', params: { noteId } });
    },
    [dispatch, onMissingNote]
  );

  return { onSearchLink, onSearchItem: searchItems, onOpenLink };
}
