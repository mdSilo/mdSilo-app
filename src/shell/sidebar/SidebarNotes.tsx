import { memo, useMemo } from "react";
import { NoteTree, NoteTreeItem, useStore } from "@/state/store";
import { Sort } from "@/state/userSettings";
import { ciStringCompare } from "@/lib/helper";
import { onOpenFile, onListDir, openWebWorkspace } from "@/workspace/useOpen";
import { isWeb, normalizeSlash } from "@/workspace/util";
import ErrorBoundary from "@/ui/ErrorBoundary";
import { Spinner } from "@/ui/ui";
import { useT } from "@/i18n";
import SidebarNotesBar from "./SidebarNotesBar";
import SidebarNotesTree, { NoteTreeRow } from "./SidebarNotesTree";
import SidebarHistory from "./SidebarHistory";
import WorkspaceUpgrade from "./WorkspaceUpgrade";

type SidebarNotesProps = {
  className?: string;
};

function SidebarNotes(props: SidebarNotesProps) {
  const t = useT();
  const { className = "" } = props;

  const currentDir = useStore((state) => state.currentDir);
  const openProblem = useStore((state) => state.openProblem);
  const openingDir = useStore((state) => state.openingDir);

  const noteTree = useStore((state) => state.noteTree);
  const noteSort = useStore((state) => state.noteSort);
  const expandedDirs = useStore((state) => state.expandedDirs);
  // console.log("note tree", noteTree)
  const [sortedNoteTree, numOfNotes] = useMemo(() => {
    if (currentDir) {
      const treeList = noteTree[currentDir] || [];
      const rows = flattenNoteTree(
        noteTree,
        currentDir,
        expandedDirs,
        noteSort,
      );
      return [rows, treeList.length];
    } else {
      return [[], 0];
    }
  }, [noteTree, currentDir, expandedDirs, noteSort]);

  // console.log("tree", numOfNotes, sortedNoteTree, currentDir)

  const btnClass =
    "p-1 mt-4 mx-4 text-secondary-content rounded-sm bg-secondary hover:bg-secondary/85";

  return (
    <ErrorBoundary>
      <div className={`flex flex-col flex-1 overflow-x-hidden ${className}`}>
        {currentDir ? (
          <SidebarNotesBar noteSort={noteSort} numOfNotes={numOfNotes} />
        ) : null}
        {currentDir ? <WorkspaceUpgrade /> : null}
        {sortedNoteTree && sortedNoteTree.length > 0 ? (
          <SidebarNotesTree
            data={sortedNoteTree}
            className="flex-1 overflow-y-auto"
          />
        ) : currentDir ? null : (
          <>
            {openProblem ? (
              <OpenProblem problem={openProblem} />
            ) : openingDir ? (
              <div
                role="status"
                className="flex items-center gap-2 mx-4 mt-4 text-sm text-base-content/70"
              >
                <Spinner size="xs" />
                <span className="min-w-0 truncate" title={openingDir}>
                  {t("Opening {name}…", {
                    name:
                      openingDir.split(/[\\/]/).filter(Boolean).pop() ??
                      openingDir,
                  })}
                </span>
              </div>
            ) : null}
            <button className={btnClass} onClick={onListDir}>
              {t("Open Folder")}
            </button>
            <button className={btnClass} onClick={onOpenFile}>
              {t("Open File")}
            </button>
            <SidebarHistory />
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}

/** What failed or hangs opening a folder: on a phone, no console to look at. */
function OpenProblem({ problem }: { problem: string }) {
  const t = useT();
  const btn = "px-2 py-0.5 rounded-sm bg-base-200 hover:bg-base-300";
  return (
    <div
      role="alert"
      className="mx-4 mt-4 p-2 text-sm rounded-sm border border-error/40 text-error break-words"
    >
      <p className="select-text">{problem}</p>
      <div className="flex gap-2 mt-2 text-base-content">
        <button
          className={btn}
          onClick={() =>
            void navigator.clipboard
              ?.writeText(problem)
              .catch((e) => console.error("Failed to copy:", e))
          }
        >
          {t("Copy")}
        </button>
        {isWeb ? (
          <button
            className={btn}
            onClick={() =>
              void openWebWorkspace().catch((e) =>
                console.error("Failed to open the workspace:", e),
              )
            }
          >
            {t("Try again")}
          </button>
        ) : null}
        <button className={btn} onClick={() => window.location.reload()}>
          {t("Reload")}
        </button>
      </div>
    </div>
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
      const dirKey = node.is_dir ? normalizeSlash(node.id) : "";
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
const sortNoteTree = (tree: NoteTreeItem[], noteSort: Sort): NoteTreeItem[] => {
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
  const isDesc =
    noteSort === Sort.DateModifiedDescending ||
    noteSort === Sort.DateCreatedDescending ||
    noteSort === Sort.TitleDescending;
  const isByTitle =
    noteSort === Sort.TitleAscending ||
    noteSort === Sort.TitleDescending ||
    !Object.values(Sort).includes(noteSort);
  const keyed = tree.map((item) => ({ item, date: byDate(item) }));

  keyed.sort((a, b) => {
    const dirFirst =
      Number(Boolean(b.item.is_dir)) - Number(Boolean(a.item.is_dir));
    if (dirFirst !== 0) return dirFirst;
    const [x, y] = isDesc ? [b, a] : [a, b];
    return isByTitle
      ? ciStringCompare(x.item.title, y.item.title)
      : x.date - y.date;
  });

  return keyed.map((k) => k.item);
};

// sorted dir lists, by list (immutable in store) and sort
const sortCache = new WeakMap<
  NoteTreeItem[],
  { sort: Sort; sorted: NoteTreeItem[] }
>();

const sortNoteTreeCached = (
  tree: NoteTreeItem[],
  noteSort: Sort,
): NoteTreeItem[] => {
  const cached = sortCache.get(tree);
  if (cached && cached.sort === noteSort) return cached.sorted;
  const sorted = sortNoteTree(tree, noteSort);
  sortCache.set(tree, { sort: noteSort, sorted });
  return sorted;
};

export default memo(SidebarNotes);
