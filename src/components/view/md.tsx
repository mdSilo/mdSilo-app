import { useCurrentViewContext } from 'context/useCurrentView';
import Note from 'components/note/Note';

export default function NotePage() {
  const currentView = useCurrentViewContext();
  //const viewTy = currentView.state.view;
  const params = currentView.state.params;
  const noteId = params?.noteId || '';
  //const hlHash = params?.hash || '';

  //useBlockBacklinks();

  if (!noteId || typeof noteId !== 'string') {
    return (
      <>
        <div className="flex flex-col items-center justify-center flex-1 h-screen p-4">
          <p className="text-2xl text-center">
            This note does not exists!
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-1 overflow-x-auto divide-x divide-gray-200 dark:divide-gray-700">
        <Note
          noteId={noteId}
          className="sticky left-0"
        />
      </div>
    </>
  );
}

/**
 * Takes in a url with a hash parameter formatted like #1-2,3 (where 1 signifies the open note index,
 * and 2,3 signifies the path to be highlighted). Parses the url and
 * returns the open note index and the path to be highlighted as an object.
 */
// const getHighlightedPath = (hash: string): { index: number; path: any } | null => {
//   if (!hash) {
//     return null;
//   }

//   const [strIndex, ...strPath] = hash.split(/[-,]+/);

//   const index = Number.parseInt(strIndex);
//   const path = strPath.map((pathSegment) => Number.parseInt(pathSegment));
//   if (
//     Number.isNaN(index) ||
//     path.length <= 0 ||
//     path.some((segment) => Number.isNaN(segment))
//   ) {
//     return null;
//   }

//   return { index, path };
// };
