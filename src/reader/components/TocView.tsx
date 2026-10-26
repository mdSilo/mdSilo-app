import { memo, useState } from 'react';
import { TbCaretRight as IconCaretRight } from 'react-icons/tb';
import type { TOCItem } from '../document';
import { getView } from '../view';

type Props = {
  toc: TOCItem[];
  /** the label of the chapter read */
  current?: string;
};

/** The table of contents of the book. */
function TocView({ toc, current }: Props) {
  if (toc.length === 0) {
    return <p className="p-4 text-sm text-base-content/60">No table of contents</p>;
  }
  return (
    <ul className="py-2 text-sm" data-testid="reader-toc">
      {toc.map((item, i) => (
        <TocItem key={`${item.href}-${i}`} item={item} depth={0} current={current} />
      ))}
    </ul>
  );
}

function TocItem({ item, depth, current }: { item: TOCItem; depth: number; current?: string }) {
  const [open, setOpen] = useState(false);
  const hasChildren = Boolean(item.subitems?.length);
  const isCurrent = current !== undefined && item.label?.trim() === current.trim();
  return (
    <li>
      <div
        className={`flex items-center pr-2 hover:bg-base-content/10 ${isCurrent ? 'text-primary font-semibold' : ''}`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
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
            <TocItem key={`${sub.href}-${i}`} item={sub} depth={depth + 1} current={current} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export default memo(TocView);
