import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { TbBookUpload, TbCloud, TbCloudOff, TbVocabulary } from 'react-icons/tb';
import ErrorBoundary from 'components/misc/ErrorBoundary';
import Spinner from 'components/misc/Spinner';
import { useCurrentViewContext } from 'context/useCurrentView';
import { listDir, openFileDilog } from 'file/open';
import { fromWorkspacePath, joinPath } from 'file/util';
import { useStore } from 'lib/store';
import { READING_DIR } from 'workspace/layout';
import { BOOK_EXTS, formatContributors, formatLanguageMap, openBook } from '../document';
import { formatDuration, totalSeconds } from '../stats';
import { cacheCover, coverUrl } from '../covers';
import { readBookFile } from '../readerStore';
import {
  importBookFile, readBookState, refreshLibrary, saveBookEntry, setBookSynced, titleOfFile,
  type BookEntry, type BookState,
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
  const covers = useCovers(initDir, rows, (hash, meta) => {
    setRows((list) => list?.map((r) => (r.hash === hash ? { ...r, ...meta } : r)));
  });

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
          <button className="btn btn-sm btn-ghost" onClick={() => dispatch({ view: 'vocabulary' })} title="The words to learn">
            <TbVocabulary size={16} /> Vocabulary
          </button>
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
                    className="flex gap-3 text-left disabled:cursor-not-allowed"
                    disabled={!row.here}
                    title={row.here ? row.file : 'Not on this device: the book file is not synced'}
                    onClick={() => dispatch({ view: 'book', path: row.path })}
                  >
                    {covers[row.hash] ? (
                      <img src={covers[row.hash]} alt="" className="object-cover w-16 rounded-sm shadow-sm h-24 shrink-0" />
                    ) : (
                      <div className="flex items-center justify-center w-16 h-24 text-xs rounded-sm shrink-0 bg-base-300 text-base-content/50">
                        {row.format}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold line-clamp-3">{row.title}</div>
                      <div className="text-sm text-base-content/60 line-clamp-2">{row.author || ' '}</div>
                    </div>
                  </button>
                  <progress
                    className="w-full progress progress-primary"
                    value={Math.round((row.state?.fraction ?? 0) * 100)}
                    max={100}
                  />
                  <div className="flex items-center justify-between text-xs text-base-content/60">
                    <span className="badge badge-ghost badge-xs">{row.format}</span>
                    <span>
                      {Math.round((row.state?.fraction ?? 0) * 100)}%
                      {totalSeconds(row.state?.time) > 0 ? ` · ${formatDuration(totalSeconds(row.state?.time))}` : ''}
                    </span>
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

type Meta = { title: string; author: string };

/**
 * The covers of the books, as cached; the missing ones made one book at a
 * time, the books here only, their title and author read on the way.
 */
function useCovers(ws: string | undefined, rows: Row[] | undefined, onMeta: (hash: string, meta: Meta) => void) {
  const onMetaRef = useRef(onMeta);
  onMetaRef.current = onMeta;
  // once per book in the library, not per change of the rows
  const hashes = rows?.map((r) => r.hash).join(',');
  const [covers, setCovers] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!ws || !rows) return;
    let cancelled = false;
    const urls: string[] = [];
    (async () => {
      const missing: Row[] = [];
      for (const row of rows) {
        const url = await coverUrl(ws, row.hash).catch(() => undefined);
        if (cancelled) return;
        if (url) {
          urls.push(url);
          setCovers((c) => ({ ...c, [row.hash]: url }));
        } else if (row.here) {
          missing.push(row);
        }
      }
      for (const row of missing) {
        if (cancelled) return;
        try {
          const { book } = await openBook(await readBookFile(row.path));
          const made = await cacheCover(ws, row.hash, book);
          // a book never opened: named by its file until now
          const meta = {
            title: formatLanguageMap(book.metadata?.title) || row.title,
            author: formatContributors(book.metadata?.author),
          };
          await book.destroy?.();
          if (row.title === titleOfFile(row.path) && (meta.title !== row.title || meta.author !== row.author)) {
            await saveBookEntry(ws, { hash: row.hash, ...meta });
            if (!cancelled) onMetaRef.current(row.hash, meta);
          }
          const url = made ? await coverUrl(ws, row.hash) : undefined;
          if (url) {
            urls.push(url);
            if (!cancelled) setCovers((c) => ({ ...c, [row.hash]: url }));
          }
        } catch {
          // no cover for a book failing to open
        }
      }
    })();
    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, hashes]);
  return covers;
}
