import { memo, useEffect, useRef, useState } from 'react';
import { getView, type SearchMatch } from '../view';

type Group = { label: string; matches: SearchMatch[] };

/** Search in the book: the matches by chapter, highlighted in the pages. */
function SearchView() {
  const [query, setQuery] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWords, setWholeWords] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [progress, setProgress] = useState<number | undefined>();
  const [searched, setSearched] = useState('');
  const runRef = useRef(0);

  // the highlights of the matches go with the panel
  useEffect(() => () => {
    runRef.current += 1;
    getView()?.clearSearch();
  }, []);

  const search = async () => {
    const view = getView();
    const q = query.trim();
    const run = ++runRef.current;
    setGroups([]);
    setSearched(q);
    if (!view || !q) {
      view?.clearSearch();
      setProgress(undefined);
      return;
    }
    setProgress(0);
    const found: Group[] = [];
    try {
      for await (const result of view.search({ query: q, matchCase, matchWholeWords: wholeWords })) {
        if (run !== runRef.current) return;
        if (result === 'done') break;
        if ('progress' in result) {
          setProgress(result.progress);
        } else if ('subitems' in result) {
          found.push({ label: result.label, matches: result.subitems });
          setGroups([...found]);
        } else if ('cfi' in result) {
          // a search in a section only
          found.push({ label: '', matches: [result] });
          setGroups([...found]);
        }
      }
    } catch (e) {
      console.error('Failed to search the book', e);
    }
    if (run === runRef.current) setProgress(undefined);
  };

  const count = groups.reduce((n, g) => n + g.matches.length, 0);

  return (
    <div className="flex flex-col h-full" data-testid="reader-search">
      <form
        className="flex flex-col gap-1 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          className="input input-xs w-full"
          placeholder="Search in the book"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search in the book"
        />
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1">
            <input type="checkbox" className="checkbox checkbox-xs" checked={matchCase}
              onChange={(e) => setMatchCase(e.target.checked)} />
            Match case
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" className="checkbox checkbox-xs" checked={wholeWords}
              onChange={(e) => setWholeWords(e.target.checked)} />
            Whole words
          </label>
        </div>
      </form>
      {progress !== undefined ? (
        <progress className="w-full progress progress-primary h-1" value={progress * 100} max={100} />
      ) : searched ? (
        <p className="px-3 text-xs text-base-content/60">
          {count === 0 ? 'Nothing found' : `${count} found`}
        </p>
      ) : null}
      <ul className="flex-1 overflow-y-auto text-sm">
        {groups.map((group, i) => (
          <li key={`${group.label}-${i}`}>
            {group.label ? (
              <div className="px-3 pt-2 text-xs font-semibold truncate text-base-content/60">{group.label}</div>
            ) : null}
            <ul>
              {group.matches.map((match) => (
                <li key={match.cfi}>
                  <button
                    className="block w-full px-3 py-1 text-left hover:bg-base-content/10"
                    onClick={() => void getView()?.goTo(match.cfi)}
                  >
                    {match.excerpt.pre}
                    <mark className="bg-warning/60 text-base-content">{match.excerpt.match}</mark>
                    {match.excerpt.post}
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default memo(SearchView);
