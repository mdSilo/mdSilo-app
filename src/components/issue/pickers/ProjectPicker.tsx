import { TbCheck as IconCheck } from 'react-icons/tb';
import { useCurrentViewContext } from 'context/useCurrentView';
import { useIssueStore } from '../issueStore';
import { addProjectItem, issueProjects, moveProjectItem, removeProjectItem } from '../issueOps';
import type { Issue, IssueData } from '../types';
import Picker, { menuItemClass } from './Picker';

/** Add the issue to projects and pick its status in each. */
export default function ProjectPicker({ issue, data }: { issue: Issue; data: IssueData }) {
  const apply = useIssueStore((s) => s.apply);
  const { dispatch } = useCurrentViewContext();
  const inProjects = issueProjects(data, issue.number);
  return (
    <Picker
      title="Projects"
      summary={
        inProjects.length ? (
          <ul className="space-y-1">
            {inProjects.map(({ project, status }) => (
              <li key={project.id} className="flex items-center gap-1">
                <button
                  type="button"
                  className="link truncate"
                  onClick={() => dispatch({ view: 'project', projectId: project.id })}
                >
                  {project.title}
                </button>
                <select
                  aria-label={`Status in ${project.title}`}
                  className="flex-1 py-0 pl-1 text-xs border-gray-300 rounded dark:bg-gray-800 dark:border-gray-600"
                  value={status?.id ?? ''}
                  onChange={(e) => {
                    const sid = e.target.value;
                    const order = project.items.filter((it) => it.status === sid).length;
                    apply((d) => moveProjectItem(d, project.id, issue.number, sid, order));
                  }}
                >
                  {project.statuses.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        ) : (<span className="text-gray-500">None yet</span>)
      }
    >
      {() => (
        data.projects.length === 0 ? (
          <p className="px-3 py-2 text-sm text-gray-500">No projects.</p>
        ) : data.projects.map((p) => {
          const checked = inProjects.some((x) => x.project.id === p.id);
          return (
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={checked}
              key={p.id}
              className={menuItemClass}
              onClick={() => apply((d) => (
                checked ? removeProjectItem(d, p.id, issue.number) : addProjectItem(d, p.id, issue.number)
              ))}
            >
              <span className="w-4">{checked ? <IconCheck size={14} /> : null}</span>
              <span className="flex-1">{p.title}</span>
            </button>
          );
        })
      )}
    </Picker>
  );
}
