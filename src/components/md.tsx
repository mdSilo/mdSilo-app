import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom'
import { Path } from 'slate';
import Note from 'components/note/Note';
import { useStore } from 'lib/store';
import usePrevious from 'editor/hooks/usePrevious';
//import { queryParamToArray } from 'utils/helper';
import useBlockBacklinks from 'editor/backlinks/useBlockBacklinks';

type Props = {
  noteId: string;
  highlightedPath?: Path;
  className?: string;
};

export default function NotePage(props: Props) {
  // const location = useLocation();
  const { noteId } = props;

  const openNoteIds = useStore((state) => state.openNoteIds);
  const setOpenNoteIds = useStore((state) => state.setOpenNoteIds);
  const prevOpenNoteIds = usePrevious(openNoteIds);

  useBlockBacklinks();

  const [highlightedPath, setHighlightedPath] = useState<{
    index: number;
    path: Path;
  } | null>(null);

  // Initialize open notes and highlighted path
  useEffect(() => {
    if (!noteId || typeof noteId !== 'string') {
      return;
    }

    const newOpenNoteIds = [noteId]; // , ...queryParamToArray(stackQuery)
    setOpenNoteIds(newOpenNoteIds);

    // We use router.asPath specifically so we handle any route change (even if asPath is the same)
    // const newHighlightedPath = getHighlightedPath(location.hash);
    // setHighlightedPath(newHighlightedPath);
  }, [setOpenNoteIds, noteId]);

  useEffect(() => {
    // Scroll the last open note into view if:
    // 1. The last open note id has changed
    // 2. prevOpenNoteIds has length > 0 (ensures that this is not the first render)
    // 3. highlightedPath is not set (if it is, scrolling will be handled by the editor component)
    if (
      openNoteIds.length > 0 &&
      prevOpenNoteIds &&
      prevOpenNoteIds.length > 0 &&
      openNoteIds[openNoteIds.length - 1] !==
        prevOpenNoteIds[prevOpenNoteIds.length - 1] &&
      !highlightedPath
    ) {
      document
        .getElementById(openNoteIds[openNoteIds.length - 1])
        ?.scrollIntoView({
          behavior: 'smooth',
          inline: 'center',
        });
    }
  }, [openNoteIds, prevOpenNoteIds, highlightedPath]);

  // if (!noteId || typeof noteId !== 'string') {
  //   return (
  //     <>
  //       <div className="flex flex-col items-center justify-center flex-1 h-screen p-4">
  //         <p className="text-2xl text-center">
  //           Whoops&mdash;it doesn&apos;t look like this note exists!
  //         </p>
  //       </div>
  //     </>
  //   );
  // }

  return (
    <>
      <div className="flex flex-1 overflow-x-auto divide-x divide-gray-200 dark:divide-gray-700">
        {openNoteIds.length > 0
          ? openNoteIds.map((noteId, index) => (
              <Note
                key={noteId}
                noteId={noteId}
                className="sticky left-0"
                highlightedPath={
                  highlightedPath?.index === index
                    ? highlightedPath.path
                    : undefined
                }
              />
            ))
          : null}
      </div>
    </>
  );
}

/**
 * Takes in a url with a hash parameter formatted like #1-2,3 (where 1 signifies the open note index,
 * and 2,3 signifies the path to be highlighted). Parses the url and
 * returns the open note index and the path to be highlighted as an object.
 */
const getHighlightedPath = (
  url: string
): { index: number; path: Path } | null => {
  const urlArr = url.split('#');
  if (urlArr.length <= 1) {
    return null;
  }

  const hash = urlArr[urlArr.length - 1];
  const [strIndex, ...strPath] = hash.split(/[-,]+/);

  const index = Number.parseInt(strIndex);
  const path = strPath.map((pathSegment) => Number.parseInt(pathSegment));
  if (
    Number.isNaN(index) ||
    path.length <= 0 ||
    path.some((segment) => Number.isNaN(segment))
  ) {
    return null;
  }

  return { index, path };
};
