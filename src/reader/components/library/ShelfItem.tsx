import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { TbChevronLeft, TbChevronRight, TbCloud, TbCloudOff, TbInfoCircle } from 'react-icons/tb';
import { IconButton } from '@/components/misc/ui';
import { formatDuration, totalSeconds } from '../../stats';
import { formatSeries, isGroup, plainText, type ShelfBook, type ShelfGroup, type ShelfItem, type ViewMode } from '../../shelf';
import BookCover from './BookCover';

/** The ids of the items to drag and drop: `book:<hash>`, `group:<key>`. */
export const dndIdOf = (item: ShelfItem) => (isGroup(item) ? `group:${item.key}` : `book:${item.hash}`);

type Props = {
  item: ShelfItem;
  mode: ViewMode;
  covers: Record<string, string>;
  onOpen: (item: ShelfItem) => void;
  onDetails: (book: ShelfBook) => void;
  /** the files of the books synced, or not */
  onSync: (hashes: string[], synced: boolean) => void;
  /** books are being selected: a click selects, no dragging */
  selecting?: boolean;
  selected?: Set<string>;
  onSelect?: (hashes: string[], on: boolean) => void;
};

/** How many of the books are: none, some, all. */
const share = (books: ShelfBook[], test: (b: ShelfBook) => boolean) => {
  const n = books.filter(test).length;
  return n === 0 ? 'none' : n === books.length ? 'all' : 'some';
};

/**
 * A book or a group on the shelf: opened by a click; a book dragged onto
 * another book or a group to group them. While selecting, a click selects
 * the book, or all the books of the group.
 */
export default function ShelfItemView(props: Props) {
  const { item, mode, onOpen, selecting = false, selected, onSelect } = props;
  const id = dndIdOf(item);
  const drag = useDraggable({ id, disabled: isGroup(item) || selecting });
  const drop = useDroppable({ id });
  const style = drag.transform
    ? { transform: `translate3d(${drag.transform.x}px, ${drag.transform.y}px, 0)` }
    : undefined;
  const label = isGroup(item) ? item.name : item.title;
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(item);
    }
  };

  return (
    <div
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      style={style}
      // a group is not dragged: not aria-disabled either
      {...(isGroup(item) || selecting ? {} : { ...drag.attributes, ...drag.listeners })}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={selecting ? share(isGroup(item) ? item.books : [item], (b) => Boolean(selected?.has(b.hash))) !== 'none' : undefined}
      data-testid={isGroup(item) ? 'shelf-group' : 'shelf-book'}
      onClick={() => onOpen(item)}
      onKeyDown={onKeyDown}
      className={`relative rounded-md outline-none cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-primary ${
        drag.isDragging ? 'relative z-10 opacity-80 shadow-lg' : ''
      } ${drop.isOver && !drag.isDragging ? 'ring-2 ring-primary bg-primary/10' : ''} ${
        mode === 'grid' ? 'p-2 hover:bg-base-200' : 'px-3 py-2 border-b border-base-200 hover:bg-base-200/60'
      }`}
    >
      {selecting ? (
        <SelectBox books={isGroup(item) ? item.books : [item]} label={label} selected={selected} onSelect={onSelect} />
      ) : null}
      {isGroup(item) ? <GroupItem group={item} {...props} /> : <BookItem book={item} {...props} />}
    </div>
  );
}

/**
 * The books selected: all, some (of a group), none. Checked, all of them
 * selected; unchecked, none.
 */
