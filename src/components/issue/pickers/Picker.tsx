import { ReactNode, useEffect, useRef, useState } from 'react';
import { TbSettings as IconSettings } from 'react-icons/tb';

type Props = {
  title: string;
  /** shown below the header when closed (the current value) */
  summary: ReactNode;
  children: (close: () => void) => ReactNode;
};

/** A sidebar section with a gear button that opens a small popover menu. */
export default function Picker({ title, summary, children }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative py-3 border-b border-gray-200 dark:border-gray-700">
      <button
        type="button"
        aria-label={`Edit ${title}`}
        aria-expanded={open}
        className="flex items-center justify-between w-full mb-1 text-xs font-semibold text-gray-500 hover:text-primary-500 dark:text-gray-400"
        onClick={() => setOpen(!open)}
      >
        {title}
        <IconSettings size={14} />
      </button>
      <div className="text-sm">{summary}</div>
      {open ? (
        <div
          role="menu"
          aria-label={title}
          className="absolute right-0 z-20 w-64 mt-1 overflow-y-auto bg-white border border-gray-200 rounded shadow-lg max-h-80 dark:bg-gray-800 dark:border-gray-600"
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

export const menuItemClass =
  'flex items-center w-full gap-2 px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700';
