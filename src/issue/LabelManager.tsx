import { useState } from 'react';
import { ConfirmModal } from '@/ui/Dialogs';
import { useIssueStore } from './issueStore';
import { createLabel, deleteLabel, updateLabel } from './issueOps';
import LabelChip, { ColorPicker, LABEL_COLORS } from './LabelChip';
import { btnClass, inputClass, primaryBtnClass } from './common';
import type { IssueData, Label } from './types';

type Draft = Omit<Label, 'id'>;

function LabelForm({ initial, submitText, onSubmit, onCancel }: {
  initial: Draft; submitText: string; onSubmit: (d: Draft) => void; onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  return (
    <div className="flex flex-col gap-2 p-3 bg-base-200 rounded-sm">
      <LabelChip label={{ id: 'preview', ...draft, name: draft.name || 'Label preview' }} className="self-start" />
      <div className="flex flex-wrap gap-2">
        <input
          aria-label="Label name"
          className={inputClass}
          placeholder="Label name"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <input
          aria-label="Label description"
          className={`${inputClass} flex-1`}
          placeholder="Description (optional)"
          value={draft.description ?? ''}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </div>
      <ColorPicker value={draft.color} onChange={(color) => setDraft({ ...draft, color })} />
      <div className="flex justify-end gap-2">
        <button type="button" className={btnClass} onClick={onCancel}>Cancel</button>
        <button type="button" className={primaryBtnClass} disabled={!draft.name.trim()} onClick={() => onSubmit(draft)}>
          {submitText}
        </button>
      </div>
    </div>
  );
}

export default function LabelManager({ data, onFilter }: { data: IssueData; onFilter?: (name: string) => void }) {
  const apply = useIssueStore((s) => s.apply);
  // color for the next new label, picked when opening the form
  const [creating, setCreating] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  // kept while the modal closes
  const [deleting, setDeleting] = useState<Label | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const counts = (id: string) => data.issues.filter((i) => i.state === 'open' && i.labels.includes(id)).length;

  return (
    <div className="p-4">
      <div className="flex justify-between mb-3">
        <span className="text-base-content/60">{data.labels.length} labels</span>
        <button type="button" className={primaryBtnClass} onClick={() => setCreating(LABEL_COLORS[Math.floor(Math.random() * LABEL_COLORS.length)])}>New label</button>
      </div>
      {creating ? (
        <LabelForm
          initial={{ name: '', color: creating, description: '' }}
          submitText="Create label"
          onCancel={() => setCreating(null)}
          onSubmit={(d) => { apply((x) => createLabel(x, d)); setCreating(null); }}
        />
      ) : null}
      <ul className="mt-2 border border-base-300 rounded-sm">
        {data.labels.map((label) => (
          <li key={label.id} className="px-3 py-2 border-b border-base-300 last:border-b-0">
            {editing === label.id ? (
              <LabelForm
                initial={label}
                submitText="Save changes"
                onCancel={() => setEditing(null)}
                onSubmit={(d) => { apply((x) => updateLabel(x, label.id, d)); setEditing(null); }}
              />
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-40"><LabelChip label={label} onClick={onFilter ? () => onFilter(label.name) : undefined} /></div>
                <span className="flex-1 text-sm text-base-content/60">{label.description}</span>
                <span className="text-xs text-base-content/60">{counts(label.id)} open</span>
                <button type="button" className="text-sm ms-link" onClick={() => setEditing(label.id)}>Edit</button>
                <button
                  type="button"
                  className="text-sm text-error hover:underline"
                  onClick={() => { setConfirmOpen(true); setDeleting(label); }}
                >
                  Delete
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <ConfirmModal
        title={`Delete label "${deleting?.name ?? ''}"?`}
        message="It will be removed from all issues."
        confirmLabel="Confirm delete"
        danger
        isOpen={confirmOpen}
        onConfirm={() => { if (deleting) apply((x) => deleteLabel(x, deleting.id)); }}
        handleClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}
