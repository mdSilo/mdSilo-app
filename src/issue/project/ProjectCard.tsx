import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TbCalendar as IconCalendar, TbCheckbox as IconSubtasks, TbFlag as IconFlag } from 'react-icons/tb';
import { StateIcon } from '../common';
import { isOverdue, subtaskProgress } from '../issueOps';
import LabelChip from '../LabelChip';
import type { Issue, IssueData } from '../types';
import { issueLabel } from '../refs';

type Props = {
  issue: Issue;
  data: IssueData;
  status: string;
  onOpen?: (num: number) => void;
  overlay?: boolean;
};

export const cardDndId = (num: number) => `issue-${num}`;

export default function ProjectCard({ issue, data, status, onOpen, overlay = false }: Props) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: cardDndId(issue.number),
    data: { type: 'Card', issue: issue.number, status },
    disabled: overlay,
  });
  const style = { transition, transform: CSS.Transform.toString(transform) };
  const milestone = data.milestones.find((m) => m.id === issue.milestone);
  const labels = data.labels.filter((l) => issue.labels.includes(l.id));
  const progress = subtaskProgress(issue);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      data-testid="project-card"
      className={`p-2 bg-base-100 border border-base-300 rounded-sm shadow-xs cursor-grab ${isDragging ? 'opacity-40' : ''} ${overlay ? 'shadow-lg' : ''}`}
      onClick={() => onOpen?.(issue.number)}
    >
      <div className="flex items-center gap-1 text-xs text-base-content/60">
        <StateIcon state={issue.state} size={14} />{issueLabel(issue.number)}
      </div>
      <div className="my-1 text-sm font-medium wrap-break-word">{issue.title}</div>
      {labels.length || milestone || issue.dueOn || progress ? (
        <div className="flex flex-wrap items-center gap-1">
          {labels.map((l) => <LabelChip key={l.id} label={l} />)}
          {milestone ? (
            <span className="flex items-center gap-1 text-xs text-base-content/60"><IconFlag size={12} />{milestone.title}</span>
          ) : null}
          {issue.dueOn ? (
            <span
              className={`flex items-center gap-1 text-xs ${isOverdue(issue) ? 'text-error' : 'text-base-content/60'}`}
              title={isOverdue(issue) ? 'Overdue' : 'Due'}
              data-testid="card-due"
            >
              <IconCalendar size={12} />{issue.dueOn}
            </span>
          ) : null}
          {progress ? (
            <span className="flex items-center gap-1 text-xs text-base-content/60" title="Sub-tasks done" data-testid="card-subtasks">
              <IconSubtasks size={12} />{progress.done}/{progress.total}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
