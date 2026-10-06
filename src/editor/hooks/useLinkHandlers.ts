import { useCallback } from 'react';
import { store } from 'lib/store';
import { useCurrentViewContext } from 'context/useCurrentView';
import { issueStore } from 'components/issue/issueStore';
import { issueHref, parseIssueHref } from 'components/issue/refs';
import { openFilePath, openUrl } from 'file/open';
import { isUrl } from 'utils/helper';
import useNoteSearch from './useNoteSearch';

export type LinkSearchResult = { title: string; url: string };

type Options = {
  /** max number of note (and issue) results */
  numOfResults?: number;
  /**
   * Called when a link points to a note that does not exist.
   * Return the path of the created note to open it, or undefined to do nothing.
   */
  onMissingNote?: (title: string) => Promise<string | undefined>;
};

/** Issues matching `#12` or a title fragment, as editor link results. */
export function searchIssues(text: string, limit = 10): LinkSearchResult[] {
  const term = text.trim().toLowerCase().replace(/^#/, '');
  if (!term) return [];
  return issueStore.getState().data.issues
    .filter((i) => String(i.number).startsWith(term) || i.title.toLowerCase().includes(term))
    .slice(0, limit)
    .map((i) => ({ title: `#${i.number} ${i.title}`, url: issueHref(i.number) }));
}

/**
 * Link handlers shared by every MsEditor: the note editor and the issue
 * body/comment editors. Links can be URLs, note titles or `issue:N`.
 */
export default function useLinkHandlers({ numOfResults = 10, onMissingNote }: Options = {}) {
  const { dispatch } = useCurrentViewContext();
  const search = useNoteSearch({ numOfResults });

  const onSearchLink = useCallback(
    async (text: string): Promise<LinkSearchResult[]> => {
      const notes = search(text).map((res) => {
        const title = res.item.title.trim();
        return { title, url: encodeURI(title) }; // used as [title](encodedTitle)
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
      // find the note per title
      let title = href.trim();
      try {
        title = decodeURI(title);
      } catch {
        // keep the raw title
      }
      // ISSUE ALERT:
      // maybe more than one notes with same title(ci),
      // but only link to first searched one
      const toNote = store.getState().notes.values().find((n) => n.title === title);
      const noteId = toNote ? toNote.id : await onMissingNote?.(title);
      if (!noteId) return;
      await openFilePath(noteId, true);
      dispatch({ view: 'md', params: { noteId } });
    },
    [dispatch, onMissingNote]
  );

  return { onSearchLink, onOpenLink };
}
