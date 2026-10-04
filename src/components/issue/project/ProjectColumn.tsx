import { useMemo, useState } from 'react';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TbPlus as IconPlus, TbTrash as IconTrash, TbCircleCheck as IconCloses } from 'react-icons/tb';
import { inputClass } from '../common';
import type { Issue, IssueData, ProjectStatus } from '../types';
import ProjectCard, { cardDndId } from './ProjectCard';

type Props = {
  status: ProjectStatus;
  issues: Issue[]; // in column order
  data: IssueData;
  /** issues that can be added to this project */
  candidates: Issue[];
  onOpen: (num: number) => void;
  onRename: (name: string) => void;
  onToggleCloses: () => void;
  onDelete: () => void;
  /** title creates a new issue; '#n' adds issue n */
  onAddItem: (text: string) => void;
  overlay?: boolean;
};

export const columnDndId = (id: string) => `status-${id}`;

export default function ProjectColumn(props: Props) {
  const { status, issues, data, candidates, onOpen, onRename, onToggleCloses, onDelete, onAddItem, overlay = false } = props;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(status.name);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const ids = useMemo(() => issues.map((i) => cardDndId(i.number)), [issues]);

  const { setNodeRef, attributes, listeners, transform, transition, isDragging, isOver } = useSortable({
    id: columnDndId(status.id),
    data: { type: 'Column', status: status.id },
    disabled: editing || overlay,
  });
  const style = { transition, transform: CSS.Transform.toString(transform) };

  const commitName = () => {
    setEditing(false);
    if (name.trim() && name !== status.name) onRename(name);
    else setName(status.name);
  };
  const submit = () => {
    if (text.trim()) onAddItem(text.trim());
    setText('');
    setAdding(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid="project-column"
      className={`flex flex-col flex-shrink-0 w-72 max-h-full bg-gray-100 rounded dark:bg-gray-800 ${isDragging ? 'opacity-40' : ''} ${isOver ? 'ring-2 ring-primary-400' : ''}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="flex items-center gap-2 px-3 py-2 cursor-grab group"
        style={{ borderTop: `3px solid ${status.color || '#9ca3af'}` }}
      >
        {editing ? (
          <input
            aria-label="Column name"
            className={`${inputClass} flex-1`}
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => { if (e.key === 'Enter') commitName(); }}
          />
        ) : (
          <button type="button" className="font-semibold text-left" title="Rename" onClick={() => setEditing(true)}>
            {status.name}
          </button>
        )}
        <span className="text-xs text-gray-500">{issues.length}</span>
        <span className="flex-1" />
        <button
          type="button"
          aria-label={`Moving here closes issues: ${status.closes ? 'on' : 'off'}`}
          aria-pressed={!!status.closes}
          title={status.closes ? 'Moving an item here closes it' : 'Click: moving an item here closes it'}
          className={status.closes ? 'text-purple-600' : 'text-gray-400 opacity-0 group-hover:opacity-100'}
          onClick={onToggleCloses}
        >
          <IconCloses size={16} />
        </button>
        <button
          type="button"
          aria-label={`Delete column ${status.name}`}
          className="text-gray-400 opacity-0 group-hover:opacity-100 hover:text-red-600"
          onClick={() => {
            if (window.confirm(`Delete column "${status.name}"? Its items move to the first column.`)) onDelete();
          }}
        >
          <IconTrash size={16} />
        </button>
      </div>
      <div className="flex flex-col flex-1 gap-2 px-2 pb-2 overflow-y-auto min-h-[3rem]">
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {issues.map((issue) => (
            <ProjectCard key={issue.number} issue={issue} data={data} status={status.id} onOpen={onOpen} />
          ))}
        </SortableContext>
      </div>
      <div className="px-2 pb-2">
        {adding ? (
          <>
            <input
              aria-label={`Add item to ${status.name}`}
              list={`candidates-${status.id}`}
              className={`${inputClass} w-full`}
              placeholder="New issue title, or #number"
              value={text}
              autoFocus
              onChange={(e) => setText(e.target.value)}
              onBlur={() => { if (!text.trim()) setAdding(false); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
                if (e.key === 'Escape') setAdding(false);
              }}
            />
            <datalist id={`candidates-${status.id}`}>
              {candidates.map((i) => <option key={i.number} value={`#${i.number}`}>{i.title}</option>)}
            </datalist>
          </>
        ) : (
          <button
            type="button"
            className="flex items-center w-full gap-1 px-2 py-1 text-sm text-gray-500 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
            onClick={() => setAdding(true)}
          >
            <IconPlus size={14} /> Add item
          </button>
        )}
      </div>
    </div>
  );
}
