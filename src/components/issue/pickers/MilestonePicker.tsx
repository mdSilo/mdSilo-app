import { TbCheck as IconCheck } from 'react-icons/tb';
import { useIssueStore } from '../issueStore';
import { milestoneProgress, setMilestone } from '../issueOps';
import type { Issue, IssueData } from '../types';
import Picker, { menuItemClass } from './Picker';

export default function MilestonePicker({ issue, data }: { issue: Issue; data: IssueData }) {
  const apply = useIssueStore((s) => s.apply);
  const current = data.milestones.find((m) => m.id === issue.milestone);
  const progress = current ? milestoneProgress(data, current.id) : undefined;
  const choices = data.milestones.filter((m) => m.state === 'open' || m.id === issue.milestone);
  return (
    <Picker
      title="Milestone"
      summary={
        current && progress ? (
          <div>
            <div className="font-medium">{current.title}</div>
            <div className="h-1.5 mt-1 bg-gray-200 rounded dark:bg-gray-700">
              <div className="h-1.5 bg-green-600 rounded" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        ) : (<span className="text-gray-500">No milestone</span>)
      }
    >
      {(close) => (
        <>
          {choices.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-500">No open milestones.</p>
          ) : choices.map((m) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={m.id === issue.milestone}
              key={m.id}
              className={menuItemClass}
              onClick={() => {
                apply((d) => setMilestone(d, issue.number, m.id === issue.milestone ? undefined : m.id));
                close();
              }}
            >
              <span className="w-4">{m.id === issue.milestone ? <IconCheck size={14} /> : null}</span>
              <span className="flex-1">{m.title}</span>
              {m.dueOn ? <span className="text-xs text-gray-500">{m.dueOn}</span> : null}
            </button>
          ))}
          {current ? (
            <button
              type="button"
              className={`${menuItemClass} border-t border-gray-200 dark:border-gray-600`}
              onClick={() => { apply((d) => setMilestone(d, issue.number)); close(); }}
            >
              Clear milestone
            </button>
          ) : null}
        </>
      )}
    </Picker>
  );
}
