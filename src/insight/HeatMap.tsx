import { useCallback, useEffect, useMemo, useState } from 'react';
import { store, useStore } from '@/state/store';
import {
  countNoteActivities,
  mergeActivities,
  type ActivityData,
  type ActivityRecord,
} from '@/insight/activity';
import { getStrDate } from '@/lib/helper';
import { Note } from '@/types/model';

type HeatMapProps = {
  noteList: readonly Note[];
  /** seconds read per day, `yyyy-m-d` */
  reading?: Record<string, number>;
  onClickCell: (date: string) => void;
  className?: string;
};

/** What the heatmap counts: notes written, time read, or both. */
export type HeatMapMode = 'all' | 'writing' | 'reading';

const MODES: Array<[HeatMapMode, string]> = [['all', 'All'], ['writing', 'Writing'], ['reading', 'Reading']];
// the color of each kind of activity, as in the cells
const MODE_DOT: Record<HeatMapMode, string> = { all: '', writing: 'bg-primary', reading: 'bg-secondary' };

export default function HeatMap(props: HeatMapProps) {
  const { noteList, reading, onClickCell } = props;
  const [mode, setMode] = useState<HeatMapMode>('all');

  // the stored record keeps the activities of notes since changed or deleted
  const stored = useStore((state) => state.activities);
  const activeRecord = useMemo(
    () => mergeActivities(stored, countNoteActivities(noteList)),
    [stored, noteList]
  );
  // persist, out of render; merged is the stored record if nothing new
  useEffect(() => {
    if (activeRecord !== store.getState().activities) {
      store.getState().setActivities(activeRecord);
    }
  }, [activeRecord]);

  const weeks = useMemo(() => buildWeeks(activeRecord, reading, mode), [activeRecord, reading, mode]);

  const onDayClick = useCallback((date: string) => onClickCell(date), [onClickCell]);

  const hmLabelClass = "text-xs fill-base-content/60";

  return (
    <div className="overflow-auto p-1 m-1">
      {reading ? (
        <div role="tablist" className="tabs tabs-box tabs-xs w-fit mb-1" data-testid="heatmap-mode">
          {MODES.map(([value, label]) => (
            <button
              key={value}
              role="tab"
              className={`tab ${mode === value ? 'tab-active' : ''}`}
              aria-selected={mode === value}
              onClick={() => setMode(value)}
            >
              {MODE_DOT[value] ? <span className={`inline-block w-2 h-2 mr-1 rounded-xs ${MODE_DOT[value]}`} /> : null}
              {label}
            </button>
          ))}
        </div>
      ) : null}
      <svg width="828" height="128" className="hm-svg">
        <defs>
          {/* the rounded cell, to clip the half of a split cell */}
          <clipPath id="hm-cell" clipPathUnits="objectBoundingBox">
            <rect width="1" height="1" rx="0.18" ry="0.18" />
          </clipPath>
        </defs>
        <g transform="translate(10, 20)">
          {weeks.map((days, weekIdx) => (
            <WeekHeatMap 
              key={`week-${weekIdx}`} 
              days={days}
              weekIdx={weekIdx} 
              onClick={onDayClick} 
            />
          ))}
          {Array.from(Array(12).keys()).map(monIdx => (
            <text 
              key={`mon-${monIdx}`} 
              x={`${calcMonStart() * 16 + 66 * monIdx}`} 
              y="-8" className={hmLabelClass}
            >
              {getMonthLabel(monIdx)}
            </text>
          ))}
          <text textAnchor="start" className="hidden" dx="-10" dy="8">Sun</text>
          <text textAnchor="start" className={hmLabelClass} dx="-10" dy="25">M</text>
          <text textAnchor="start" className="hidden" dx="-10" dy="42">Tue</text>
          <text textAnchor="start" className={hmLabelClass} dx="-10" dy="56">W</text>
          <text textAnchor="start" className="hidden" dx="-10" dy="72">Thu</text>
          <text textAnchor="start" className={hmLabelClass} dx="-10" dy="85">F</text>
          <text textAnchor="start" className="hidden" dx="-10" dy="98">Sat</text>
        </g>
      </svg>
    </div>
  );
}

