import { memo, useMemo } from 'react';
import { NoteTree, NoteTreeItem, useStore } from '@/state/store';
import { Sort } from '@/state/userSettings';
import { ciStringCompare } from '@/lib/helper';
import { onOpenFile, onListDir } from '@/workspace/useOpen';
import { normalizeSlash } from '@/workspace/util';
import ErrorBoundary from '@/ui/ErrorBoundary';
import SidebarNotesBar from './SidebarNotesBar';
import SidebarNotesTree, { NoteTreeRow } from './SidebarNotesTree';
import SidebarHistory from './SidebarHistory';
import WorkspaceUpgrade from './WorkspaceUpgrade';

type SidebarNotesProps = {
  className?: string;
};

function SidebarNotes(props: SidebarNotesProps) {
  const { className='' } = props;

  const currentDir = useStore((state) => state.currentDir);
  
  const noteTree = useStore((state) => state.noteTree);
  const noteSort = useStore((state) => state.noteSort);
  const expandedDirs = useStore((state) => state.expandedDirs);
  // console.log("note tree", noteTree)
  const [sortedNoteTree, numOfNotes] = useMemo(() => {
    if (currentDir) {
      const treeList = noteTree[currentDir] || [];
      const rows = flattenNoteTree(noteTree, currentDir, expandedDirs, noteSort);
      return [rows, treeList.length];
    } else {
      return [[], 0];
    }
  }, [noteTree, currentDir, expandedDirs, noteSort]);

  // console.log("tree", numOfNotes, sortedNoteTree, currentDir)
  
  const btnClass = "p-1 mt-4 mx-4 text-secondary-content rounded-sm bg-secondary hover:bg-secondary/85";

  return (
    <ErrorBoundary>
      <div className={`flex flex-col flex-1 overflow-x-hidden ${className}`}>
        {currentDir ? (
          <SidebarNotesBar
            noteSort={noteSort}
            numOfNotes={numOfNotes}
          />
        ) : null }
        {currentDir ? <WorkspaceUpgrade /> : null}
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
 * Flattens the multi-level tree under rootDir into rows for the sidebar,
 * descending into expanded dirs (like a workspace explorer).
 */
export const flattenNoteTree = (
  noteTree: NoteTree,
  rootDir: string,
  expandedDirs: Record<string, boolean>,
  noteSort: Sort,
): NoteTreeRow[] => {
  const rows: NoteTreeRow[] = [];
  const visited = new Set<string>();
  const walk = (dir: string, depth: number) => {
    if (visited.has(dir)) return;
    visited.add(dir);
    const items = sortNoteTreeCached(noteTree[dir] || [], noteSort);
    for (const node of items) {
      const dirKey = node.is_dir ? normalizeSlash(node.id) : '';
      const isExpanded = node.is_dir && Boolean(expandedDirs[dirKey]);
      rows.push({ node, depth, isExpanded });
      if (isExpanded) {
        walk(dirKey, depth + 1);
      }
    }
  };
  walk(rootDir, 0);
  return rows;
};

/**
 * Sorts the tree item with the given noteSort, dirs first.
 */
const sortNoteTree = (
  tree: NoteTreeItem[],
  noteSort: Sort
): NoteTreeItem[] => {
  if (tree.length < 2) return [...tree];

  // compute sort keys once rather than in every comparison
  const byDate = (item: NoteTreeItem) => {
    switch (noteSort) {
      case Sort.DateModifiedAscending:
      case Sort.DateModifiedDescending:
        return new Date(item.updated_at).getTime();
      case Sort.DateCreatedAscending:
      case Sort.DateCreatedDescending:
        return new Date(item.created_at).getTime();
      default:
        return 0;
    }
  };
  const isDesc = noteSort === Sort.DateModifiedDescending
    || noteSort === Sort.DateCreatedDescending
    || noteSort === Sort.TitleDescending;
  const isByTitle = noteSort === Sort.TitleAscending
    || noteSort === Sort.TitleDescending
    || !Object.values(Sort).includes(noteSort);
  const keyed = tree.map((item) => ({ item, date: byDate(item) }));

  keyed.sort((a, b) => {
    const dirFirst = Number(Boolean(b.item.is_dir)) - Number(Boolean(a.item.is_dir));
    if (dirFirst !== 0) return dirFirst;
    const [x, y] = isDesc ? [b, a] : [a, b];
    return isByTitle
      ? ciStringCompare(x.item.title, y.item.title)
      : x.date - y.date;
  });

  return keyed.map((k) => k.item);
};

// sorted dir lists, by list (immutable in store) and sort
const sortCache = new WeakMap<NoteTreeItem[], { sort: Sort; sorted: NoteTreeItem[] }>();

const sortNoteTreeCached = (tree: NoteTreeItem[], noteSort: Sort): NoteTreeItem[] => {
  const cached = sortCache.get(tree);
  if (cached && cached.sort === noteSort) return cached.sorted;
  const sorted = sortNoteTree(tree, noteSort);
  sortCache.set(tree, { sort: noteSort, sorted });
  return sorted;
};

export default memo(SidebarNotes);
