import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { TbBookUpload, TbCloud, TbCloudOff } from 'react-icons/tb';
import ErrorBoundary from 'components/misc/ErrorBoundary';
import Spinner from 'components/misc/Spinner';
import { useCurrentViewContext } from 'context/useCurrentView';
import { listDir, openFileDilog } from 'file/open';
import { fromWorkspacePath, joinPath } from 'file/util';
import { useStore } from 'lib/store';
import { READING_DIR } from 'workspace/layout';
import { BOOK_EXTS } from '../document';
import {
  importBookFile, readBookState, refreshLibrary, setBookSynced, type BookEntry, type BookState,
} from '../library';

type Row = BookEntry & { path: string; here: boolean; state?: BookState };

/** The books of the workspace: to read, to add, to sync or not. */
export default function Library() {
  const { dispatch } = useCurrentViewContext();
  const initDir = useStore((state) => state.initDir);
  const layout = useStore((state) => state.layout);
  const [rows, setRows] = useState<Row[] | undefined>();
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!initDir || layout !== 'workspace') return;
    const lib = await refreshLibrary(initDir);
    const list: Row[] = [];
    for (const entry of Object.values(lib.books)) {
      const path = fromWorkspacePath(initDir, entry.file);
      const [here, state] = await Promise.all([
        invoke<boolean>('file_exist', { filePath: path }),
        readBookState(initDir, entry.hash),
      ]);
      list.push({ ...entry, path, here: Boolean(here), state });
    }
    // the books read lately first
    list.sort((a, b) =>
      (b.state?.updatedAt ?? '').localeCompare(a.state?.updatedAt ?? '') || a.title.localeCompare(b.title));
    setRows(list);
  }, [initDir, layout]);

  useEffect(() => {
    void load();
  }, [load]);

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
      // the new files in the sidebar
      void listDir(joinPath(initDir, READING_DIR), false);
      if (added.length === 1) {
        dispatch({ view: 'book', path: added[0] });
      } else {
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const shown = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return term
      ? rows?.filter((r) => `${r.title} ${r.author}`.toLowerCase().includes(term))
      : rows;
  }, [rows, filter]);

  if (layout !== 'workspace') {
    return (
      <div className="p-8 text-center text-base-content/70">
        Books are read in a workspace with a reading folder: upgrade the folder in the sidebar first.
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex flex-col w-full h-full p-6 overflow-y-auto bg-base-100" data-testid="library">
        <div className="flex items-center gap-2 mb-4">
          <h1 className="flex-1 text-xl font-semibold">Library</h1>
          <input
            className="input input-sm w-48"
            placeholder="Filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button className="btn btn-sm btn-primary" onClick={onAdd} disabled={busy}>
            <TbBookUpload size={16} /> Add books
          </button>
        </div>
        {!shown ? (
          <Spinner className="w-8 h-8 mx-auto" />
        ) : shown.length === 0 ? (
          <p className="text-base-content/60">
            No books yet. Add EPUB, PDF, MOBI, AZW3, FB2 or CBZ files, or put them in the reading folder.
          </p>
        ) : (
          <ul className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]">
            {shown.map((row) => (
              <li key={row.hash} className={`card card-border bg-base-200/40 ${row.here ? '' : 'opacity-60'}`}>
                <div className="p-3 card-body">
                  <button
                    className="text-left disabled:cursor-not-allowed"
                    disabled={!row.here}
                    title={row.here ? row.file : 'Not on this device: the book file is not synced'}
                    onClick={() => dispatch({ view: 'book', path: row.path })}
                  >
                    <div className="font-semibold line-clamp-2">{row.title}</div>
                    <div className="text-sm text-base-content/60 truncate">{row.author || ' '}</div>
                  </button>
                  <progress
                    className="w-full progress progress-primary"
                    value={Math.round((row.state?.fraction ?? 0) * 100)}
                    max={100}
                  />
                  <div className="flex items-center justify-between text-xs text-base-content/60">
                    <span className="badge badge-ghost badge-xs">{row.format}</span>
                    <span>{Math.round((row.state?.fraction ?? 0) * 100)}%</span>
                    <button
                      className="btn btn-ghost btn-xs"
                      title={row.synced
                        ? 'The book file is synced with the workspace (git): click to stop'
                        : 'Only the notes and progress are synced: click to sync the book file too'}
                      onClick={async () => {
                        if (!initDir) return;
                        await setBookSynced(initDir, row.hash, !row.synced);
                        await load();
                      }}
                    >
                      {row.synced ? <TbCloud size={14} /> : <TbCloudOff size={14} />}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ErrorBoundary>
  );
}
