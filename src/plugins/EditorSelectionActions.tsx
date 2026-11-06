import { useMemo } from "react";
import type { SelectionAction } from "mdsmirror";
import { useStore } from "@/state/store";
import { useTrustedVersion } from "./trusted";
import { runSelectionAction, selectionActionsIn } from "./selection";
import { showAnswer } from "./PluginAnswer";
import { noteContext } from "./context";
import { pluginIconUrl } from "./PluginIcon";

/**
 * The actions of plugins on the text selected in the editor. An answer that
 * changes the text, `{ replace }` or `{ insert }`, is done at once; text or
 * html or an image is shown (see PluginAnswer), to put after the text
 * selected (an image in its own paragraph after it) or copy.
 * The plugin is given the note of the editor too.
 */
export function useEditorSelectionActions(noteId?: string): SelectionAction[] {
  const installedPlugins = useStore((state) => state.installedPlugins);
  const pluginStates = useStore((state) => state.pluginStates);
  // and what trusted plugins add as they run
  const trustedVersion = useTrustedVersion();
  return useMemo(
    () =>
      selectionActionsIn("editor", installedPlugins, pluginStates).map(
        (found) => ({
          id: `${found.plugin.id}:${found.action.id}`,
          title: found.action.title,
          icon: pluginIconUrl(found.plugin),
          group: found.plugin.manifest?.name,
          run: async (text, { markdown }) => {
            const result = await runSelectionAction(
              found,
              text,
              "editor",
              undefined,
              {
                ...noteContext(found.plugin, noteId),
                ...(markdown === undefined ? {} : { markdown }),
              },
            );
            if ("replace" in result || "insert" in result) return result;
            const insert = await showAnswer(found.action.title, result, true);
            if (insert === undefined) return undefined;
            return typeof insert === "string"
              ? { insert }
              : { insertMarkdown: insert.markdown };
          },
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [installedPlugins, pluginStates, trustedVersion, noteId],
  );
}
