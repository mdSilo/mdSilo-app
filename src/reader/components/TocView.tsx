import { memo, useEffect, useRef, useState } from 'react';
import { TbCaretRight as IconCaretRight } from 'react-icons/tb';
import type { TOCItem } from '../document';
import { getView } from '../view';

type Props = {
  toc: TOCItem[];
  /** the href of the chapter read */
  current?: string;
};

/** The items down to the one of an href, if there. */
export function pathTo(items: TOCItem[], href: string): TOCItem[] | undefined {
  for (const item of items) {
    if (item.href === href) return [item];
    const sub = item.subitems ? pathTo(item.subitems, href) : undefined;
    if (sub) return [item, ...sub];
  }
  return undefined;
}

/** The table of contents of the book: the chapter read shown, opened down to it. */
function TocView({ toc, current }: Props) {
  const listRef = useRef<HTMLUListElement>(null);
  const path = current ? pathTo(toc, current) : undefined;

  // the chapter read, in view
  useEffect(() => {
    const el = listRef.current?.querySelector('[aria-current="true"]');
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [current]);

  if (toc.length === 0) {
    return <p className="p-4 text-sm text-base-content/60">No table of contents</p>;
  }
  return (
    <ul ref={listRef} className="py-2 text-sm" data-testid="reader-toc">
      {toc.map((item, i) => (
        <TocItem key={`${item.href}-${i}`} item={item} depth={0} current={current} path={path} />
      ))}
    </ul>
  );
}

function TocItem({ item, depth, current, path }: {
  item: TOCItem; depth: number; current?: string; path?: TOCItem[];
}) {
  const onPath = Boolean(path?.includes(item));
  const [open, setOpen] = useState(onPath);
  const hasChildren = Boolean(item.subitems?.length);
  const isCurrent = current !== undefined && item.href === current;

  // opened as the reader goes into it
  useEffect(() => {
    if (onPath) setOpen(true);
  }, [onPath]);

  return (
    <li>
      <div
        className={`flex items-center pr-2 hover:bg-base-content/10 ${isCurrent ? 'bg-primary/10 text-primary font-semibold' : ''}`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        aria-current={isCurrent ? 'true' : undefined}
      >
        {hasChildren ? (
          <button
            className="p-1 rounded-sm hover:bg-base-content/15"
            onClick={() => setOpen(!open)}
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            <IconCaretRight size={14} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
          </button>
        ) : (
          <span className="w-[22px]" />
        )}
        <button
          className="flex-1 py-1 text-left truncate"
          title={item.label}
          onClick={() => void getView()?.goTo(item.href)}
        >
          {item.label?.trim() || '-'}
        </button>
      </div>
      {hasChildren && open ? (
        <ul>
          {item.subitems!.map((sub, i) => (
            <TocItem key={`${sub.href}-${i}`} item={sub} depth={depth + 1} current={current} path={path} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export default memo(TocView);
