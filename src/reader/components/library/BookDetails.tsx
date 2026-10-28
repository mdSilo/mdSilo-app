import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import copy from 'copy-to-clipboard';
import {
  TbBook, TbBookmarks, TbCloud, TbCloudOff, TbLink, TbNotes, TbPencil, TbPhoto, TbPhotoOff, TbRestore, TbTrash,
} from 'react-icons/tb';
import { BaseModal } from '@/ui/BaseModal';
import { IconButton } from '@/ui/ui';
import { openFileDilog, openFilePath } from '@/workspace/open';
import { useCurrentViewContext } from '@/state/useCurrentView';
import { sanitizeHtml } from '@/lib/sanitize';
import { annotationsPathOf, bookHref } from '../../annotations';
import { COVER_EXTS, coverUrl, deleteCovers, setCustomCover } from '../../covers';
import { deleteBook, normalizeGroup, saveBookEntry, setBookSynced, type BookEntry } from '../../library';
import { formOf, metaOfForm, validateMeta, type Form } from '../../metaForm';
import { allGroups, formatSeries, STATUSES, type ShelfBook } from '../../shelf';
import { formatDuration, totalSeconds } from '../../stats';
import BookCover from './BookCover';

type Props = {
  ws: string;
  book: ShelfBook;
  /** all the books, for the groups to choose from */
  books: ShelfBook[];
  cover?: string;
  onClose: () => void;
  /** the library changed: to load again */
  onChanged: () => void;
};

type Mode = 'view' | 'edit' | 'mark' | 'delete';

/** A book of the library: its details; its metadata edited; its group and status; deleted. */
export default function BookDetails({ ws, book, books, cover, onClose, onChanged }: Props) {
  const [mode, setMode] = useState<Mode>('view');
  const title = { view: 'Book details', edit: 'Edit metadata', mark: 'Group and status', delete: 'Delete the book' }[mode];
  const done = () => {
    setMode('view');
    onChanged();
  };
  return (
    <BaseModal title={title} isOpen handleClose={onClose} panelClassName="max-w-xl">
      <div className="text-left" data-testid="book-details">
        {mode === 'edit' ? (
          <EditMeta ws={ws} book={book} cover={cover} onCancel={() => setMode('view')} onSaved={done} />
        ) : mode === 'mark' ? (
          <MarkBook ws={ws} book={book} books={books} onCancel={() => setMode('view')} onSaved={done} />
        ) : mode === 'delete' ? (
          <DeleteBook
            ws={ws}
            book={book}
            onCancel={() => setMode('view')}
            onDeleted={() => {
              onClose();
              onChanged();
            }}
          />
        ) : (
          <ViewBook ws={ws} book={book} cover={cover} onMode={setMode} onClose={onClose} onChanged={onChanged} />
        )}
      </div>
    </BaseModal>
  );
}

