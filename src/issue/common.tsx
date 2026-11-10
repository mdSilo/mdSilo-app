import {
  TbCircleDot as IconOpen,
  TbCircleCheck as IconClosed,
} from "react-icons/tb";
import { fmtDatetime } from "@/lib/helper";
import { getLocale, t, useT } from "@/i18n";
import type { IssueState } from "./types";

type IconProps = { state: IssueState; size?: number; className?: string };

export function StateIcon({ state, size = 18, className }: IconProps) {
  const t = useT();
  return state === "open" ? (
    <IconOpen
      size={size}
      className={`shrink-0 ${className ?? "text-success"}`}
      aria-label={t("open")}
    />
  ) : (
    <IconClosed
      size={size}
      className={`shrink-0 ${className ?? "text-secondary"}`}
      aria-label={t("closed")}
    />
  );
}

export function StateBadge({ state }: { state: IssueState }) {
  const t = useT();
  const cls =
    state === "open"
      ? "bg-success text-success-content"
      : "bg-secondary text-secondary-content";
  return (
    <span
      className={`inline-flex items-center gap-1 px-3 py-1 text-sm rounded-full ${cls}`}
    >
      <StateIcon state={state} size={16} className="text-current" />
      <span>{state === "open" ? t("Open") : t("Closed")}</span>
    </span>
  );
}

/** "3 minutes ago", "2 days ago"... falls back to a date after 30 days. */
export function timeAgo(iso: string, now = Date.now()) {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "";
  const sec = Math.max(0, Math.round((now - time) / 1000));
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [30, "day"],
  ];
  // in the language of the UI
  const locale = getLocale();
  let v = sec;
  for (const [size, unit] of units) {
    if (v < size)
      return v === 0 && unit === "second"
        ? t("just now")
        : new Intl.RelativeTimeFormat(locale).format(-v, unit);
    v = Math.floor(v / size);
  }
  return t("on {date}", { date: new Date(time).toLocaleDateString(locale) });
}

export function TimeAgo({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} title={fmtDatetime(iso)}>
      {timeAgo(iso)}
    </time>
  );
}

export const inputClass =
  "px-2 py-1 text-sm bg-base-100 border border-base-300 rounded-sm";
export const btnClass =
  "px-3 py-1 text-sm border border-base-300 rounded-sm hover:bg-base-content/5 disabled:opacity-50";
export const primaryBtnClass =
  "px-3 py-1 text-sm text-success-content rounded-sm bg-success hover:bg-success/85 disabled:opacity-50";
