import { useState } from 'react';
import { ConfirmModal } from '@/ui/Dialogs';
import { useIssueStore } from './issueStore';
import { createMilestone, deleteMilestone, milestoneProgress, updateMilestone } from './issueOps';
import { btnClass, inputClass, primaryBtnClass } from './common';
import type { IssueData, IssueState, Milestone } from './types';

type Draft = { title: string; description?: string; dueOn?: string };

function MilestoneForm({ initial, submitText, onSubmit, onCancel }: {
  initial: Draft; submitText: string; onSubmit: (d: Draft) => void; onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  return (
    <div className="flex flex-col gap-2 p-3 bg-base-200 rounded-sm">
      <div className="flex flex-wrap gap-2">
        <input
          aria-label="Milestone title"
          className={`${inputClass} flex-1`}
          placeholder="Title"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
        <input
          aria-label="Due date"
          type="date"
          className={inputClass}
          value={draft.dueOn ?? ''}
          onChange={(e) => setDraft({ ...draft, dueOn: e.target.value })}
        />
      </div>
      <textarea
        aria-label="Milestone description"
        className={inputClass}
        placeholder="Description (optional)"
        value={draft.description ?? ''}
        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
      />
      <div className="flex justify-end gap-2">
        <button type="button" className={btnClass} onClick={onCancel}>Cancel</button>
        <button type="button" className={primaryBtnClass} disabled={!draft.title.trim()} onClick={() => onSubmit(draft)}>
          {submitText}
        </button>
      </div>
    </div>
  );
}

const isOverdue = (m: Milestone) =>
  m.state === 'open' && !!m.dueOn && new Date(`${m.dueOn}T23:59:59`).getTime() < Date.now();

export default function MilestoneManager({ data, onFilter }: { data: IssueData; onFilter?: (title: string) => void }) {
  const apply = useIssueStore((s) => s.apply);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [tab, setTab] = useState<IssueState>('open');
  // kept while the modal closes
  const [deleting, setDeleting] = useState<Milestone | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const shown = data.milestones.filter((m) => m.state === tab);
  const count = (s: IssueState) => data.milestones.filter((m) => m.state === s).length;

  return (
    <div className="p-4">
      <div className="flex justify-between mb-3">
        <div className="flex gap-3">
          {(['open', 'closed'] as IssueState[]).map((s) => (
            <button
              type="button"
              key={s}
              className={tab === s ? 'font-semibold' : 'text-base-content/60'}
              onClick={() => setTab(s)}
            >
              {count(s)} {s === 'open' ? 'Open' : 'Closed'}
            </button>
          ))}
        </div>
        <button type="button" className={primaryBtnClass} onClick={() => setCreating(true)}>New milestone</button>
      </div>
      {creating ? (
        <MilestoneForm
          initial={{ title: '' }}
          submitText="Create milestone"
          onCancel={() => setCreating(false)}
          onSubmit={(d) => { apply((x) => createMilestone(x, d)); setCreating(false); }}
        />
      ) : null}
      <ul className="mt-2 border border-base-300 rounded-sm">
        {shown.length === 0 ? <li className="p-4 text-center text-base-content/60">No {tab} milestones.</li> : null}
        {shown.map((m) => {
          const p = milestoneProgress(data, m.id);
          return (
            <li key={m.id} className="px-3 py-3 border-b border-base-300 last:border-b-0" data-testid="milestone-row">
              {editing === m.id ? (
                <MilestoneForm
                  initial={m}
                  submitText="Save changes"
                  onCancel={() => setEditing(null)}
                  onSubmit={(d) => { apply((x) => updateMilestone(x, m.id, d)); setEditing(null); }}
                />
              ) : (
                <div className="flex flex-col gap-2 md:flex-row">
                  <div className="flex-1">
                    <button type="button" className="text-lg font-semibold hover:text-primary/75" onClick={() => onFilter?.(m.title)}>
                      {m.title}
                    </button>
                    <div className={`text-xs ${isOverdue(m) ? 'text-error' : 'text-base-content/60'}`}>
                      {m.dueOn ? `${isOverdue(m) ? 'Past due by' : 'Due by'} ${m.dueOn}` : 'No due date'}
                    </div>
                    {m.description ? <p className="mt-1 text-sm text-base-content/70">{m.description}</p> : null}
                  </div>
                  <div className="w-full md:w-72">
                    <div
                      className="h-2 bg-base-300 rounded-sm"
                      role="progressbar"
                      aria-valuenow={p.percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div className="h-2 bg-success rounded-sm" style={{ width: `${p.percent}%` }} />
                    </div>
                    <div className="flex gap-3 mt-1 text-xs text-base-content/60">
                      <span>{p.percent}% complete</span><span>{p.open} open</span><span>{p.closed} closed</span>
                    </div>
                    <div className="flex gap-3 mt-1 text-sm">
                      <button type="button" className="ms-link" onClick={() => setEditing(m.id)}>Edit</button>
                      <button
                        type="button"
                        className="ms-link"
                        onClick={() => apply((x) => updateMilestone(x, m.id, { state: m.state === 'open' ? 'closed' : 'open' }))}
                      >
                        {m.state === 'open' ? 'Close' : 'Reopen'}
                      </button>
                      <button
                        type="button"
                        className="text-error hover:underline"
                        onClick={() => { setConfirmOpen(true); setDeleting(m); }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <ConfirmModal
        title={`Delete milestone "${deleting?.title ?? ''}"?`}
        message="Its issues are kept."
        confirmLabel="Confirm delete"
        danger
        isOpen={confirmOpen}
        onConfirm={() => { if (deleting) apply((x) => deleteMilestone(x, deleting.id)); }}
        handleClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}
