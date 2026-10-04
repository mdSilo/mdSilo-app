import { useState } from 'react';
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
    <div className="flex flex-col gap-2 p-3 bg-gray-50 rounded dark:bg-gray-800">
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
  const counts = (id: string) => data.issues.filter((i) => i.state === 'open' && i.labels.includes(id)).length;

  return (
    <div className="p-4">
      <div className="flex justify-between mb-3">
        <span className="text-gray-500">{data.labels.length} labels</span>
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
      <ul className="mt-2 border border-gray-200 rounded dark:border-gray-700">
        {data.labels.map((label) => (
          <li key={label.id} className="px-3 py-2 border-b border-gray-200 last:border-b-0 dark:border-gray-700">
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
                <span className="flex-1 text-sm text-gray-500">{label.description}</span>
                <span className="text-xs text-gray-500">{counts(label.id)} open</span>
                <button type="button" className="text-sm link" onClick={() => setEditing(label.id)}>Edit</button>
                <button
                  type="button"
                  className="text-sm text-red-600 hover:underline"
                  onClick={() => {
                    if (window.confirm(`Delete label "${label.name}"? It will be removed from all issues.`)) {
                      apply((x) => deleteLabel(x, label.id));
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
