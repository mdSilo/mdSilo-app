import { TbCircleDot as IconOpen, TbCircleCheck as IconClosed } from 'react-icons/tb';
import { fmtDatetime } from 'utils/helper';
import type { IssueState } from './types';

type IconProps = { state: IssueState; size?: number; className?: string };

export function StateIcon({ state, size = 18, className }: IconProps) {
  return state === 'open' ? (
    <IconOpen size={size} className={`flex-shrink-0 ${className ?? 'text-green-600'}`} aria-label="open" />
  ) : (
    <IconClosed size={size} className={`flex-shrink-0 ${className ?? 'text-purple-600'}`} aria-label="closed" />
  );
}

export function StateBadge({ state }: { state: IssueState }) {
  const cls = state === 'open' ? 'bg-green-600' : 'bg-purple-600';
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 text-sm text-white rounded-full ${cls}`}>
      <StateIcon state={state} size={16} className="text-white" />
      <span className="text-white">{state === 'open' ? 'Open' : 'Closed'}</span>
    </span>
  );
}

/** "3 minutes ago", "2 days ago"... falls back to a date after 30 days. */
export function timeAgo(iso: string, now = Date.now()) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const sec = Math.max(0, Math.round((now - t) / 1000));
  const units: [number, string][] = [[60, 'second'], [60, 'minute'], [24, 'hour'], [30, 'day']];
  let v = sec;
  for (const [size, name] of units) {
    if (v < size) return v === 0 && name === 'second' ? 'just now' : `${v} ${name}${v === 1 ? '' : 's'} ago`;
    v = Math.floor(v / size);
  }
  return `on ${new Date(t).toLocaleDateString()}`;
}

export function TimeAgo({ iso }: { iso: string }) {
  return <time dateTime={iso} title={fmtDatetime(iso)}>{timeAgo(iso)}</time>;
}

export const inputClass =
  'px-2 py-1 text-sm border border-gray-300 rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200';
export const btnClass =
  'px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700 disabled:opacity-50';
export const primaryBtnClass =
  'px-3 py-1 text-sm text-white rounded bg-green-600 hover:bg-green-700 disabled:opacity-50';
