import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  DndContext, PointerSensor, pointerWithin, useDroppable, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  TbArrowLeft, TbBookUpload, TbChecks, TbChevronRight, TbCloud, TbCloudOff, TbFolderPlus, TbFolderShare, TbPencil,
  TbSearch, TbTrash,
  TbVocabulary, TbX,
} from 'react-icons/tb';
import ErrorBoundary from 'components/misc/ErrorBoundary';
import Spinner from 'components/misc/Spinner';
import { useCurrentViewContext } from 'context/useCurrentView';
import { listDir, openFileDilog } from 'file/open';
import { fromWorkspacePath, joinPath } from 'file/util';
import { useStore } from 'lib/store';
import { READING_DIR } from 'workspace/layout';
import { BOOK_EXTS } from '../document';
import {
  bookHashOf, importBookData, importBookFile, readBookState, refreshLibrary, setBooksGroup, setBooksSynced,
} from '../library';
import {
  breadcrumbs, countBooks, dropResult, filterBooks, hasGroup, isGroup, shelfItems, sortShelf,
  type GroupBy, type ShelfBook, type ShelfItem,
} from '../shelf';
import { importFolder, scanFolder, type FolderImportOptions } from '../folderImport';
import BookDetails from './library/BookDetails';
import GroupDialog from './library/GroupDialog';
import ShelfItemView from './library/ShelfItem';
import ViewMenu, { useLibrarySettings } from './library/ViewMenu';
import { DeleteDialog, MoveDialog } from './library/SelectionDialogs';
import ImportFolderDialog from './library/ImportFolderDialog';
import { useBookDrop, useCovers, type DroppedBook } from './library/hooks';

const GROUP_LABELS: Record<GroupBy, string> = {
  none: 'Books', group: 'Group', author: 'Author', series: 'Series', status: 'Status',
};

// the group opened, kept while a book is read
let lastOpened = { groupBy: 'group' as GroupBy, key: '' };

/**
 * The books of the workspace, as in readup: as a grid or a list, grouped by
 * the groups of the user, by author, series or status, sorted, searched; a
 * book dragged onto another one or onto a group to group them; the details
 * and metadata of a book edited; books added, dropped from the device too.
 */
