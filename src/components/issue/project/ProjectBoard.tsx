import { useMemo, useState } from 'react';
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent, MouseSensor, PointerSensor, TouchSensor,
  closestCorners, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { createPortal } from 'react-dom';
import { TbPlus as IconPlus } from 'react-icons/tb';
import { useIssueStore } from '../issueStore';
import {
  addStatus, deleteStatus, getIssue, moveProjectItem, moveStatus, updateStatus,
} from '../issueOps';
import type { Issue, IssueData, Project } from '../types';
import ProjectColumn, { columnDndId } from './ProjectColumn';
import ProjectCard from './ProjectCard';

type Props = {
  project: Project;
  data: IssueData;
  onOpen: (num: number) => void;
  /** title creates a new issue; '#n' adds issue n */
  onAddItem: (statusId: string, text: string) => void;
};

/** Issues of each column, in order. */
export function boardColumns(project: Project, data: IssueData) {
  return project.statuses.map((status) => ({
    status,
    issues: project.items
      .filter((it) => it.status === status.id)
      .sort((a, b) => a.order - b.order)
      .map((it) => getIssue(data, it.issue))
      .filter(Boolean) as Issue[],
  }));
}

/**
 * Where a dragged card lands. Over a card: that card's column, at its index
 * (arrayMove semantics within a column). Over a column: at its end.
 */
export function dropTarget(
  project: Project, active: number, over: { type?: string; issue?: number; status?: string }
): { status: string; order: number } | undefined {
  if (!over.status) return undefined;
  const column = project.items.filter((it) => it.status === over.status).sort((a, b) => a.order - b.order);
  if (over.type === 'Card' && over.issue !== undefined) {
    const idx = column.findIndex((it) => it.issue === over.issue);
    return { status: over.status, order: idx < 0 ? column.length : idx };
  }
  return { status: over.status, order: column.filter((it) => it.issue !== active).length };
}

type DragData = { type?: string; issue?: number; status?: string } | undefined;

/** The op a drop results in: reorder columns, or move a card. */
export function dragEndOp(project: Project, a: DragData, o: DragData) {
  if (!a || !o) return undefined;
  if (a.type === 'Column' && a.status) {
    const from = a.status;
    const to = project.statuses.findIndex((s) => s.id === o.status);
    if (to < 0 || o.status === from) return undefined;
    return (d: IssueData) => moveStatus(d, project.id, from, to);
  }
  if (a.type === 'Card' && a.issue !== undefined) {
    const num = a.issue;
    if (o.type === 'Card' && o.issue === num) return undefined;
    const target = dropTarget(project, num, o);
    if (!target) return undefined;
    return (d: IssueData) => moveProjectItem(d, project.id, num, target.status, target.order);
  }
  return undefined;
}

export default function ProjectBoard({ project, data, onOpen, onAddItem }: Props) {
  const apply = useIssueStore((s) => s.apply);
  const [activeCard, setActiveCard] = useState<number | null>(null);
  const [activeColumn, setActiveColumn] = useState<string | null>(null);
  const columns = useMemo(() => boardColumns(project, data), [project, data]);
  const columnIds = useMemo(() => project.statuses.map((s) => columnDndId(s.id)), [project.statuses]);
  const candidates = useMemo(
    () => data.issues.filter((i) => !project.items.some((it) => it.issue === i.number)),
    [data.issues, project.items]
  );

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } })
  );

  const onDragStart = (e: DragStartEvent) => {
    const d = e.active.data.current;
    if (d?.type === 'Card') setActiveCard(d.issue);
    if (d?.type === 'Column') setActiveColumn(d.status);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveCard(null);
    setActiveColumn(null);
    const op = dragEndOp(project, e.active.data.current, e.over?.data.current);
    if (op) apply(op);
  };

  const overlayIssue = activeCard !== null ? getIssue(data, activeCard) : undefined;
  const overlayColumn = columns.find((c) => c.status.id === activeColumn);

  return (
    <div className="flex h-full gap-3 p-4 overflow-x-auto" data-testid="project-board">
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
          {columns.map(({ status, issues }) => (
            <ProjectColumn
              key={status.id}
              status={status}
              issues={issues}
              data={data}
              candidates={candidates}
              onOpen={onOpen}
              onRename={(name) => apply((d) => updateStatus(d, project.id, status.id, { name }))}
              onToggleCloses={() => apply((d) => updateStatus(d, project.id, status.id, { closes: !status.closes }))}
              onDelete={() => apply((d) => deleteStatus(d, project.id, status.id))}
              onAddItem={(text) => onAddItem(status.id, text)}
            />
          ))}
        </SortableContext>
        <div className="flex-shrink-0">
          <button
            type="button"
            className="flex items-center gap-1 px-3 py-2 text-sm text-gray-500 bg-gray-100 rounded hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
            onClick={() => {
              const name = window.prompt('Column name', `Column ${project.statuses.length + 1}`);
              if (name) apply((d) => addStatus(d, project.id, name));
            }}
          >
            <IconPlus size={14} /> Add column
          </button>
        </div>
        {createPortal(
          <DragOverlay>
            {overlayIssue ? <ProjectCard issue={overlayIssue} data={data} status="" overlay /> : null}
            {overlayColumn ? (
              <ProjectColumn
                status={overlayColumn.status}
                issues={overlayColumn.issues}
                data={data}
                candidates={[]}
                onOpen={() => undefined}
                onRename={() => undefined}
                onToggleCloses={() => undefined}
                onDelete={() => undefined}
                onAddItem={() => undefined}
                overlay
              />
            ) : null}
          </DragOverlay>,
          document.body
        )}
      </DndContext>
    </div>
  );
}
