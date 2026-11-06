import { useState, type ReactNode } from "react";
import { BaseModal } from "@/ui/BaseModal";
import {
  renamePath,
  splitName,
  type RenameOptions,
} from "@/workspace/renamePath";

type Props = {
  path: string;
  title: string;
  /** the extension stays: only the name before it is edited */
  keepExt?: boolean;
  /** what else is renamed, or stays, with it */
  hint?: ReactNode;
  options?: Omit<RenameOptions, "ext">;
  isOpen: boolean;
  handleClose: () => void;
};

/** Rename a file or dir of the sidebar tree in its dir. */
export default function RenameModal(props: Props) {
  const { path, title, keepExt = false, hint, options, isOpen } = props;
  const { handleClose } = props;
  const [{ name: oldName, ext }] = useState(() => splitName(path, keepExt));
  const [name, setName] = useState(oldName);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onRename = async () => {
    setBusy(true);
    const err = await renamePath(path, name, { ...options, ext }).catch(
      (e: unknown) => {
        console.error(`Failed to rename ${path}`, e);
        return "Failed to rename";
      },
    );
    setBusy(false);
    if (err) setError(err);
    else handleClose();
  };

  return (
    <BaseModal title={title} isOpen={isOpen} handleClose={handleClose}>
      <form
        className="flex flex-col justify-center px-6"
        onSubmit={(e) => {
          e.preventDefault();
          void onRename();
        }}
      >
        <p className="text-sm text-center break-all">{path}</p>
        <div className="flex items-center mx-4 my-2">
          <input
            type="text"
            className="block flex-1 min-w-0 py-1 bg-base-200 border-base-300 rounded-sm"
            placeholder="New name"
            aria-label="New name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
            onFocus={(e) => e.target.select()}
            autoFocus
          />
          {ext ? (
            <span className="ml-1 text-sm text-base-content/70">{ext}</span>
          ) : null}
        </div>
        {error ? <p className="mx-4 text-xs text-error">{error}</p> : null}
        {hint ? (
          <p className="mx-4 mt-2 text-xs text-base-content/70">{hint}</p>
        ) : null}
        <button
          type="submit"
          className="mt-4 font-bold pop-btn"
          disabled={busy}
        >
          Rename
        </button>
      </form>
    </BaseModal>
  );
}
