import { useMemo, useState } from 'react';
import { TbArrowsSort as IconSort } from 'react-icons/tb';
import { useIssueStore } from '../issueStore';
import { moveProjectItem, removeProjectItem } from '../issueOps';
import { filterIssues } from '../filter';
import { StateIcon, TimeAgo, inputClass } from '../common';
import LabelChip from '../LabelChip';
import type { Issue, IssueData, Project } from '../types';

type Col = 'number' | 'title' | 'status' | 'labels' | 'milestone' | 'updated';
const COLS: { key: Col; name: string }[] = [
  { key: 'number', name: '#' },
  { key: 'title', name: 'Title' },
  { key: 'status', name: 'Status' },
  { key: 'labels', name: 'Labels' },
  { key: 'milestone', name: 'Milestone' },
  { key: 'updated', name: 'Updated' },
];

type Row = { issue: Issue; status: string; statusIdx: number; milestone: string };

type Props = { project: Project; data: IssueData; onOpen: (num: number) => void };

export default function ProjectTable({ project, data, onOpen }: Props) {
  const apply = useIssueStore((s) => s.apply);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: Col; asc: boolean }>({ key: 'status', asc: true });

  const rows = useMemo(() => {
    const inProject = new Map(project.items.map((it) => [it.issue, it]));
    const issues = filterIssues(
      { ...data, issues: data.issues.filter((i) => inProject.has(i.number)) },
      query
    );
    const out: Row[] = issues.map((issue) => {
      const status = inProject.get(issue.number)?.status ?? '';
      return {
        issue,
        status,
        statusIdx: project.statuses.findIndex((s) => s.id === status),
        milestone: data.milestones.find((m) => m.id === issue.milestone)?.title ?? '',
      };
    });
    const labelNames = (i: Issue) => data.labels.filter((l) => i.labels.includes(l.id)).map((l) => l.name).join(',');
    const keyOf = (r: Row): string | number => {
      switch (sort.key) {
        case 'number': return r.issue.number;
        case 'title': return r.issue.title.toLowerCase();
        case 'status': return r.statusIdx * 1e9 + (inProject.get(r.issue.number)?.order ?? 0);
        case 'labels': return labelNames(r.issue);
        case 'milestone': return r.milestone.toLowerCase();
        default: return r.issue.updatedAt;
      }
    };
    const sign = sort.asc ? 1 : -1;
    return out.sort((a, b) => {
      const [x, y] = [keyOf(a), keyOf(b)];
      return sign * (x < y ? -1 : x > y ? 1 : 0) || a.issue.number - b.issue.number;
    });
  }, [project, data, query, sort]);

  return (
    <div className="p-4" data-testid="project-table">
      <input
        aria-label="Filter items"
        className={`${inputClass} w-full mb-3`}
        placeholder="Filter: is:open label:bug …"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-gray-200 dark:border-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              {COLS.map((c) => (
                <th key={c.key} className="px-2 py-1 text-left">
                  <button
                    type="button"
                    className="flex items-center gap-1 font-semibold"
                    onClick={() => setSort({ key: c.key, asc: sort.key === c.key ? !sort.asc : true })}
                  >
                    {c.name}
                    <IconSort size={12} className={sort.key === c.key ? 'text-primary-500' : 'text-gray-400'} />
                  </button>
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="p-4 text-center text-gray-500">No items.</td></tr>
            ) : rows.map(({ issue, status, milestone }) => (
              <tr key={issue.number} className="border-t border-gray-200 dark:border-gray-700" data-testid="project-row">
                <td className="px-2 py-1 text-gray-500 whitespace-nowrap">
                  <span className="flex items-center gap-1"><StateIcon state={issue.state} size={14} />{issue.number}</span>
                </td>
                <td className="px-2 py-1">
                  <button type="button" className="text-left hover:text-primary-500" onClick={() => onOpen(issue.number)}>
                    {issue.title}
                  </button>
                </td>
                <td className="px-2 py-1">
                  <select
                    aria-label={`Status of #${issue.number}`}
                    className="py-0 pl-1 text-sm border-gray-300 rounded dark:bg-gray-800 dark:border-gray-600"
                    value={status}
                    onChange={(e) => {
                      const sid = e.target.value;
                      const order = project.items.filter((it) => it.status === sid).length;
                      apply((d) => moveProjectItem(d, project.id, issue.number, sid, order));
                    }}
                  >
                    {project.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1">
                  <div className="flex flex-wrap gap-1">
                    {data.labels.filter((l) => issue.labels.includes(l.id)).map((l) => <LabelChip key={l.id} label={l} />)}
                  </div>
                </td>
                <td className="px-2 py-1 text-gray-500">{milestone}</td>
                <td className="px-2 py-1 text-gray-500 whitespace-nowrap"><TimeAgo iso={issue.updatedAt} /></td>
                <td className="px-2 py-1">
                  <button
                    type="button"
                    aria-label={`Remove #${issue.number} from project`}
                    className="text-xs text-gray-400 hover:text-red-600"
                    onClick={() => apply((d) => removeProjectItem(d, project.id, issue.number))}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
