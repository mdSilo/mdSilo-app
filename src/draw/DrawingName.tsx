import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n";
import { renamePath } from "@/workspace/renamePath";
import { DRAWING_EXT, drawingName } from "./drawing";
import { drawingRenameOptions } from "./rename";

/**
 * The name of a drawing, in the bar of its canvas: click to rename it (its
 * picture with it, see rename.ts). Enter or leaving the field renames,
 * Escape keeps the name.
 */
export default function DrawingName({ path }: { path: string }) {
  const t = useT();
  const name = drawingName(path);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // renamed, here or elsewhere: the new name
  useEffect(() => {
    setDraft(name);
    setError("");
  }, [name]);
  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const rename = async () => {
    if (busy) return;
    const to = draft.trim();
    if (!to || to === name) {
      setDraft(name);
      setEditing(false);
      setError("");
      return;
    }
    setBusy(true);
    const err = await renamePath(path, to, {
      ...drawingRenameOptions(path),
      ext: DRAWING_EXT,
    }).catch((e: unknown) => {
      console.error(`Failed to rename ${path}`, e);
      return t("Failed to rename");
    });
    setBusy(false);
    if (err) {
      setError(err);
      input.current?.focus();
    } else {
      setEditing(false);
      setError("");
    }
  };

  if (!editing) {
    return (
      <button
        className="flex-1 min-w-0 px-1 overflow-hidden text-sm text-left rounded-sm text-ellipsis whitespace-nowrap hover:bg-base-content/10"
        title={t("Rename the drawing")}
        onClick={() => setEditing(true)}
      >
        {name}
      </button>
    );
  }
  return (
    <span className="flex items-center flex-1 min-w-0 gap-2">
      <input
        ref={input}
        className="flex-1 min-w-0 px-1 py-0 text-sm rounded-sm input input-xs"
        aria-label={t("Rename the drawing")}
        value={draft}
        disabled={busy}
        onChange={(e) => {
          setDraft(e.target.value);
          setError("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") void rename();
          else if (e.key === "Escape") {
            setDraft(name);
            setError("");
            setEditing(false);
          }
        }}
        onBlur={() => void rename()}
      />
      {error ? (
        <span className="text-xs truncate text-error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