export default function Library() {
  const { dispatch } = useCurrentViewContext();
  const initDir = useStore((state) => state.initDir);
  const layout = useStore((state) => state.layout);
  const [settings, updateSettings] = useLibrarySettings();
  const { view: mode, groupBy, sortBy, ascending } = settings;
  const [rows, setRows] = useState<ShelfBook[] | undefined>();
  const [query, setQuery] = useState('');
  const [opened, setOpened] = useState(() => (lastOpened.groupBy === groupBy ? lastOpened.key : ''));
  const [details, setDetails] = useState<string | undefined>();
  const [editGroup, setEditGroup] = useState(false);
  const [busy, setBusy] = useState(false);
  // a note on what was done: a warning, or an info
  const [message, setMessageState] = useState({ text: '', warn: true });
  const setMessage = (text: string, warn = true) => setMessageState({ text, warn });
  const [folderDialog, setFolderDialog] = useState(false);
  const [version, setVersion] = useState(0);
  // books selected, e.g. to sync their files; kept while going in and out of groups
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulk, setBulk] = useState<'move' | 'delete' | undefined>();
  const pageRef = useRef<HTMLDivElement>(null);

  const covers = useCovers(initDir, rows, version, (hash, patch) => {
    setRows((list) => list?.map((r) => (r.hash === hash ? { ...r, ...patch } : r)));
  });

  const load = useCallback(async () => {
    if (!initDir || layout !== 'workspace') return;
    const lib = await refreshLibrary(initDir);
    const list = await Promise.all(Object.values(lib.books).map(async (entry) => {
      const path = fromWorkspacePath(initDir, entry.file);
      const [here, state] = await Promise.all([
        invoke<boolean>('file_exist', { filePath: path }),
        readBookState(initDir, entry.hash),
      ]);
      return { ...entry, path, here: Boolean(here), state };
    }));
    setRows(list);
  }, [initDir, layout]);

  useEffect(() => {
    void load();
  }, [load]);

  const changed = useCallback(async () => {
    await load();
    setVersion((v) => v + 1);
  }, [load]);

  useEffect(() => {
    lastOpened = { groupBy, key: opened };
  }, [groupBy, opened]);

  const books = useMemo(() => filterBooks(rows ?? [], query), [rows, query]);

  // a group gone, e.g. its books moved: up to the nearest one left
  useEffect(() => {
    if (!rows || !opened || hasGroup(rows, groupBy, opened)) return;
    if (groupBy !== 'group') {
      setOpened('');
      return;
    }
    const parts = opened.split('/');
    while (parts.length && !hasGroup(rows, groupBy, parts.join('/'))) parts.pop();
    setOpened(parts.join('/'));
  }, [rows, groupBy, opened]);

  const items = useMemo(
    () => sortShelf(shelfItems(books, groupBy, opened), sortBy, ascending, groupBy, opened),
    [books, groupBy, opened, sortBy, ascending],
  );

  const chooseGroupBy = (value: GroupBy) => {
    updateSettings({ groupBy: value });
    setOpened('');
  };

  /** New books in reading/, in the group opened if any. */
  const addBooks = async (paths: string[]) => {
    if (!initDir || paths.length === 0) return;
    // the new files in the sidebar
    void listDir(joinPath(initDir, READING_DIR), false);
    await refreshLibrary(initDir);
    if (groupBy === 'group' && opened) {
      const hashes = (await Promise.all(paths.map(bookHashOf))).filter(Boolean);
      await setBooksGroup(initDir, hashes, opened);
    }
    await changed();
  };

  const onAdd = async () => {
    if (!initDir) return;
    const picked = await openFileDilog(Object.keys(BOOK_EXTS), true);
    const paths = typeof picked === 'string' ? [picked] : picked ?? [];
    if (paths.length === 0) return;
    setBusy(true);
    try {
      const added: string[] = [];
      for (const src of paths) {
        const path = await importBookFile(initDir, src);
        if (path) added.push(path);
      }
      await addBooks(added);
      // one book added: to read
      if (added.length === 1) dispatch({ view: 'book', path: added[0] });
    } finally {
      setBusy(false);
    }
  };

  const onDropFiles = async (dropped: DroppedBook[], skipped: number) => {
    if (!initDir) return;
    setMessage(dropped.length === 0
      ? `No books: ${Object.values(BOOK_EXTS).filter((f, i, all) => all.indexOf(f) === i).join(', ')} files can be added`
      : skipped > 0 ? `${skipped} file${skipped === 1 ? '' : 's'} not a book, left out` : '');
    if (dropped.length === 0) return;
    setBusy(true);
    try {
      const added: string[] = [];
      for (const book of dropped) {
        const path = 'path' in book
          ? await importBookFile(initDir, book.path)
          : await importBookData(initDir, book.name, book.data);
        if (path) added.push(path);
      }
      await addBooks(added);
    } finally {
      setBusy(false);
    }
  };
  /** Books from a folder of the device, as chosen in the dialog. */
  const onImportFolder = async (options: FolderImportOptions) => {
    if (!initDir) return;
    setFolderDialog(false);
    updateSettings({ folderImport: options });
    setBusy(true);
    setMessage(`Looking for books in ${options.dir}…`, false);
    try {
      const found = await scanFolder(options);
      if (found.length === 0) {
        setMessage('No books found in the folder, of the formats and size chosen.');
        return;
      }
      const target = groupBy === 'group' ? opened : '';
      const result = await importFolder(initDir, found, { flatten: options.flatten, group: target }, (done, total) => {
        setMessage(`Importing the books: ${done} of ${total}…`, false);
      });
      void listDir(joinPath(initDir, READING_DIR), false);
      const parts = [
        `${result.added} book${result.added === 1 ? '' : 's'} added`,
        result.existing ? `${result.existing} in the library already` : '',
        result.failed.length ? `${result.failed.length} failed: ${result.failed.map((p) => p.split(/[\\/]/).pop()).join(', ')}` : '',
      ].filter(Boolean);
      setMessage(parts.join(' · '), result.failed.length > 0);
      // the books where they went
      if (!options.flatten && groupBy !== 'group') chooseGroupBy('group');
      await changed();
    } finally {
      setBusy(false);
    }
  };

  const draggingFiles = useBookDrop(pageRef, (dropped, skipped) => void onDropFiles(dropped, skipped));

  // a book dropped onto a book: both in a new group; onto a group or a
  // breadcrumb: in that group
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!initDir || !rows || !over) return;
    const drop = dropResult(rows, String(active.id), String(over.id), groupBy, opened);
    if (!drop) return;
    await setBooksGroup(initDir, drop.hashes, drop.group);
    // the groups made shown
    if (groupBy !== 'group') chooseGroupBy('group');
    await load();
  };

  const select = (hashes: string[], on: boolean) => setSelected((old) => {
    const next = new Set(old);
    hashes.forEach((h) => (on ? next.add(h) : next.delete(h)));
    return next;
  });
  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  useEffect(() => {
    if (!selecting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !details && !editGroup && !bulk) stopSelecting();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selecting, details, editGroup, bulk]);

  const sync = async (hashes: string[], synced: boolean) => {
    if (!initDir || hashes.length === 0) return;
    await setBooksSynced(initDir, hashes, synced);
    await load();
  };

  const onOpen = (item: ShelfItem) => {
    if (selecting && !isGroup(item)) select([item.hash], !selected.has(item.hash));
    else if (isGroup(item)) setOpened(item.key);
    else if (item.here) dispatch({ view: 'book', path: item.path });
    else setDetails(item.hash);
  };

  if (layout !== 'workspace') {
    return (
      <div className="p-8 text-center text-base-content/70">
        Books are read in a workspace with a reading folder: upgrade the folder in the sidebar first.
      </div>
    );
  }

  const detailsBook = rows?.find((r) => r.hash === details);
  const count = countBooks(items);
  // the books shown, those in groups too
  const shownHashes = [...new Set(items.flatMap((i) => (isGroup(i) ? i.books : [i]).map((b) => b.hash)))];
  const chosen = rows?.filter((r) => selected.has(r.hash)) ?? [];

  return (
    <ErrorBoundary>
      <div
        ref={pageRef}
        className={`relative flex flex-col w-full h-full overflow-y-auto bg-base-100 ${draggingFiles ? 'ring-4 ring-inset ring-primary/60' : ''}`}
        data-testid="library"
      >
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 px-6 pt-5 pb-3 bg-base-100">
          <h1 className="text-xl font-semibold me-2">Library</h1>
          <label className="relative flex items-center flex-1 min-w-40 max-w-md">
            <TbSearch size={14} className="absolute z-10 left-3 pointer-events-none text-base-content/50" />
            <input
              className="w-full rounded-full input input-sm ps-8 pe-8"
              placeholder={count > 1 ? `Search in ${count} books` : 'Search books'}
              aria-label="Search books"
              value={query}
              spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query ? (
              <button className="absolute right-2 text-base-content/50" aria-label="Clear the search" onClick={() => setQuery('')}>
                <TbX size={14} />
              </button>
            ) : null}
          </label>
          <ViewMenu onGroupBy={chooseGroupBy} />
          <button
            className={`btn btn-sm btn-ghost ${selecting ? 'btn-active' : ''}`}
            onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
            title="Select books, e.g. to sync their files"
          >
            <TbChecks size={16} /> Select
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => dispatch({ view: 'vocabulary' })} title="The words to learn">
            <TbVocabulary size={16} /> Vocabulary
          </button>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => setFolderDialog(true)}
            disabled={busy}
            title="Import the books of a folder and its sub folders"
          >
            <TbFolderPlus size={16} /> Add folder
          </button>
          <button className="btn btn-sm btn-primary" onClick={onAdd} disabled={busy}>
            <TbBookUpload size={16} /> Add books
          </button>
        </div>
        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={(e) => void onDragEnd(e)}>
          {opened ? (
            groupBy === 'group' ? (
              <nav className="flex flex-wrap items-center gap-1 px-6 pb-2" aria-label="Groups">
                <Crumb path="" label="All" onOpen={setOpened} />
                {breadcrumbs(opened).map((crumb, i, all) => (
                  <Fragment key={crumb.path}>
                    <TbChevronRight size={16} className="text-base-content/50" />
                    {i === all.length - 1
                      ? <span className="px-2 py-1 font-medium truncate">{crumb.name}</span>
                      : <Crumb path={crumb.path} label={crumb.name} onOpen={setOpened} />}
                  </Fragment>
                ))}
                <button className="btn btn-ghost btn-xs btn-square" title="Rename the group" aria-label="Rename the group" onClick={() => setEditGroup(true)}>
                  <TbPencil size={14} />
                </button>
              </nav>
            ) : (
              <div className="flex items-center gap-2 px-6 pb-2">
                <button className="btn btn-ghost btn-sm btn-square" aria-label="Back to the library" onClick={() => setOpened('')}>
                  <TbArrowLeft size={18} />
                </button>
                <span className="text-sm text-base-content/60">{GROUP_LABELS[groupBy]}:</span>
                <span className="font-medium truncate">{opened}</span>
              </div>
            )
          ) : null}
          {selecting ? (
            <div
              role="toolbar"
              aria-label="Selected books"
              className="flex flex-wrap items-center gap-2 px-3 py-1.5 mx-6 mb-2 text-sm rounded-md bg-base-200"
            >
              <span className="me-auto">
                {chosen.length} selected
                {chosen.length ? ` · ${chosen.filter((b) => b.synced).length} file${chosen.filter((b) => b.synced).length === 1 ? '' : 's'} synced` : ''}
              </span>
              <button
                className="btn btn-xs btn-ghost"
                onClick={() => select(shownHashes, !shownHashes.every((h) => selected.has(h)))}
              >
                {shownHashes.length && shownHashes.every((h) => selected.has(h)) ? 'Unselect all' : 'Select all'}
              </button>
              <button
                className="btn btn-xs btn-ghost"
                disabled={chosen.length === 0}
                title="Sync the files of the books selected with the workspace (git)"
                onClick={() => void sync(chosen.map((b) => b.hash), true)}
              >
                <TbCloud size={14} /> Sync files
              </button>
              <button
                className="btn btn-xs btn-ghost"
                disabled={chosen.length === 0}
                title="Only the notes and progress of the books selected synced"
                onClick={() => void sync(chosen.map((b) => b.hash), false)}
              >
                <TbCloudOff size={14} /> Stop syncing
              </button>
              <button
                className="btn btn-xs btn-ghost"
                disabled={chosen.length === 0}
                title="Put the books selected in a group, or in none"
                onClick={() => setBulk('move')}
              >
                <TbFolderShare size={14} /> Move to group
              </button>
              <button
                className="btn btn-xs btn-ghost text-error"
                disabled={chosen.length === 0}
                title="Delete the books selected"
                onClick={() => setBulk('delete')}
              >
                <TbTrash size={14} /> Delete
              </button>
              <button className="btn btn-xs btn-ghost" onClick={stopSelecting}>Done</button>
            </div>
          ) : null}
          {message.text ? (
            <div role="status" className={`flex items-center gap-2 px-3 py-2 mx-6 mb-2 text-sm rounded-md ${message.warn ? 'bg-warning/15' : 'bg-base-200'}`}>
              <span className="flex-1">{message.text}</span>
              <button aria-label="Close" onClick={() => setMessage('')}><TbX size={14} /></button>
            </div>
          ) : null}
          <div className="px-4 pb-6">
            {!rows ? (
              <Spinner className="w-8 h-8 mx-auto" />
            ) : items.length === 0 ? (
              <p className="px-2 text-base-content/60">
                {rows.length === 0
                  ? 'No books yet. Add EPUB, PDF, MOBI, AZW3, FB2 or CBZ files, drop them here, or put them in the reading folder.'
                  : 'No books found.'}
              </p>
            ) : (
              <div
                className={mode === 'grid' ? 'grid gap-1 grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]' : 'flex flex-col'}
                role="list"
                aria-label="Bookshelf"
              >
                {items.map((item) => (
                  <ShelfItemView
                    key={isGroup(item) ? `group:${item.key}` : item.hash}
                    item={item}
                    mode={mode}
                    covers={covers}
                    onOpen={onOpen}
                    onDetails={(book) => setDetails(book.hash)}
                    onSync={(hashes, synced) => void sync(hashes, synced)}
                    selecting={selecting}
                    selected={selected}
                    onSelect={select}
                  />
                ))}
              </div>
            )}
          </div>
        </DndContext>
        {draggingFiles ? (
          <div className="fixed inset-x-0 bottom-6 z-20 mx-auto w-fit px-4 py-2 rounded-full shadow-lg bg-primary text-primary-content pointer-events-none">
            Drop the books to add them{groupBy === 'group' && opened ? ` to ${opened}` : ''}
          </div>
        ) : null}
        {busy ? <Spinner className="fixed w-8 h-8 bottom-6 right-6" /> : null}
      </div>
      {detailsBook && initDir ? (
        <BookDetails
          ws={initDir}
          book={detailsBook}
          books={rows ?? []}
          cover={covers[detailsBook.hash]}
          onClose={() => setDetails(undefined)}
          onChanged={() => void changed()}
        />
      ) : null}
      {folderDialog ? (
        <ImportFolderDialog
          initial={settings.folderImport}
          group={groupBy === 'group' ? opened : ''}
          onClose={() => setFolderDialog(false)}
          onImport={(options) => void onImportFolder(options)}
        />
      ) : null}
      {bulk === 'move' && initDir ? (
        <MoveDialog
          ws={initDir}
          books={chosen}
          all={rows ?? []}
          initial={groupBy === 'group' ? opened : ''}
          onClose={() => setBulk(undefined)}
          onDone={async (group) => {
            setBulk(undefined);
            await load();
            // the books where they went
            if (groupBy !== 'group') chooseGroupBy('group');
            setOpened(group);
          }}
        />
      ) : null}
      {bulk === 'delete' && initDir ? (
        <DeleteDialog
          ws={initDir}
          books={chosen}
          onClose={() => setBulk(undefined)}
          onDone={async () => {
            setBulk(undefined);
            setSelected(new Set());
            await changed();
          }}
        />
      ) : null}
      {editGroup && initDir ? (
        <GroupDialog
          ws={initDir}
          group={opened}
          onClose={() => setEditGroup(false)}
          onDone={async (renamed) => {
            setEditGroup(false);
            // the books moved first: else the group renamed is not found
            await load();
            setOpened(renamed);
          }}
        />
      ) : null}
    </ErrorBoundary>
  );
}

/** A group above, to open, and to drop a book in: `All` for no group. */
function Crumb({ path, label, onOpen }: { path: string; label: string; onOpen: (path: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `crumb:${path}` });
  return (
    <button
      ref={setNodeRef}
      className={`px-2 py-1 rounded truncate hover:bg-base-200 text-base-content/80 ${isOver ? 'ring-2 ring-primary bg-primary/10' : ''}`}
      title={path ? `Open ${path}; drop a book here to move it` : 'All the books; drop a book here to ungroup it'}
      onClick={() => onOpen(path)}
    >
      {label}
    </button>
  );
}
