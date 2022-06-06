import { store } from 'lib/store';
import { getStrDate } from 'utils/helper';

type HeatMapProps = {
  onClick: (date: string) => Promise<void>;
  className?: string;
};

export default function HeatMap({ onClick }: HeatMapProps) {
  const onDayClick = async (weekIdx: number, dayIdx: number) => {
    const date = getDate(weekIdx, dayIdx);
    await onClick(date)
  };

  const hmLabelClass = "text-xs fill-gray-500";

  return (
    <div className="overflow-auto p-1 m-1">
      <svg width="828" height="128" className="hm-svg">
        <g transform="translate(10, 20)">
          {Array.from(Array(53).keys()).map(weekIdx => (
            <WeekHeatMap key={`week-${weekIdx}`} weekIdx={weekIdx} onClick={onDayClick} />
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
  weekIdx: number;
  onClick: (weekIdx: number, dayIdx: number) => Promise<void>;
  className?: string;
};

function WeekHeatMap({ weekIdx, onClick }: WeekProps) {
  return (
    <g transform={`translate(${16 * weekIdx}, 0)`}>
      {Array.from(Array(7).keys()).map(dayIdx => (
        <rect 
          key={`day-${dayIdx}`} width="11" height="11" rx="2" ry="2"  
          x={`${16 - weekIdx}`} 
          y={`${15 * dayIdx}`} 
          className={getDayStyle(weekIdx, dayIdx)} 
          onClick={async () => await onClick(weekIdx, dayIdx)}
        >
          <title>{getDataToolTips(weekIdx, dayIdx)}</title>
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

type ActivityData = {
  activityNum: number; 
  createNum: number;
  updateNum: number;
}
function getData(weekIdx: number, dayIdx: number): ActivityData {
  const date = getDate(weekIdx, dayIdx);
  const notes = Object.values(store.getState().notes);
  let createNum = 0;
  let updateNum = 0;
  for (const note of notes) {
    if (getStrDate(note.created_at)=== date) {
      createNum += 1;
    }
    if (getStrDate(note.updated_at) === date) {
      updateNum += 1;
    }
  }
  return {
    activityNum: createNum + updateNum,
    createNum,
    updateNum,
  };
}

function getDataToolTips(weekIdx: number, dayIdx: number) {
  const data = getData(weekIdx, dayIdx);
  const date = getDate(weekIdx, dayIdx);
  return `${date}:\nActivity: ${data.activityNum}\nCreated: ${data.createNum}\nUpdated: ${data.updateNum}`;
}

function getDayStyle(weekIdx: number, dayIdx: number) {
  const data = getData(weekIdx, dayIdx);
  const an = data.activityNum;
  const anStyle = an === 0 
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
