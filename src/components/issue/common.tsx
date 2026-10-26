import { TbCircleDot as IconOpen, TbCircleCheck as IconClosed } from 'react-icons/tb';
import { fmtDatetime } from 'utils/helper';
import type { IssueState } from './types';

type IconProps = { state: IssueState; size?: number; className?: string };

export function StateIcon({ state, size = 18, className }: IconProps) {
  return state === 'open' ? (
    <IconOpen size={size} className={`shrink-0 ${className ?? 'text-success'}`} aria-label="open" />
  ) : (
    <IconClosed size={size} className={`shrink-0 ${className ?? 'text-purple-600'}`} aria-label="closed" />
  );
}

export function StateBadge({ state }: { state: IssueState }) {
  const cls = state === 'open' ? 'bg-success text-success-content' : 'bg-purple-600 text-white';
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 text-sm rounded-full ${cls}`}>
      <StateIcon state={state} size={16} className="text-current" />
      <span>{state === 'open' ? 'Open' : 'Closed'}</span>
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
  'px-2 py-1 text-sm bg-base-100 border border-base-300 rounded-sm';
export const btnClass =
  'px-3 py-1 text-sm border border-base-300 rounded-sm hover:bg-base-content/5 disabled:opacity-50';
export const primaryBtnClass =
  'px-3 py-1 text-sm text-success-content rounded-sm bg-success hover:bg-success/85 disabled:opacity-50';
