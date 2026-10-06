import { useMemo, useState } from 'react';
import { TbTag as IconTag, TbFlag as IconFlag, TbCircleDot as IconIssue, TbCheckbox as IconTasks } from 'react-icons/tb';
import ErrorBoundary from 'components/misc/ErrorBoundary';
import { useCurrentViewContext } from 'context/useCurrentView';
import { useIssueData, useIssueStore } from 'components/issue/issueStore';
import { filterIssues, parseQuery, stringifyQuery, SORT_KEYS, IssueQuery } from 'components/issue/filter';
import IssueList from 'components/issue/IssueList';
import IssueEditor from 'components/issue/IssueEditor';
import IssueDetail from 'components/issue/IssueDetail';
import LabelManager from 'components/issue/LabelManager';
import MilestoneManager from 'components/issue/MilestoneManager';
import NoteTaskList from 'components/issue/NoteTaskList';
import { StateIcon, btnClass, inputClass, primaryBtnClass } from 'components/issue/common';
import type { IssueState } from 'components/issue/types';

import type { IssuesTab as Tab } from 'context/viewReducer';

const selectClass =
  'py-1 pl-2 pr-8 text-sm bg-transparent border-gray-300 rounded dark:border-gray-600 dark:bg-gray-800';

export default function Issues() {
  const { data, isLoaded, initDir } = useIssueData();
  const createIssue = useIssueStore((s) => s.createIssue);
  const { state, dispatch } = useCurrentViewContext();
  // the tab lives in the view state, so other views and hotkeys can open a tab
  const tab: Tab = state.issuesTab ?? 'issues';
  const setTab = (t: Tab) => dispatch({ view: 'issues', tab: t });
  const [query, setQuery] = useState('is:open ');
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');

  const parsed = useMemo(() => parseQuery(query), [query]);
  const issues = useMemo(() => filterIssues(data, parsed), [data, parsed]);
  const counts = useMemo(() => {
    const all = filterIssues(data, parsed, true);
    return { open: all.filter((i) => i.state === 'open').length, closed: all.filter((i) => i.state === 'closed').length };
  }, [data, parsed]);

  const update = (patch: Partial<IssueQuery>) => setQuery(`${stringifyQuery({ ...parsed, ...patch })} `);
  const toggleLabel = (name: string) => update({
    labels: parsed.labels.includes(name) ? parsed.labels.filter((l) => l !== name) : [...parsed.labels, name],
  });
  const filterMilestone = (title: string) => {
    setTab('issues');
    update({ milestone: title, noMilestone: false });
  };

  const submitNew = () => {
    if (!newTitle.trim()) return;
    const num = createIssue({ title: newTitle, body: newBody });
    setNewTitle('');
    setNewBody('');
    setCreating(false);
    dispatch({ view: 'issue', number: num });
  };

  if (!initDir) {
    return <p className="p-8 text-gray-500">Open a folder to track issues.</p>;
  }

  const tabClass = (t: Tab) =>
    `flex items-center gap-1 px-3 py-1 rounded ${tab === t ? 'bg-gray-200 dark:bg-gray-700 font-semibold' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`;

  return (
    <ErrorBoundary>
      <div className="flex flex-col w-full h-full overflow-y-auto bg-white dark:bg-black dark:text-gray-200">
        <div className="w-full max-w-5xl px-6 py-4 mx-auto">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <button type="button" className={tabClass('issues')} onClick={() => setTab('issues')}>
              <IconIssue size={16} /> Issues
            </button>
            <button type="button" className={tabClass('tasks')} onClick={() => setTab('tasks')}>
              <IconTasks size={16} /> Tasks
            </button>
            <button type="button" className={tabClass('labels')} onClick={() => setTab('labels')}>
              <IconTag size={16} /> Labels <span className="text-xs text-gray-500">{data.labels.length}</span>
            </button>
            <button type="button" className={tabClass('milestones')} onClick={() => setTab('milestones')}>
              <IconFlag size={16} /> Milestones <span className="text-xs text-gray-500">{data.milestones.length}</span>
            </button>
            <span className="flex-1" />
            <button type="button" className={btnClass} onClick={() => dispatch({ view: 'project' })}>Projects</button>
            <button type="button" className={primaryBtnClass} onClick={() => { setTab('issues'); setCreating(true); }}>
              New issue
            </button>
          </div>

          {!isLoaded ? (
            <p className="text-gray-500">Loading issues…</p>
          ) : tab === 'tasks' ? (
            <NoteTaskList data={data} />
          ) : tab === 'labels' ? (
            <LabelManager data={data} onFilter={(name) => { setTab('issues'); update({ labels: [name] }); }} />
          ) : tab === 'milestones' ? (
            <MilestoneManager data={data} onFilter={filterMilestone} />
          ) : (
            <>
              {creating ? (
                <div className="p-3 mb-4 border border-gray-200 rounded dark:border-gray-700" data-testid="new-issue-form">
                  <input
                    aria-label="New issue title"
                    className={`${inputClass} w-full mb-2 text-lg`}
                    placeholder="Title"
                    value={newTitle}
                    autoFocus
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submitNew(); }}
                  />
                  <div className="px-2 py-1 border border-gray-200 rounded min-h-[6rem] dark:border-gray-700">
                    <IssueEditor defaultValue="" placeholder="Add a description… [[Note]] links a note" onChange={setNewBody} />
                  </div>
                  <div className="flex justify-end gap-2 mt-2">
                    <button type="button" className={btnClass} onClick={() => setCreating(false)}>Cancel</button>
                    <button type="button" className={primaryBtnClass} disabled={!newTitle.trim()} onClick={submitNew}>
                      Submit new issue
                    </button>
                  </div>
                </div>
              ) : null}

              <input
                aria-label="Filter issues"
                className={`${inputClass} w-full mb-3`}
                placeholder='is:open label:bug milestone:"v1" no:milestone sort:updated-desc'
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />

              <div className="border border-gray-200 rounded dark:border-gray-700">
                <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-gray-50 dark:bg-gray-800">
                  {(['open', 'closed'] as IssueState[]).map((s) => (
                    <button
                      type="button"
                      key={s}
                      aria-pressed={parsed.state === s}
                      className={`flex items-center gap-1 text-sm ${parsed.state === s ? 'font-semibold' : 'text-gray-500'}`}
                      onClick={() => update({ state: parsed.state === s ? undefined : s })}
                    >
                      <StateIcon state={s} size={16} />
                      {counts[s]} {s === 'open' ? 'Open' : 'Closed'}
                    </button>
                  ))}
                  <span className="flex-1" />
                  <select
                    aria-label="Filter by label"
                    className={selectClass}
                    value=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '__none') update({ noLabel: !parsed.noLabel, labels: [] });
                      else if (v) toggleLabel(v);
                    }}
                  >
                    <option value="">Labels</option>
                    <option value="__none">{parsed.noLabel ? '✓ ' : ''}Unlabeled</option>
                    {data.labels.map((l) => (
                      <option key={l.id} value={l.name}>{parsed.labels.includes(l.name) ? '✓ ' : ''}{l.name}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter by milestone"
                    className={selectClass}
                    value=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '__none') update({ noMilestone: true, milestone: undefined });
                      else if (v === '__any') update({ noMilestone: false, milestone: undefined });
                      else if (v) update({ milestone: v, noMilestone: false });
                    }}
                  >
                    <option value="">Milestones</option>
                    <option value="__any">Any milestone</option>
                    <option value="__none">No milestone</option>
                    {data.milestones.map((m) => (
                      <option key={m.id} value={m.title}>{parsed.milestone === m.title ? '✓ ' : ''}{m.title}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Sort issues"
                    className={selectClass}
                    value={`${parsed.sort.key}-${parsed.sort.dir}`}
                    onChange={(e) => {
                      const [key, dir] = e.target.value.split('-');
                      update({ sort: { key, dir } as IssueQuery['sort'] });
                    }}
                  >
                    {SORT_KEYS.flatMap((k) => (['desc', 'asc'] as const).map((d) => (
                      <option key={`${k}-${d}`} value={`${k}-${d}`}>
                        {k[0].toUpperCase() + k.slice(1)} {d === 'desc' ? '↓' : '↑'}
                      </option>
                    )))}
                  </select>
                </div>
                <IssueList
                  issues={issues}
                  data={data}
                  onOpen={(num) => dispatch({ view: 'issue', number: num })}
                  onClickLabel={(l) => toggleLabel(l.name)}
                  onClickMilestone={filterMilestone}
                  empty={data.issues.length === 0 ? 'No issues yet. Create one with "New issue".' : 'No issues match this filter.'}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}

export function IssuePage() {
  const { state } = useCurrentViewContext();
  return <IssueDetail key={state.issueNumber} number={state.issueNumber ?? 0} />;
}
