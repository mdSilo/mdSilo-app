import { useCallback, useMemo } from 'react';
import { store, useStore } from 'lib/store';
import { getStrDate } from 'utils/helper';
import { Note } from 'types/model';

type ActivityData = {
  activityNum: number; 
  createNum: number;
  updateNum: number;
};

export type ActivityRecord = Record<string, ActivityData>;

type HeatMapProps = {
  onClickCell: (date: string) => void;
  className?: string;
};

export default function HeatMap(props: HeatMapProps) {
  const { onClickCell } = props;

  const notes = useStore((state) => state.notes);

  const noteList: Note[] = useMemo(() => {
    const noteList: Note[] = Object.values(notes) || [];
    return noteList;
  }, [notes]);

  const activeRecord = useMemo(() => {
    const activity: ActivityRecord = {};
    // current, the update_at maybe overrided
    //const notes = Object.values(store.getState().notes);
    const createDays = noteList.map(n => getStrDate(n.created_at));
    const updateDays = noteList.map(n => getStrDate(n.updated_at));
    // stored 
    const storedActivities = store.getState().activities;
    const storedDays = Object.keys(storedActivities);

    const allDays = [...createDays, ...updateDays, ...storedDays];
    const allDaysSet = new Set(allDays);

    for (const day of allDaysSet) {
      const createNum = createDays.filter(d => d === day).length;
      const updateNum = updateDays.filter(d => d === day).length;
      const activityNum = createNum + updateNum;
      const storedDay = storedActivities[day]; // canbe undefined

      activity[day] = {
        activityNum: Math.max(activityNum, storedDay?.activityNum || 0), 
        createNum: Math.max(createNum, storedDay?.createNum || 0), 
        updateNum: Math.max(updateNum, storedDay?.updateNum || 0),
      };
    }
    // console.log("res", activity);
    // persist in store
    store.getState().setActivities(activity);

    return activity;
  }, [noteList]);

  const onDayClick = useCallback(async (weekIdx: number, dayIdx: number) => {
    const date = getDate(weekIdx, dayIdx);
    onClickCell(date);
  }, [onClickCell]);

  const hmLabelClass = "text-xs fill-gray-500";

  return (
    <div className="overflow-auto p-1 m-1">
      <svg width="828" height="128" className="hm-svg">
        <g transform="translate(10, 20)">
          {Array.from(Array(53).keys()).map(weekIdx => (
            <WeekHeatMap 
              key={`week-${weekIdx}`} 
              data={activeRecord}
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

type WeekProps = {
  data: ActivityRecord;
  weekIdx: number;
  onClick: (weekIdx: number, dayIdx: number) => Promise<void>;
  className?: string;
};

function WeekHeatMap({ data, weekIdx, onClick }: WeekProps) {
  return (
    <g transform={`translate(${16 * weekIdx}, 0)`}>
      {Array.from(Array(7).keys()).map(dayIdx => (
        <rect 
          key={`day-${dayIdx}`} width="11" height="11" rx="2" ry="2"  
          x={`${16 - weekIdx}`} 
          y={`${15 * dayIdx}`} 
          className={getDayStyle(data, weekIdx, dayIdx)} 
          onClick={async () => await onClick(weekIdx, dayIdx)}
        >
          <title>{getDataToolTips(data, weekIdx, dayIdx)}</title>
        </rect>
      ))}
    </g>
  );
}

/** local date format: yyyy-m-d */
function getDate(weekIdx: number, dayIdx: number) {
  const date = new Date(); // today
  const day = date.getDate();
  const weekDay = date.getDay();
  const gapDay = (52 - weekIdx) * 7 - (dayIdx - weekDay);
  date.setDate(day - gapDay);
  return getStrDate(date.toString());
}

function calcMonStart() {
  const date = new Date();
  const day = date.getDate();
  const startIdx = Math.ceil(day / 7);
  return startIdx;
}

function getData(
  data: ActivityRecord,
  weekIdx: number, 
  dayIdx: number
): ActivityData {
  const date = getDate(weekIdx, dayIdx);
  return data[date];
}

function getDataToolTips(data: ActivityRecord, weekIdx: number, dayIdx: number) {
  const aData = getData(data, weekIdx, dayIdx);
  const date = getDate(weekIdx, dayIdx);
  return `${date}:\nActivity: ${aData?.activityNum || 0}\nCreated: ${aData?.createNum || 0}\nUpdated: ${aData?.updateNum || 0}`;
}

function getDayStyle(data: ActivityRecord, weekIdx: number, dayIdx: number) {
  const aData = getData(data, weekIdx, dayIdx);
  const an = aData?.activityNum || 0;
  const today = new Date();
  const weekDay = today.getDay();
  const isAfterToday = weekIdx >= 52 && dayIdx > weekDay;
  const anStyle = isAfterToday 
    ? 'fill-transparent' 
    : an === 0 
      ? 'fill-gray-200 dark:fill-gray-600'
      : an >= 12 
        ? 'fill-green-500'
        : an >= 6 
          ? 'fill-cyan-500'
          : 'fill-primary-200 dark:fill-primary-900';

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