function ViewBook({ ws, book, cover, onMode, onClose, onChanged }: {
  ws: string; book: ShelfBook; cover?: string; onMode: (mode: Mode) => void; onClose: () => void; onChanged: () => void;
}) {
  const { dispatch } = useCurrentViewContext();
  const [size, setSize] = useState<number | undefined>();
  const [hasNotes, setHasNotes] = useState(false);
  const [copied, setCopied] = useState(false);
  const notesPath = annotationsPathOf(book.path);
  useEffect(() => {
    if (!book.here) return;
    invoke<{ size?: number }>('get_file_meta', { filePath: book.path })
      .then((meta) => setSize(meta?.size))
      .catch(() => undefined);
    invoke<boolean>('file_exist', { filePath: notesPath }).then(setHasNotes).catch(() => undefined);
  }, [book.path, book.here, notesPath]);

  const seconds = totalSeconds(book.state?.time);
  const fields: [string, ReactNode][] = [
    ['Publisher', book.publisher],
    ['Published', book.published],
    ['Language', book.language?.join(', ')],
    ['Identifier', book.identifier],
    ['Format', book.format],
    ['File size', size !== undefined ? formatBytes(size) : undefined],
    ['Progress', book.state?.fraction ? `${Math.round(book.state.fraction * 100)}%` : undefined],
    ['Reading time', seconds > 0 ? formatDuration(seconds) : undefined],
    ['Last read', formatDate(book.state?.updatedAt)],
    ['Added', formatDate(book.addedAt)],
    ['Subjects', book.subjects?.join(', ')],
  ];

  return (
    <>
      <div className="flex gap-4 mb-4">
        <div className="w-24 shrink-0 aspect-28/41">
          <BookCover book={book} url={cover} />
        </div>
        <div className="flex flex-col min-w-0 gap-0.5">
          <div className="text-lg font-bold break-words line-clamp-2">{book.title || 'Untitled'}</div>
          {book.subtitle ? <div className="text-base-content/70 line-clamp-1">{book.subtitle}</div> : null}
          {book.series ? <div className="text-sm text-base-content/70">{formatSeries(book)}</div> : null}
          <div className="text-base-content/70 line-clamp-1">{book.author || 'Unknown author'}</div>
          <div className="flex flex-wrap gap-1 mt-1">
            {book.group ? <span className="badge badge-sm badge-ghost">{book.group}</span> : null}
            {book.status ? <span className="badge badge-sm badge-primary badge-soft">{book.status}</span> : null}
            {!book.here ? <span className="badge badge-sm badge-warning badge-soft">Not on this device</span> : null}
          </div>
          <div className="flex flex-wrap gap-1 mt-auto">
            {book.here ? (
              <Action title="Read" onClick={() => { onClose(); dispatch({ view: 'book', path: book.path }); }}>
                <TbBook size={16} />
              </Action>
            ) : null}
            <Action title="Edit metadata" onClick={() => onMode('edit')}><TbPencil size={16} /></Action>
            <Action title="Group and status" onClick={() => onMode('mark')}><TbBookmarks size={16} /></Action>
            <Action
              title={book.synced ? 'Stop syncing the book file' : 'Sync the book file too'}
              onClick={async () => {
                await setBookSynced(ws, book.hash, !book.synced);
                onChanged();
              }}
            >
              {book.synced ? <TbCloud size={16} /> : <TbCloudOff size={16} />}
            </Action>
            <Action
              title={copied ? 'Copied' : 'Copy a link to the book'}
              onClick={() => {
                copy(`[${book.title}](${bookHref(book.hash)})`);
                setCopied(true);
              }}
            >
              <TbLink size={16} />
            </Action>
            {hasNotes ? (
              <Action
                title="Open the notes"
                onClick={async () => {
                  onClose();
                  await openFilePath(notesPath, true);
                  dispatch({ view: 'md', params: { noteId: notesPath } });
                }}
              >
                <TbNotes size={16} />
              </Action>
            ) : null}
            <Action title="Delete" onClick={() => onMode('delete')} danger><TbTrash size={16} /></Action>
          </div>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3 mb-4 sm:grid-cols-3">
        {fields.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-sm font-semibold">{label}</dt>
            <dd className="text-sm break-words text-base-content/70 line-clamp-3">{value || 'Unknown'}</dd>
          </div>
        ))}
      </dl>
      <div className="mb-2">
        <div className="text-sm font-semibold">File</div>
        <div className="text-sm break-all text-base-content/70">{book.file}</div>
      </div>
      <div>
        <div className="text-sm font-semibold">Description</div>
        <div
          className="text-sm text-base-content/70 max-h-48 overflow-y-auto [&_p]:my-1"
          dangerouslySetInnerHTML={{ __html: book.description ? sanitizeHtml(book.description) : 'No description' }}
        />
      </div>
    </>
  );
}

