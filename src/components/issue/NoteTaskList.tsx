import { useEffect, useMemo, useState } from 'react';
import { useStore } from 'lib/store';
import { loadDir } from 'file/open';
import { useCurrentViewContext } from 'context/useCurrentView';
import useDebounce from 'editor/hooks/useDebounce';
import useOnNoteLinkClick from 'editor/hooks/useOnNoteLinkClick';
import { useIssueStore } from './issueStore';
import { computeNoteTasks, createIssueFromTask, issueOfTask, NoteTask, TaskTag, TASK_TAGS } from './noteTasks';
import { StateIcon, btnClass } from './common';
import type { IssueData } from './types';

const TAG_CLASS: Record<TaskTag, string> = {
  todo: 'bg-info/15 text-info',
  doing: 'bg-error/15 text-error',
  done: 'bg-success/15 text-success',
};

type Filter = 'all' | TaskTag;

/**
 * Tasks written in notes as #todo#, #doing# or #done#. Each one links to its
 * note and can be turned into an issue linked to that note.
 */
export default function NoteTaskList({ data }: { data: IssueData }) {
  const isLoaded = useStore((state) => state.isLoaded);
  const initDir = useStore((state) => state.initDir);
  useEffect(() => {
    if (!isLoaded && initDir) {
      void loadDir(initDir);
    }
  }, [initDir, isLoaded]);

  const [notes] = useDebounce(useStore((state) => state.notes), 300);
  const tasks = useMemo(() => computeNoteTasks(notes), [notes]);
  const apply = useIssueStore((s) => s.apply);
  const { dispatch } = useCurrentViewContext();
  const { onClick: openNote } = useOnNoteLinkClick();
  const [filter, setFilter] = useState<Filter>('all');
  const [withoutIssue, setWithoutIssue] = useState(false);

  const shown = tasks.filter(
    (t) => (filter === 'all' || t.tag === filter) && (!withoutIssue || !issueOfTask(data.issues, t))
  );
  const toConvert = shown.filter((t) => !issueOfTask(data.issues, t));
  const count = (f: Filter) => tasks.filter((t) => f === 'all' || t.tag === f).length;

  const convertAll = (list: NoteTask[]) =>
    apply((d) => list.reduce((acc, t) => createIssueFromTask(acc, t), d));

  return (
    <div data-testid="note-tasks">
      <p className="mb-3 text-sm text-base-content/60">
        Tasks written in notes with <code>#todo#</code>, <code>#doing#</code>, <code>#done#</code> or as
        checkboxes (<code>- [ ]</code>, <code>- [x]</code>). Create an issue from a task to track it here:
        the issue links back to its note and follows the task when it changes or is removed.
      </p>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {(['all', ...TASK_TAGS] as Filter[]).map((f) => (
          <button
            type="button"
            key={f}
            aria-pressed={filter === f}
            className={`px-2 py-1 text-sm rounded-sm ${filter === f ? 'bg-base-300 font-semibold' : 'hover:bg-base-content/5'}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f[0].toUpperCase() + f.slice(1)} <span className="text-xs text-base-content/60">{count(f)}</span>
          </button>
        ))}
        <label className="flex items-center gap-1 ml-2 text-sm">
          <input type="checkbox" checked={withoutIssue} onChange={(e) => setWithoutIssue(e.target.checked)} />
          Without issue only
        </label>
        <span className="flex-1" />
        <button type="button" className={btnClass} disabled={toConvert.length === 0} onClick={() => convertAll(toConvert)}>
          Create issues for {toConvert.length} task{toConvert.length === 1 ? '' : 's'}
        </button>
      </div>
      {shown.length === 0 ? (
        <p className="p-8 text-center text-base-content/60">No tasks in notes.</p>
      ) : (
        <ul className="border border-base-300 rounded-sm">
          {shown.map((task) => {
            const issue = issueOfTask(data.issues, task);
            return (
              <li
                key={task.id}
                className="flex items-center gap-2 px-3 py-2 border-b border-base-300 last:border-b-0"
                data-testid="note-task"
              >
                <span className={`px-2 text-xs rounded-full whitespace-nowrap ${TAG_CLASS[task.tag]}`}>
                  {task.kind === 'checkbox' ? (task.tag === 'done' ? '[x]' : '[ ]') : `#${task.tag}`}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="wrap-break-word">{task.text || <i className="text-base-content/60">(no text)</i>}</div>
                  <button type="button" className="text-xs ms-link" title={task.noteId} onClick={() => openNote(task.noteId)}>
                    {task.noteTitle}
                  </button>
                </div>
                {issue ? (
                  <button
                    type="button"
                    className="flex items-center gap-1 text-sm hover:text-primary/75"
                    onClick={() => dispatch({ view: 'issue', number: issue.number })}
                  >
                    <StateIcon state={issue.state} size={16} />#{issue.number}
                  </button>
                ) : (
                  <button type="button" className={btnClass} onClick={() => apply((d) => createIssueFromTask(d, task))}>
                    Create issue
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
