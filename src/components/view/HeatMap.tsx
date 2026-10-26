import { useCallback, useEffect, useMemo } from 'react';
import { store, useStore } from 'lib/store';
import {
  countNoteActivities,
  mergeActivities,
  type ActivityData,
  type ActivityRecord,
} from 'lib/activity';
import { getStrDate } from 'utils/helper';
import { Note } from 'types/model';

type HeatMapProps = {
  noteList: readonly Note[];
  onClickCell: (date: string) => void;
  className?: string;
};

export default function HeatMap(props: HeatMapProps) {
  const { noteList, onClickCell } = props;

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

  const weeks = useMemo(() => buildWeeks(activeRecord), [activeRecord]);

  const onDayClick = useCallback((date: string) => onClickCell(date), [onClickCell]);

  const hmLabelClass = "text-xs fill-base-content/60";

  return (
    <div className="overflow-auto p-1 m-1">
      <svg width="828" height="128" className="hm-svg">
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

type DayCell = { date: string; style: string; tip: string };

type WeekProps = {
  days: DayCell[];
  weekIdx: number;
  onClick: (date: string) => void;
};

function WeekHeatMap({ days, weekIdx, onClick }: WeekProps) {
  return (
    <g transform={`translate(${16 * weekIdx}, 0)`}>
      {days.map((day, dayIdx) => (
        <rect 
          key={`day-${dayIdx}`} width="11" height="11" rx="2" ry="2"  
          x={`${16 - weekIdx}`} 
          y={`${15 * dayIdx}`} 
          className={day.style} 
          onClick={() => onClick(day.date)}
        >
          <title>{day.tip}</title>
        </rect>
      ))}
    </g>
  );
}

/** 53 weeks to this week, 7 days each: computed once, not per cell */
function buildWeeks(data: ActivityRecord): DayCell[][] {
  const today = new Date();
  const weekDay = today.getDay();
  return Array.from({ length: 53 }, (_, weekIdx) =>
    Array.from({ length: 7 }, (_, dayIdx) => {
      const date = getDate(today, weekIdx, dayIdx);
      const aData: ActivityData | undefined = data[date];
      const isAfterToday = weekIdx >= 52 && dayIdx > weekDay;
      return {
        date,
        style: getDayStyle(aData?.activityNum ?? 0, isAfterToday),
        tip: `${date}:\nActivity: ${aData?.activityNum || 0}\nCreated: ${aData?.createNum || 0}\nUpdated: ${aData?.updateNum || 0}`,
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

function getDayStyle(an: number, isAfterToday: boolean) {
  const anStyle = isAfterToday 
    ? 'fill-transparent' 
    : an === 0 
      ? 'fill-base-300'
      : an >= 12 
        ? 'fill-primary'
        : an >= 6 
          ? 'fill-primary/60'
          : 'fill-primary/30';

  return `${anStyle} cursor-pointer`;
}

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
