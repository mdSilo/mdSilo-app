import { Dispatch, memo, SetStateAction, useCallback, useMemo } from 'react';
import { NoteTreeItem, useStore } from 'lib/store';
import { Sort } from 'lib/userSettingsSlice';
import { ciStringCompare, dateCompare, isMobile } from 'utils/helper';
import { onImportJson, onOpenFile, onOpenDir } from 'editor/hooks/useOpen';
import ErrorBoundary from '../misc/ErrorBoundary';
import SidebarNotesBar from './SidebarNotesBar';
import SidebarNotesTree from './SidebarNotesTree';

type SidebarNotesProps = {
  className?: string;
  setIsFindOrCreateModalOpen: Dispatch<SetStateAction<boolean>>;
};

function SidebarNotes(props: SidebarNotesProps) {
  const { className='', setIsFindOrCreateModalOpen } = props;

  const currentDir = useStore((state) => state.currentDir);
  const notes = useStore((state) => state.notes);
  const noteTree = useStore((state) => state.noteTree);
  const noteSort = useStore((state) => state.noteSort);
  const sortedNoteTree = useMemo(
    () => sortNoteTree(noteTree, noteSort),
    [noteTree, noteSort]
  );

  // why pass numOfNotes to SidebarNotesBar from here?
  // we get notes here
  const noteList = Object.values(notes);
  const myNotes = noteList.filter(n => !n.is_wiki && !n.is_daily);
  const numOfNotes = useMemo(() => myNotes.length, [myNotes]);
  
  const setIsSidebarOpen = useStore((state) => state.setIsSidebarOpen);
  const onCreateNote = useCallback(() => {
    if (isMobile()) {
      setIsSidebarOpen(false);
    }
    setIsFindOrCreateModalOpen((isOpen) => !isOpen);
  }, [setIsSidebarOpen, setIsFindOrCreateModalOpen]);

  const btnClass = "p-1 mb-2 mx-4 text-white rounded bg-blue-500 hover:bg-blue-800";

  return (
    <ErrorBoundary>
      <div className={`flex flex-col flex-1 overflow-x-hidden ${className}`}>
        {currentDir ? (<SidebarNotesBar
          noteSort={noteSort}
          numOfNotes={numOfNotes}
          setIsFindOrCreateModalOpen={setIsFindOrCreateModalOpen}
        />) : null }
        {sortedNoteTree && sortedNoteTree.length > 0 ? (
          <SidebarNotesTree
            data={sortedNoteTree}
            className="flex-1 overflow-y-auto"
          />
        ) : (
          <>
            <p className="flex-1 px-6 my-2 text-center text-gray-500">
              No md yet
            </p>
            <button className={btnClass} onClick={onOpenDir}>Open Folder</button>
            <button className={btnClass} onClick={onOpenFile}>Open File</button>
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}

/**
 * Sorts the tree recursively based on the information in notes with the given noteSort.
 */
const sortNoteTree = (
  tree: NoteTreeItem[],
  noteSort: Sort
): NoteTreeItem[] => {
  // Copy tree shallowly
  const newTree = [...tree];
  // filte out the wiki
  // const newTree = newTre;//.filter(n => !notes[n.id].is_wiki && !notes[n.id].is_daily);
  // Sort tree items (one level)
  if (newTree.length >= 2) {
    newTree.sort((n1, n2) => {
      switch (noteSort) {
        case Sort.DateModifiedAscending:
          return dateCompare(n1.updated_at, n2.updated_at);
        case Sort.DateModifiedDescending:
          return dateCompare(n2.updated_at, n1.updated_at);
        case Sort.DateCreatedAscending:
          return dateCompare(n1.created_at, n2.created_at);
        case Sort.DateCreatedDescending:
          return dateCompare(n2.created_at, n1.created_at);
        case Sort.TitleAscending:
          return ciStringCompare(n1.title, n2.title);
        case Sort.TitleDescending:
          return ciStringCompare(n2.title, n1.title);
        default:
          return ciStringCompare(n1.title, n2.title);
      }
    });
    newTree.sort((n1, n2) => Number(Boolean(n2.isDir)) - Number(Boolean(n1.isDir)));
  }
  // Sort each tree item's children
  return newTree.map((item) => ({
    ...item,
    children: sortNoteTree(item.children, noteSort),
  }));
};

export default memo(SidebarNotes);
