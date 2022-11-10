import { memo, useMemo } from 'react';
import { NoteTreeItem, useStore } from 'lib/store';
import { Sort } from 'lib/userSettings';
import { ciStringCompare, dateCompare } from 'utils/helper';
import { onOpenFile, onListDir } from 'editor/hooks/useOpen';
import ErrorBoundary from '../misc/ErrorBoundary';
import SidebarNotesBar from './SidebarNotesBar';
import SidebarNotesTree from './SidebarNotesTree';
import SidebarHistory from './SidebarHistory';

type SidebarNotesProps = {
  className?: string;
};

function SidebarNotes(props: SidebarNotesProps) {
  const { className='' } = props;

  const currentDir = useStore((state) => state.currentDir);
  
  const noteTree = useStore((state) => state.noteTree);
  const noteSort = useStore((state) => state.noteSort);
  // console.log("note tree", noteTree)
  const [sortedNoteTree, numOfNotes] = useMemo(() => {
    if (currentDir) {
      const treeList = noteTree[currentDir] || [];
      return [sortNoteTree(treeList, noteSort), treeList.length];
    } else {
      return [[], 0];
    }
  }, [noteTree, currentDir, noteSort]);

  // console.log("tree", numOfNotes, sortedNoteTree, currentDir)
  
  const btnClass = "p-1 mt-4 mx-4 text-white rounded bg-blue-500 hover:bg-blue-800";

  return (
    <ErrorBoundary>
      <div className={`flex flex-col flex-1 overflow-x-hidden ${className}`}>
        {currentDir ? (
          <SidebarNotesBar
            noteSort={noteSort}
            numOfNotes={numOfNotes}
          />
        ) : null }
        {sortedNoteTree && sortedNoteTree.length > 0 ? (
          <SidebarNotesTree
            data={sortedNoteTree}
            className="flex-1 overflow-y-auto"
          />
        ) : currentDir ? null : (
          <>
            <button className={btnClass} onClick={onListDir}>Open Folder</button>
            <button className={btnClass} onClick={onOpenFile}>Open File</button>
            <SidebarHistory />
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}

/**
 * Sorts the tree item with the given noteSort.
 */
const sortNoteTree = (
  tree: NoteTreeItem[],
  noteSort: Sort
): NoteTreeItem[] => {
  // Copy tree shallowly
  const newTree = [...tree];
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
    newTree.sort((n1, n2) => Number(Boolean(n2.is_dir)) - Number(Boolean(n1.is_dir)));
  }

  return newTree;
};

export default memo(SidebarNotes);
