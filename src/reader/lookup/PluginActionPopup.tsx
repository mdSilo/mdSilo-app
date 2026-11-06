import { memo, useEffect, useState, type RefObject } from "react";
import { TbNote, TbX } from "react-icons/tb";
import { useStore } from "@/state/store";
import { useTrustedVersion } from "@/plugins/trusted";
import { bookContext } from "@/plugins/context";
import { Spinner } from "@/ui/ui";
import {
  runSelectionAction,
  selectionActionsIn,
  textOf,
  type SelectionResult,
} from "@/plugins/selection";
import { usePopups } from "../popups";
import { annotateSelection } from "../actions";
import { activeStore } from "../readerStore";
import { getView } from "../view";
import { Popup } from "../components/BookPopups";
import { openLinkOutside } from "./lookup";

/** What an action of a plugin answers on the text selected in the book. */
function PluginActionPopup({
  rootRef,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
}) {
  const target = usePopups((state) => state.pluginAction);
  const installedPlugins = useStore((state) => state.installedPlugins);
  const pluginStates = useStore((state) => state.pluginStates);
  useTrustedVersion();
  const found =
    target &&
    selectionActionsIn("reader", installedPlugins, pluginStates).find(
      ({ plugin, action }) =>
        plugin.id === target.plugin && action.id === target.action,
    );
  const [result, setResult] = useState<SelectionResult | undefined>();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setResult(undefined);
    setError("");
    if (!found) {
      setError("The plugin is not enabled");
      return;
    }
    runSelectionAction(
      found,
      target.selection.text,
      "reader",
      getView()?.language?.canonical,
      bookContext(found.plugin, target.selection.cfi),
    )
      .then((res) => {
        if (!cancelled) setResult(res);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
    // run once per target: not again when the plugins list changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  if (!target) return null;

  /** Keep the answer as the note of a highlight of the text. */
  const keep = (note: string) => {
    const created = annotateSelection(target.selection);
    activeStore().getState().updateNote(created.id, { note });
    usePopups.getState().clear();
  };

  return (
    <Popup
      box={target.selection.box}
      rootRef={rootRef}
      testId="plugin-action-popup"
      height={260}
      width={360}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold uppercase text-base-content/60">
          {target.title}
        </span>
        <button
          className="btn btn-ghost btn-xs"
          title="Close"
          aria-label="Close"
          onClick={() => usePopups.getState().clear()}
        >
          <TbX />
        </button>
      </div>
      <div
        className="overflow-y-auto text-sm max-h-60"
        style={{ contain: "paint" }}
        onClick={openLinkOutside}
      >
        {error ? (
          <p className="text-error">{error}</p>
        ) : !result ? (
          <Spinner size="sm" className="mx-auto my-4" />
        ) : "html" in result ? (
          // sanitized in plugins/selection.ts
          <div dangerouslySetInnerHTML={{ __html: result.html }} />
        ) : (
          <p className="whitespace-pre-wrap">{textOf(result)}</p>
        )}
      </div>
      {result && textOf(result) ? (
        <div className="flex justify-end mt-1">
          <button
            className="btn btn-ghost btn-xs"
            title="Keep as the note of a highlight"
            onClick={() => keep(textOf(result))}
          >
            <TbNote /> Keep as a note
          </button>
        </div>
      ) : null}
    </Popup>
  );
}

export default memo(PluginActionPopup);
