import { memo, ReactNode } from 'react';
import useOnNoteLinkClick from 'editor/hooks/useOnNoteLinkClick';
import { BacklinkMatch } from './useBacklinks';

const MAX_CONTEXT_LEN = 128;

type BacklinkMatchLeafProps = {
  noteId: string;
  // the matches in the same block, sharing the context
  matches: BacklinkMatch[];
  className?: string;
};

// The context is plain text: render it as is (not as Markdown), highlighting
// the matches, so `_`, `*` etc. in text are shown as they are.
const BacklinkMatchLeaf = (props: BacklinkMatchLeafProps) => {
  const { noteId, matches, className } = props;
  const { onClick: onNoteLinkClick } = useOnNoteLinkClick();

  const containerClassName = `block text-left text-xs rounded p-2 my-1 w-full break-words ${className}`;

  return (
    <button
      className={containerClassName}
      onClick={() => onNoteLinkClick(noteId)}
    >
      {highlightContext(matches)}
    </button>
  );
};

export default memo(BacklinkMatchLeaf);

/** Context around the first match, with the matches highlighted */
export const highlightContext = (matches: BacklinkMatch[]): ReactNode[] => {
  if (matches.length === 0) return [];
  const context = matches[0].context;
  const ranges = [...matches].sort((a, b) => a.from - b.from);

  // shorten the context, centered on the first match
  const first = ranges[0];
  const half = Math.max(Math.floor((MAX_CONTEXT_LEN - (first.to - first.from)) / 2), 0);
  let start = Math.max(first.from - half, 0);
  const end = Math.min(Math.max(first.to + half, start + MAX_CONTEXT_LEN), context.length);
  start = Math.max(Math.min(start, end - MAX_CONTEXT_LEN), 0);

  const nodes: ReactNode[] = [];
  if (start > 0) nodes.push('…');
  let pos = start;
  for (const { from, to } of ranges) {
    if (from < pos || from >= end) continue;
    if (from > pos) nodes.push(context.slice(pos, from));
    const hiEnd = Math.min(to, end);
    nodes.push(
      <mark key={from} className="bg-yellow-200 dark:bg-yellow-700 dark:text-gray-100">
        {context.slice(from, hiEnd)}
      </mark>
    );
    pos = hiEnd;
  }
  if (pos < end) nodes.push(context.slice(pos, end));
  if (end < context.length) nodes.push('…');
  return nodes;
};
