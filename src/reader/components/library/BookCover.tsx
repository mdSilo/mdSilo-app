import type { BookEntry } from '../../library';

type Props = {
  book: Pick<BookEntry, 'title' | 'author'>;
  url?: string;
  /** small, e.g. in a group: the title smaller, no author */
  small?: boolean;
  className?: string;
};

/** The cover of a book; without one, its title and author on paper. */
export default function BookCover({ book, url, small = false, className = '' }: Props) {
  if (url) {
    return <img src={url} alt="" draggable={false} className={`object-cover w-full h-full rounded-sm shadow-sm ${className}`} />;
  }
  return (
    <div
      className={`flex flex-col items-center justify-center w-full h-full gap-2 p-2 overflow-hidden font-serif text-center rounded-sm shadow-sm bg-base-200 text-base-content/70 ${className}`}
      data-testid="fallback-cover"
    >
      <span className={small ? 'text-[0.5rem] line-clamp-3' : 'text-sm font-medium line-clamp-4'}>{book.title}</span>
      {!small && book.author ? <span className="text-xs text-base-content/50 line-clamp-2">{book.author}</span> : null}
    </div>
  );
}
