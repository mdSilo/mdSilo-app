import { useState } from 'react';
import { BaseModal } from '@/components/settings/BaseModal';
import { normalizeGroup, renameGroup } from '../../library';

type Props = {
  ws: string;
  /** the full path of the group, e.g. Fiction/Classics */
  group: string;
  onClose: () => void;
  /** the group renamed: its new path, '' if ungrouped */
  onDone: (renamed: string) => void;
};

/** A group of the library renamed or moved (by its path), or ungrouped. */
export default function GroupDialog({ ws, group, onClose, onDone }: Props) {
  const [name, setName] = useState(group);
  const parent = group.includes('/') ? group.slice(0, group.lastIndexOf('/')) : '';
  const apply = async (to: string) => {
    await renameGroup(ws, group, to);
    onDone(normalizeGroup(to) || parent);
  };
  return (
    <BaseModal title="Group" isOpen handleClose={onClose} panelClassName="max-w-md">
      <form
        className="flex flex-col gap-3 text-left"
        onSubmit={async (e) => {
          e.preventDefault();
          if (normalizeGroup(name) && normalizeGroup(name) !== group) await apply(name);
          else onClose();
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Name</span>
          <input
            className="input input-sm w-full"
            value={name}
            aria-label="Group name"
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <span className="text-xs text-base-content/60">Nested by /, e.g. Fiction/Classics; its sub groups go with it.</span>
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn btn-sm btn-ghost me-auto"
            title={`The books go to ${parent || 'no group'}`}
            onClick={() => apply('')}
          >
            Ungroup
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-sm btn-primary">Rename</button>
        </div>
      </form>
    </BaseModal>
  );
}
