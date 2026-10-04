import { TbCheck as IconCheck } from 'react-icons/tb';
import { useIssueStore } from '../issueStore';
import { addLabel, removeLabel } from '../issueOps';
import LabelChip from '../LabelChip';
import type { Issue, Label } from '../types';
import Picker, { menuItemClass } from './Picker';

export default function LabelPicker({ issue, labels }: { issue: Issue; labels: Label[] }) {
  const apply = useIssueStore((s) => s.apply);
  const current = labels.filter((l) => issue.labels.includes(l.id));
  return (
    <Picker
      title="Labels"
      summary={
        current.length ? (
          <div className="flex flex-wrap gap-1">
            {current.map((l) => (
              <LabelChip key={l.id} label={l} onRemove={() => apply((d) => removeLabel(d, issue.number, l.id))} />
            ))}
          </div>
        ) : (<span className="text-gray-500">None yet</span>)
      }
    >
      {() => (
        labels.length === 0 ? (
          <p className="px-3 py-2 text-sm text-gray-500">No labels. Create some in Issues &gt; Labels.</p>
        ) : labels.map((l) => {
          const checked = issue.labels.includes(l.id);
          return (
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={checked}
              key={l.id}
              className={menuItemClass}
              onClick={() => apply((d) => (checked ? removeLabel : addLabel)(d, issue.number, l.id))}
            >
              <span className="w-4">{checked ? <IconCheck size={14} /> : null}</span>
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: l.color }} />
              <span className="flex-1">{l.name}</span>
            </button>
          );
        })
      )}
    </Picker>
  );
}
