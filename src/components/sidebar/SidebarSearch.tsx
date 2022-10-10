import { memo, useMemo } from 'react';
import Highlighter from 'react-highlight-words';
import Fuse from 'fuse.js';
import { useCurrentViewContext } from 'context/useCurrentView';
import useNoteSearch, { NoteBlock } from 'editor/hooks/useNoteSearch';
import useDebounce from 'editor/hooks/useDebounce';
import { useStore } from 'lib/store';
import { isMobile } from 'utils/helper';
import { openFilePath } from 'file/open';
import ErrorBoundary from '../misc/ErrorBoundary';
import VirtualTree from '../misc/VirtualTree';

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
          className="block py-1 mx-4 my-2 bg-white border-gray-200 rounded dark:bg-gray-700 dark:border-gray-700"
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

export function SearchTree(props: SearchTreeProps) {
  const { keyword, ty } = props; 
  const search = useNoteSearch(
    { searchContent: ty === 'content', searchHashTag: ty === 'hashtag', extendedSearch: true }
  );

  const searchResultsData = useMemo(() => {
    const searchResults = search(keyword);
    return searchResults.map((result) => ({
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
  }, [search, keyword]);

  return (
    <>
      {!keyword || searchResultsData.length > 0 ? (
        <VirtualTree
          className="flex-1 px-1 overflow-y-auto"
          data={searchResultsData}
        />
      ) : (
        <p className="px-4 text-gray-600">No results found.</p>
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
    <p className="py-1 overflow-hidden overflow-ellipsis text-lg font-semibol dark:text-gray-200">
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
      className="w-full text-left rounded hover:bg-gray-200 active:bg-gray-300 dark:hover:bg-gray-700 dark:active:bg-gray-600"
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
        className={`block px-1 py-2 text-gray-600 break-words dark:text-gray-300 ${className}`}
        highlightClassName="bg-yellow-200 text-gray-600 dark:bg-yellow-800 dark:text-gray-300"
        searchWords={searchQuery.split(' ')}
        autoEscape={true}
        textToHighlight={text}
      />
    </button>
  );
});

export const matchSort = (a: Fuse.FuseResultMatch, b: Fuse.FuseResultMatch) => {
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