const FIELDS: { field: keyof Form; label: string; placeholder?: string; wide?: boolean; area?: boolean }[] = [
  { field: 'title', label: 'Title *', wide: true },
  { field: 'subtitle', label: 'Subtitle', wide: true },
  { field: 'author', label: 'Author', placeholder: 'Jane Doe, John Roe', wide: true },
  { field: 'series', label: 'Series' },
  { field: 'seriesIndex', label: 'Series index', placeholder: '1' },
  { field: 'seriesTotal', label: 'Total in series' },
  { field: 'publisher', label: 'Publisher' },
  { field: 'published', label: 'Publication date', placeholder: 'YYYY or YYYY-MM-DD' },
  { field: 'language', label: 'Language', placeholder: 'en, zh, fr' },
  { field: 'identifier', label: 'Identifier', placeholder: '978-0123456789', wide: true },
  { field: 'subjects', label: 'Subjects', placeholder: 'Fiction, Science, History', wide: true },
  { field: 'description', label: 'Description', wide: true, area: true },
];

/** The cover as edited: as it is, an image chosen, the one of the book, none. */
type CoverEdit = { kind: 'keep' } | { kind: 'image'; path: string; url: string } | { kind: 'book' } | { kind: 'none' };

function EditMeta({ ws, book, cover, onCancel, onSaved }: {
  ws: string; book: ShelfBook; cover?: string; onCancel: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<Form>(() => formOf(book));
  const [coverEdit, setCoverEdit] = useState<CoverEdit>({ kind: 'keep' });
  const [bookCover, setBookCover] = useState<string | undefined>();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const errors = useMemo(() => validateMeta(form), [form]);

  // the cover of the book itself, to restore it
  useEffect(() => {
    if (coverEdit.kind !== 'book') return;
    let url: string | undefined;
    void coverUrl(ws, book.hash).then((u) => {
      url = u;
      setBookCover(u);
    });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [coverEdit.kind, ws, book.hash]);
  useEffect(() => () => {
    if (coverEdit.kind === 'image') URL.revokeObjectURL(coverEdit.url);
  }, [coverEdit]);

  const shownCover = coverEdit.kind === 'keep' ? cover
    : coverEdit.kind === 'image' ? coverEdit.url
    : coverEdit.kind === 'book' ? bookCover
    : undefined;

  const chooseImage = async () => {
    const picked = await openFileDilog(COVER_EXTS, false);
    const path = typeof picked === 'string' ? picked : picked?.[0];
    if (!path) return;
    const data = await invoke<ArrayBuffer | number[]>('read_file_bytes', { filePath: path });
    const bytes = data instanceof ArrayBuffer ? data : new Uint8Array(data);
    setCoverEdit({ kind: 'image', path, url: URL.createObjectURL(new Blob([bytes])) });
  };

  const save = async () => {
    if (Object.keys(errors).length) return;
    setSaving(true);
    setError('');
    try {
      let coverField: BookEntry['cover'] = book.cover;
      if (coverEdit.kind === 'image') {
        if (!(await setCustomCover(ws, book.hash, coverEdit.path))) throw new Error('The image could not be read');
        coverField = 'custom';
      } else if (coverEdit.kind === 'book') {
        coverField = undefined;
      } else if (coverEdit.kind === 'none') {
        coverField = 'none';
      }
      await saveBookEntry(ws, { hash: book.hash, ...metaOfForm(form), edited: true, cover: coverField });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex gap-4 mb-4">
        <div className="flex flex-col w-28 gap-1 shrink-0">
          <button type="button" className="aspect-28/41" onClick={chooseImage} title="Choose an image">
            <BookCover book={{ title: form.title, author: form.author }} url={shownCover} />
          </button>
          <div className="flex justify-between">
            <Action title="Choose an image" onClick={chooseImage}><TbPhoto size={16} /></Action>
            <Action title="The cover of the book" onClick={() => setCoverEdit({ kind: 'book' })}><TbRestore size={16} /></Action>
            <Action title="No cover" onClick={() => setCoverEdit({ kind: 'none' })} danger><TbPhotoOff size={16} /></Action>
          </div>
        </div>
        <div className="flex flex-col flex-1 min-w-0 gap-2">
          {FIELDS.slice(0, 3).map((f) => <Field key={f.field} {...f} form={form} setForm={setForm} error={errors[f.field]} />)}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {FIELDS.slice(3).map((f) => <Field key={f.field} {...f} form={form} setForm={setForm} error={errors[f.field]} />)}
      </div>
      <p className="mt-2 text-xs text-base-content/60">
        Once saved, the metadata is not taken from the book file any more.
      </p>
      {error ? <p className="mt-2 text-sm text-error">{error}</p> : null}
      <div className="flex justify-end gap-2 mt-4">
        <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>Cancel</button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => {
            setForm(formOf(book));
            setCoverEdit({ kind: 'keep' });
          }}
        >
          Reset
        </button>
        <button type="submit" className="btn btn-sm btn-primary" disabled={saving || Object.keys(errors).length > 0}>
          Save
        </button>
      </div>
    </form>
  );
}

function Field({ field, label, placeholder, wide, area, form, setForm, error }: (typeof FIELDS)[number] & {
  form: Form; setForm: (fn: (form: Form) => Form) => void; error?: string;
}) {
  const props = {
    value: form[field],
    placeholder,
    'aria-label': label.replace(' *', ''),
    'aria-invalid': error ? true : undefined,
    onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [field]: e.target.value })),
  };
  return (
    <label className={`flex flex-col gap-1 text-sm ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="font-medium">{label}</span>
      {area ? (
        <textarea className={`textarea textarea-sm w-full ${error ? 'textarea-error' : ''}`} rows={4} {...props} />
      ) : (
        <input className={`input input-sm w-full ${error ? 'input-error' : ''}`} {...props} />
      )}
      {error ? <span className="text-xs text-error">{error}</span> : null}
    </label>
  );
}

function MarkBook({ ws, book, books, onCancel, onSaved }: {
  ws: string; book: ShelfBook; books: ShelfBook[]; onCancel: () => void; onSaved: () => void;
}) {
  const [group, setGroup] = useState(book.group ?? '');
  const [status, setStatus] = useState(book.status ?? '');
  const groups = useMemo(() => allGroups(books), [books]);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        await saveBookEntry(ws, {
          hash: book.hash,
          group: normalizeGroup(group) || undefined,
          status: status.trim() || undefined,
        });
        onSaved();
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Group</span>
        <input
          className="input input-sm w-full"
          list="library-groups"
          value={group}
          aria-label="Group"
          placeholder="e.g. Fiction/Classics, empty for none"
          onChange={(e) => setGroup(e.target.value)}
        />
        <datalist id="library-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Status</span>
        <input
          className="input input-sm w-full"
          list="library-statuses"
          value={status}
          aria-label="Status"
          placeholder="Todo, Doing, Done, ..."
          onChange={(e) => setStatus(e.target.value)}
        />
        <datalist id="library-statuses">{STATUSES.map((s) => <option key={s} value={s} />)}</datalist>
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-sm btn-primary">Save</button>
      </div>
    </form>
  );
}

function DeleteBook({ ws, book, onCancel, onDeleted }: {
  ws: string; book: ShelfBook; onCancel: () => void; onDeleted: () => void;
}) {
  const [withNotes, setWithNotes] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <p>
        Delete <b>{book.title}</b>: the book file, its reading progress and covers, from the workspace
        {book.synced ? ' (and from the other devices once synced)' : ''}?
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="checkbox checkbox-sm" checked={withNotes} onChange={(e) => setWithNotes(e.target.checked)} />
        Delete its notes too ({annotationsPathOf(book.file).split('/').pop()})
      </label>
      <div className="flex justify-end gap-2">
        <button className="btn btn-sm btn-ghost" onClick={onCancel}>Cancel</button>
        <button
          className="btn btn-sm btn-error"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await deleteBook(ws, book.hash, withNotes);
            await deleteCovers(ws, book.hash);
            onDeleted();
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function Action({ title, onClick, danger = false, children }: {
  title: string; onClick: () => void; danger?: boolean; children: ReactNode;
}) {
  return (
    <IconButton className={danger ? 'text-error' : ''} title={title} onClick={onClick}>
      {children}
    </IconButton>
  );
}

const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;

const formatDate = (iso?: string) => {
  const t = iso ? new Date(iso) : undefined;
  return t && !Number.isNaN(t.getTime()) ? t.toLocaleDateString() : undefined;
};
