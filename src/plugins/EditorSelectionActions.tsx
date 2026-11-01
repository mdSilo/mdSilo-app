import { useMemo } from 'react';
import type { SelectionAction } from 'mdsmirror';
import { useStore } from '@/state/store';
import { runSelectionAction, selectionActionsIn } from './selection';
import { showAnswer } from './PluginAnswer';

/**
 * The actions of plugins on the text selected in the editor. An answer that
 * changes the text, `{ replace }` or `{ insert }`, is done at once; text or
 * html is shown (see PluginAnswer), to put after the text selected or copy.
 */
export function useEditorSelectionActions(): SelectionAction[] {
  const installedPlugins = useStore((state) => state.installedPlugins);
  const pluginStates = useStore((state) => state.pluginStates);
  return useMemo(() => selectionActionsIn('editor', installedPlugins, pluginStates).map((found) => ({
    id: `${found.plugin.id}:${found.action.id}`,
    title: found.action.title,
    run: async (text: string) => {
      const result = await runSelectionAction(found, text, 'editor');
      if ('replace' in result || 'insert' in result) return result;
      const insert = await showAnswer(found.action.title, result, true);
      return insert === undefined ? undefined : { insert };
    },
  })), [installedPlugins, pluginStates]);
}
