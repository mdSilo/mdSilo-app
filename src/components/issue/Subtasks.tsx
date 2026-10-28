import { useState } from 'react';
import { TbTrash as IconTrash } from 'react-icons/tb';
import { useIssueStore } from './issueStore';
import { addSubtask, removeSubtask, subtaskProgress, updateSubtask } from './issueOps';
import { inputClass } from './common';
import type { Issue } from './types';

/** The sub-tasks of an issue: a checklist, done one by one. */
export default function Subtasks({ issue }: { issue: Issue }) {
  const apply = useIssueStore((s) => s.apply);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<{ id: string; text: string } | undefined>();
  const num = issue.number;
  const progress = subtaskProgress(issue);

  const add = () => {
    if (!text.trim()) return;
    apply((d) => addSubtask(d, num, text));
    setText('');
  };
  const saveEdit = () => {
    if (editing) apply((d) => updateSubtask(d, num, editing.id, { text: editing.text }));
    setEditing(undefined);
  };

  return (
    <div className="mt-4" data-testid="subtasks">
      <div className="flex items-center gap-2 mb-1 text-sm font-semibold text-base-content/70">
        Sub-tasks
        {progress ? (
          <>
            <progress className="w-24 progress progress-success" value={progress.done} max={progress.total} />
            <span className="font-normal">{progress.done}/{progress.total}</span>
          </>
        ) : null}
      </div>
      <ul className="space-y-1">
        {(issue.subtasks ?? []).map((task) => (
          <li key={task.id} className="flex items-center gap-2 group">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={task.done}
              aria-label={`Done: ${task.text}`}
              onChange={(e) => apply((d) => updateSubtask(d, num, task.id, { done: e.target.checked }))}
            />
            {editing?.id === task.id ? (
              <input
                className={`${inputClass} flex-1`}
                value={editing.text}
                autoFocus
                aria-label="Sub-task"
                onChange={(e) => setEditing({ id: task.id, text: e.target.value })}
                onBlur={saveEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit();
                  if (e.key === 'Escape') setEditing(undefined);
                }}
              />
            ) : (
              <button
                type="button"
                className={`flex-1 text-left text-sm ${task.done ? 'line-through text-base-content/50' : ''}`}
                onClick={() => setEditing({ id: task.id, text: task.text })}
              >
                {task.text}
              </button>
            )}
            <button
              type="button"
              className="opacity-0 text-base-content/50 hover:text-error group-hover:opacity-100 focus:opacity-100"
              aria-label={`Delete the sub-task ${task.text}`}
              onClick={() => apply((d) => removeSubtask(d, num, task.id))}
            >
              <IconTrash size={14} />
            </button>
          </li>
        ))}
      </ul>
      <input
        className={`${inputClass} w-full mt-1`}
        placeholder="Add a sub-task, Enter"
        aria-label="Add a sub-task"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') add();
        }}
      />
    </div>
  );
}
