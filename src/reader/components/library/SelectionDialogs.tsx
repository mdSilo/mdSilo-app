import { useMemo, useState } from 'react';
import { BaseModal } from '@/components/settings/BaseModal';
import { deleteCovers } from '../../covers';
import { deleteBooks, normalizeGroup, setBooksGroup } from '../../library';
import { allGroups, type ShelfBook } from '../../shelf';

const booksOf = (n: number) => `${n} book${n === 1 ? '' : 's'}`;

/** The books selected put in a group, typed or chosen; empty for none. */
export function MoveDialog({ ws, books, all, initial, onClose, onDone }: {
  ws: string;
  books: ShelfBook[];
  /** all the books, for the groups to choose from */
  all: ShelfBook[];
  /** the group offered first, e.g. the one opened */
  initial: string;
  onClose: () => void;
  onDone: (group: string) => void;
}) {
  const [group, setGroup] = useState(initial);
  const [busy, setBusy] = useState(false);
  const groups = useMemo(() => allGroups(all), [all]);
  return (
    <BaseModal title="Move to group" isOpen handleClose={onClose} panelClassName="max-w-md">
      <form
        className="flex flex-col gap-3 text-left"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const name = normalizeGroup(group);
          await setBooksGroup(ws, books.map((b) => b.hash), name);
          onDone(name);
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Group of the {booksOf(books.length)} selected</span>
          <input
            className="input input-sm w-full"
            list="library-move-groups"
            value={group}
            aria-label="Group"
            placeholder="e.g. Fiction/Classics, empty for none"
            onChange={(e) => setGroup(e.target.value)}
            autoFocus
          />
          <datalist id="library-move-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
          <span className="text-xs text-base-content/60">A new group is made if there is none of this name.</span>
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
            {normalizeGroup(group) ? 'Move' : 'Ungroup'}
          </button>
        </div>
      </form>
    </BaseModal>
  );
}

/** The books selected deleted: their files, progress, covers; their notes if asked. */
export function DeleteDialog({ ws, books, onClose, onDone }: {
  ws: string; books: ShelfBook[]; onClose: () => void; onDone: () => void;
}) {
  const [withNotes, setWithNotes] = useState(false);
  const [busy, setBusy] = useState(false);
  const synced = books.filter((b) => b.synced).length;
  return (
    <BaseModal title="Delete books" isOpen handleClose={onClose} panelClassName="max-w-md">
      <div className="flex flex-col gap-3 text-left">
        <p>
          Delete the {booksOf(books.length)} selected: the book files, their reading progress and covers, from the
          workspace{synced ? ` (${synced} synced: from the other devices too, once synced)` : ''}?
        </p>
        <ul className="pl-5 overflow-y-auto text-sm list-disc max-h-40 text-base-content/70">
          {books.map((b) => <li key={b.hash}>{b.title}</li>)}
        </ul>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="checkbox checkbox-sm" checked={withNotes} onChange={(e) => setWithNotes(e.target.checked)} />
          Delete their notes too (the .md next to each book)
        </label>
        <div className="flex justify-end gap-2">
          <button className="btn btn-sm btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-sm btn-error"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const hashes = books.map((b) => b.hash);
              await deleteBooks(ws, hashes, withNotes);
              await deleteCovers(ws, hashes);
              onDone();
            }}
          >
            Delete {booksOf(books.length)}
          </button>
        </div>
      </div>
    </BaseModal>
  );
}
