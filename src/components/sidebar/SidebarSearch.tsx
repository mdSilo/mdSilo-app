import { memo, useEffect, useMemo, useState } from 'react';
import Highlighter from 'react-highlight-words';
import { type FuseResultMatch } from 'fuse.js';
import { useCurrentViewContext } from '@/state/useCurrentView';
import { searchContent, type ContentSearch, NoteBlock } from '@/lib/hooks/useNoteSearch';
import useDebounce from '@/lib/hooks/useDebounce';
import useLoadNotes from '@/lib/hooks/useLoadNotes';
import { store, useStore } from '@/state/store';
import { sanitizeHtml } from '@/lib/sanitize';
import { isMobile } from '@/lib/helper';
import { openFilePath } from '@/workspace/open';
import ErrorBoundary from '@/ui/ErrorBoundary';
import VirtualTree from '@/ui/VirtualTree';

const DEBOUNCE_MS = 500;

type Props = {
  className?: string;
};

export default function SidebarSearch(props: Props) {
  const { className = '' } = props;
  const inputText = useStore((state) => state.sidebarSearchQuery);
  const setInputText = useStore((state) => state.setSidebarSearchQuery);
  const setSearchType = useStore((state) => state.setSidebarSearchType);
  const searchType = useStore((state) => state.sidebarSearchType);

  const inputTxt = inputText.trim();
  const [searchQuery, setSearchQuery] = useDebounce(inputTxt, DEBOUNCE_MS);

  return (
    <ErrorBoundary>
      <div className={`flex flex-col flex-1 overflow-y-auto ${className}`}>
        <input
          type="text"
          className="block py-1 mx-4 my-2 bg-base-200 border-base-300 rounded-sm"
          placeholder="Search..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              setSearchQuery(inputTxt);
              setSearchType('content');
            }
          }}
          autoFocus
        />
        <SearchTree keyword={searchQuery} ty={searchType} />
      </div>
    </ErrorBoundary>
  );
}

type SearchTreeProps = {
  keyword: string;
  ty: string;
};

const NOTHING: ContentSearch = { notes: [], books: [] };

export function SearchTree(props: SearchTreeProps) {
  const { keyword, ty } = props;
  useLoadNotes();
  const notes = useStore((state) => state.notes);
  // the notes found by the index, read for their blocks
  const [found, setFound] = useState<ContentSearch>(NOTHING);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!keyword) {
      setFound(NOTHING);
      return;
    }
    setSearching(true);
    searchContent(notes, keyword, ty === 'hashtag' ? 'hashtag' : 'content')
      .then((result) => { if (!cancelled) setFound(result); })
      .catch((e) => console.error('Failed to search', e))
      .finally(() => { if (!cancelled) setSearching(false); });
    return () => { cancelled = true; };
  }, [notes, keyword, ty]);

  const searchResultsData = useMemo(() => {
    const noteData = found.notes.map((result) => ({
      id: result.item.id,
      labelNode: <SidebarSearchBranch text={result.item.title} />,
      children: result.matches
        ? [...result.matches].sort(matchSort).map((match, index) => ({
            id: `${result.item.id}-${index}`,
            labelNode: (
              <SearchLeaf
                noteId={result.item.id}
                text={match.value ?? ''}
                searchQuery={keyword}
                block={
                  result.item.blocks && match.refIndex !== undefined
                    ? result.item.blocks[match.refIndex]
                    : undefined
                }
              />
            ),
            showArrow: false,
          }))
        : undefined,
    }));
    // the sections of books with the words, by book
    const byBook = new Map<string, ContentSearch['books']>();
    for (const hit of found.books) {
      const hash = hit.id.slice('book:'.length).split('#')[0];
      byBook.set(hash, [...(byBook.get(hash) ?? []), hit]);
    }
    const bookData = [...byBook].map(([hash, hits]) => ({
      id: `book:${hash}`,
      labelNode: <SidebarSearchBranch text={`📖 ${hits[0].title}`} />,
      children: hits.map((hit) => ({
        id: hit.id,
        labelNode: <BookLeaf id={hit.id} label={hit.label} snippet={hit.snippet} />,
        showArrow: false,
      })),
    }));
    return [...noteData, ...bookData];
  }, [found, keyword]);

  return (
    <>
      {!keyword || searching || searchResultsData.length > 0 ? (
        <VirtualTree
          className="flex-1 px-1 overflow-y-auto"
          data={searchResultsData}
        />
      ) : (
        <p className="px-4 text-base-content/70">No results found.</p>
      )}
    </>
  );
}


type SidebarSearchBranchProps = {
  text: string;
};

const SidebarSearchBranch = memo(function SidebarSearchBranch(
  props: SidebarSearchBranchProps
) {
  const { text } = props;
  return (
    <p className="py-1 overflow-hidden text-ellipsis text-lg font-semibol">
      {text}
    </p>
  );
});

type SearchLeafProps = {
  noteId: string;
  text: string;
  searchQuery: string;
  block?: NoteBlock;
  className?: string;
};

export const SearchLeaf = memo(function SearchLeaf(props: SearchLeafProps) {
  const { noteId, text, searchQuery, block, className = '' } = props;

  const currentView = useCurrentViewContext();
  const dispatch = currentView.dispatch;

  const setIsSidebarOpen = useStore((state) => state.setIsSidebarOpen);

  return (
    <button
      className="w-full text-left rounded-sm hover:bg-base-content/10 active:bg-base-content/15"
      onClick={async () => {
        const hash = block ? `0-${block.path}` : '';
        // close Sidebar before go to note page on small screen
        if (isMobile(767)) {
          setIsSidebarOpen(false);
        }
        // console.log("block hash", hash, text)
        await openFilePath(noteId, true);
        dispatch({view: 'md', params: {noteId, hash}});
      }}
    >
      <Highlighter
        className={`block px-1 py-2 text-base-content/70 wrap-break-word ${className}`}
        highlightClassName="bg-warning/40 text-base-content/70"
        searchWords={searchQuery.split(' ')}
        autoEscape={true}
        textToHighlight={text}
      />
    </button>
  );
});

/** A section of a book found: its chapter and the text, opened at it. */
const BookLeaf = memo(function BookLeaf({ id, label, snippet }: { id: string; label: string; snippet: string }) {
  const { dispatch } = useCurrentViewContext();
  return (
    <button
      className="w-full px-1 py-2 text-left rounded-sm hover:bg-base-content/10"
      onClick={async () => {
        const ws = store.getState().initDir;
        const rest = id.slice('book:'.length);
        const at = rest.indexOf('#');
        const [hash, cfi] = at < 0 ? [rest, undefined] : [rest.slice(0, at), rest.slice(at + 1)];
        if (!ws) return;
        const { findBookPath } = await import('@/reader/library');
        const path = await findBookPath(ws, hash);
        if (path) dispatch({ view: 'book', path, cfi });
      }}
    >
      {label ? <span className="block text-xs text-base-content/60">{label}</span> : null}
      {/* the snippet of the search: escaped, the words in <b> */}
      <span
        className="block text-sm text-base-content/70 [&_b]:bg-warning/40"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(snippet) }}
      />
    </button>
  );
});

export const matchSort = (a: FuseResultMatch, b: FuseResultMatch) => {
  if (a.refIndex === undefined && b.refIndex === undefined) {
    return 0;
  } else if (a.refIndex === undefined) {
    return -1;
  } else if (b.refIndex === undefined) {
    return 1;
  } else {
    return a.refIndex - b.refIndex;
  }
};