function SelectBox({ books, label, selected, onSelect }: {
  books: ShelfBook[]; label: string; selected?: Set<string>; onSelect?: Props['onSelect'];
}) {
  const state = share(books, (b) => Boolean(selected?.has(b.hash)));
  return (
    <input
      type="checkbox"
      className="absolute z-10 checkbox checkbox-sm checkbox-primary top-3 left-3"
      aria-label={`Select ${label}`}
      checked={state === 'all'}
      ref={(el) => {
        if (el) el.indeterminate = state === 'some';
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onChange={() => onSelect?.(books.map((b) => b.hash), state !== 'all')}
    />
  );
}

/** The sync of the files of some books: on for all, off for all. */
function SyncButton({ books, onSync }: { books: ShelfBook[]; onSync: Props['onSync'] }) {
  const state = share(books, (b) => Boolean(b.synced));
  const one = books.length === 1;
  const synced = books.filter((b) => b.synced).length;
  const title = one
    ? state === 'all'
      ? 'The book file is synced with the workspace (git): click to stop'
      : 'Only the notes and progress are synced: click to sync the book file too'
    : state === 'all'
      ? `All ${books.length} book files synced with the workspace (git): click to stop`
      : `${synced} of ${books.length} book files synced: click to sync them all`;
  return (
    <ShelfButton title={title} onClick={() => onSync(books.map((b) => b.hash), state !== 'all')}>
      {state === 'none' ? <TbCloudOff size={14} /> : <TbCloud size={14} className={state === 'some' ? 'opacity-50' : ''} />}
    </ShelfButton>
  );
}

function BookItem({ book, mode, covers, onDetails, onSync }: Props & { book: ShelfBook }) {
  const percent = Math.round((book.state?.fraction ?? 0) * 100);
  const seconds = totalSeconds(book.state?.time);
  const series = formatSeries(book);
  const footer = (
    <div className="flex items-center gap-1 text-xs text-base-content/60">
      <span className="flex-1 truncate">
        {book.state?.fraction ? `${percent}%` : ''}
        {seconds > 0 ? `${book.state?.fraction ? ' · ' : ''}${formatDuration(seconds)}` : ''}
      </span>
      {mode === 'list' && book.status ? <span className="badge badge-ghost badge-xs">{book.status}</span> : null}
      {mode === 'list' ? <span className="badge badge-ghost badge-xs">{book.format}</span> : null}
      <SyncButton books={[book]} onSync={onSync} />
      <ShelfButton title="Book details" onClick={() => onDetails(book)}>
        <TbInfoCircle size={14} />
      </ShelfButton>
    </div>
  );
  const cover = (
    <div className="aspect-28/41 w-full">
      <BookCover book={book} url={covers[book.hash]} />
    </div>
  );
  const title = book.here ? book.file : 'Not on this device: the book file is not synced';

  if (mode === 'grid') {
    return (
      <div className={`flex flex-col gap-1 ${book.here ? '' : 'opacity-60'}`} title={title}>
        {cover}
        <div className="text-xs font-semibold truncate">{book.title}</div>
        {book.state?.fraction ? (
          <progress className="w-full h-1 progress progress-primary" value={percent} max={100} />
        ) : null}
        {footer}
      </div>
    );
  }
  return (
    <div className={`flex gap-4 ${book.here ? '' : 'opacity-60'}`} title={title}>
      <div className="w-16 shrink-0">{cover}</div>
      <div className="flex flex-col flex-1 min-w-0 gap-0.5">
        <div className="font-semibold line-clamp-1">{book.title}</div>
        <div className="text-sm text-base-content/70 line-clamp-1">{book.author}</div>
        {series ? <div className="text-sm text-base-content/60 line-clamp-1">{series}</div> : null}
        <div className="flex-1 text-xs text-base-content/60 line-clamp-2">{plainText(book.description)}</div>
        {footer}
      </div>
    </div>
  );
}

function GroupItem({ group, mode, covers, onSync }: Props & { group: ShelfGroup }) {
  const count = (
    <div className="flex items-center gap-1 text-xs text-base-content/60">
      <span className="flex-1">{`${group.books.length} book${group.books.length === 1 ? '' : 's'}`}</span>
      <SyncButton books={group.books} onSync={onSync} />
    </div>
  );
  if (mode === 'grid') {
    return (
      <div className="flex flex-col gap-1">
        <div className="grid grid-cols-2 grid-rows-2 gap-1 p-1.5 rounded-sm shadow-sm aspect-28/41 bg-base-200">
          {group.books.slice(0, 4).map((book) => (
            <BookCover key={book.hash} book={book} url={covers[book.hash]} small />
          ))}
        </div>
        <div className="text-xs font-semibold truncate">{group.name}</div>
        {count}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-4">
      <CoverRow group={group} covers={covers} />
      <div className="w-40 min-w-24 shrink-0">
        <div className="font-semibold truncate">{group.name}</div>
        {count}
      </div>
    </div>
  );
}

/**
 * The covers of a group in a row, scrolled; by arrows too, as in readup:
 * each shown when there is more on its side, half a row a click.
 */
function CoverRow({ group, covers }: { group: ShelfGroup; covers: Record<string, string> }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });
  const check = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setMore({ left: max > 5 && el.scrollLeft > 5, right: max > 5 && el.scrollLeft < max - 5 });
  }, []);
  useEffect(() => {
    check();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [check, group.books.length]);
  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    el?.scrollBy({ left: dir * el.clientWidth * 0.5, behavior: 'smooth' });
  };
  const arrow = (dir: 1 | -1) => (
    <div className={`absolute inset-y-0 w-12 pointer-events-none ${dir < 0 ? 'left-0 bg-linear-to-r' : 'right-0 bg-linear-to-l'} from-base-100/90 to-transparent`}>
      <button
        className={`absolute -translate-y-1/2 top-1/2 btn btn-circle btn-xs pointer-events-auto bg-base-100 shadow-sm ${dir < 0 ? 'left-1' : 'right-1'}`}
        aria-label={dir < 0 ? 'Scroll left' : 'Scroll right'}
        // not a drag of the item, not opening the group
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          scroll(dir);
        }}
      >
        {dir < 0 ? <TbChevronLeft size={14} /> : <TbChevronRight size={14} />}
      </button>
    </div>
  );
  return (
    <div className="relative min-w-0 shrink" data-testid="cover-row">
      <div ref={ref} className="flex h-24 gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }} onScroll={check}>
        {group.books.map((book) => (
          <div key={book.hash} className="h-full aspect-28/41 shrink-0">
            <BookCover book={book} url={covers[book.hash]} small />
          </div>
        ))}
      </div>
      {more.left ? arrow(-1) : null}
      {more.right ? arrow(1) : null}
    </div>
  );
}

/** Not a drag of the item, not a click on it. */
function ShelfButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <IconButton
      size="xs"
      title={title}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {children}
    </IconButton>
  );
}