/**
 * A day: its color; or, both written and read that day (all), split by a
 * slash: written above it, read below.
 */
type DayCell = { date: string; style: string; read?: string; tip: string };

const CELL = 11;

type WeekProps = {
  days: DayCell[];
  weekIdx: number;
  onClick: (date: string) => void;
};

function WeekHeatMap({ days, weekIdx, onClick }: WeekProps) {
  return (
    <g transform={`translate(${16 * weekIdx}, 0)`}>
      {days.map((day, dayIdx) => {
        const x = 16 - weekIdx;
        const y = 15 * dayIdx;
        return (
          <g key={`day-${dayIdx}`} className="cursor-pointer" onClick={() => onClick(day.date)}>
            <title>{day.tip}</title>
            <rect width={CELL} height={CELL} rx="2" ry="2" x={x} y={y} className={day.style} />
            {day.read ? (
              <g clipPath="url(#hm-cell)" data-testid="hm-split">
                <polygon
                  points={`${x + CELL},${y} ${x + CELL},${y + CELL} ${x},${y + CELL}`}
                  className={day.read}
                />
                <line x1={x + CELL} y1={y} x2={x} y2={y + CELL} className="stroke-base-100" strokeWidth="1" />
              </g>
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

/** a quarter of an hour read counts as one activity */
export const READING_UNIT_SECONDS = 15 * 60;

/** 53 weeks to this week, 7 days each: computed once, not per cell */
export function buildWeeks(
  data: ActivityRecord, reading: Record<string, number> = {}, mode: HeatMapMode = 'all'
): DayCell[][] {
  const today = new Date();
  const weekDay = today.getDay();
  return Array.from({ length: 53 }, (_, weekIdx) =>
    Array.from({ length: 7 }, (_, dayIdx) => {
      const date = getDate(today, weekIdx, dayIdx);
      const aData: ActivityData | undefined = data[date];
      const isAfterToday = weekIdx >= 52 && dayIdx > weekDay;
      const read = reading[date] ?? 0;
      const readUnits = Math.ceil(read / READING_UNIT_SECONDS);
      const written = aData?.activityNum ?? 0;
      const writing = mode === 'reading' ? 0 : written;
      const reads = mode === 'writing' ? 0 : readUnits;
      const activity = writing + reads;
      const split = !isAfterToday && writing > 0 && reads > 0;
      return {
        date,
        style: isAfterToday
          ? 'fill-transparent'
          : writing > 0 ? writingStyle(writing) : reads > 0 ? readingStyle(reads) : 'fill-base-300',
        ...(split ? { read: readingStyle(reads) } : {}),
        tip: `${date}:\nActivity: ${activity}\nCreated: ${aData?.createNum || 0}\nUpdated: ${aData?.updateNum || 0}`
          + (read > 0 ? `\nRead: ${Math.round(read / 60)} min` : ''),
      };
    })
  );
}

/** local date format: yyyy-m-d */
function getDate(today: Date, weekIdx: number, dayIdx: number) {
  const date = new Date(today);
  const gapDay = (52 - weekIdx) * 7 - (dayIdx - today.getDay());
  date.setDate(today.getDate() - gapDay);
  return getStrDate(date.toString());
}

function calcMonStart() {
  const date = new Date();
  const day = date.getDate();
  const startIdx = Math.ceil(day / 7);
  return startIdx;
}

/** Notes created and updated: the more, the darker. */
const writingStyle = (n: number) =>
  n >= 12 ? 'fill-primary' : n >= 6 ? 'fill-primary/60' : 'fill-primary/30';

/** Quarters of an hour read: 2h and more the darkest, 1h, less. */
const readingStyle = (units: number) =>
  units >= 8 ? 'fill-secondary' : units >= 4 ? 'fill-secondary/60' : 'fill-secondary/30';

function getMonthLabel(idx: number) {
  if (idx > 11) return;
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  const nowMonth = new Date().getMonth();
  const monIdx = nowMonth + idx + 1;
  const realIdx = monIdx >= 12 ? monIdx - 12 : monIdx;
  return months[realIdx];
}
