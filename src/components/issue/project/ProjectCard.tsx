import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TbFlag as IconFlag } from 'react-icons/tb';
import { StateIcon } from '../common';
import LabelChip from '../LabelChip';
import type { Issue, IssueData } from '../types';

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

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      data-testid="project-card"
      className={`p-2 bg-white border border-gray-200 rounded shadow-sm cursor-grab dark:bg-gray-900 dark:border-gray-700 ${isDragging ? 'opacity-40' : ''} ${overlay ? 'shadow-lg' : ''}`}
      onClick={() => onOpen?.(issue.number)}
    >
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <StateIcon state={issue.state} size={14} />#{issue.number}
      </div>
      <div className="my-1 text-sm font-medium break-words">{issue.title}</div>
      {labels.length || milestone ? (
        <div className="flex flex-wrap items-center gap-1">
          {labels.map((l) => <LabelChip key={l.id} label={l} />)}
          {milestone ? (
            <span className="flex items-center gap-1 text-xs text-gray-500"><IconFlag size={12} />{milestone.title}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
