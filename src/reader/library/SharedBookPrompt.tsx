import { useEffect, useState } from "react";
import { useStore } from "@/state/store";
import { useCurrentViewContext } from "@/state/useCurrentView";
import { BaseModal } from "@/ui/BaseModal";
import { Spinner } from "@/ui/ui";
import { importSharedBook, fileNameOf, sharedBookOf } from "./sharedBook";

/** The page without the book shared in its URL: not asked again on a reload */
function forgetLink() {
  const url = new URL(location.href);
  url.searchParams.delete("read");
  url.searchParams.delete("cfi");
  history.replaceState(history.state, "", url.href);
}

/**
 * The web app opened by the link of a shared book (see sharedBook.ts): asks
 * to download it into `reading/` of the workspace, then opens it at the
 * place shared. Once the workspace is open.
 */
export function SharedBookPrompt({
  search = location.search,
}: {
  search?: string;
}) {
  const [shared, setShared] = useState(() => sharedBookOf(search));
  const ws = useStore((state) => state.initDir);
  const { dispatch } = useCurrentViewContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (shared) forgetLink();
  }, [shared]);

  if (!shared || !ws) return null;
  const close = () => setShared(undefined);
  const open = async () => {
    setBusy(true);
    setError("");
    try {
      const path = await importSharedBook(ws, shared);
      close();
      dispatch({ view: "book", path, cfi: shared.cfi });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BaseModal title="Open a shared book?" isOpen handleClose={close}>
      <p className="text-sm">
        <span className="font-semibold break-all">
          {fileNameOf(shared.url)}
        </span>{" "}
        from {new URL(shared.url).host}
        {shared.cfi ? ", at the place shared" : ""}.
      </p>
      <p className="mt-1 text-xs text-base-content/60">
        It is downloaded into reading/ of this workspace, to read here.
      </p>
      {error ? <p className="mt-2 text-sm text-error">{error}</p> : null}
      <div className="flex justify-end gap-2 mt-4">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={close}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => void open()}
          disabled={busy}
        >
          {busy ? <Spinner size="sm" /> : null} Open
        </button>
      </div>
    </BaseModal>
  );
}
