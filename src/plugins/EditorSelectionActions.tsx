import { useMemo } from 'react';
import { create } from 'zustand';
import copy from 'copy-to-clipboard';
import type { SelectionAction, SelectionActionResult } from 'mdsmirror';
import { useStore } from '@/state/store';
import { BaseModal } from '@/ui/BaseModal';
import { runSelectionAction, selectionActionsIn, textOf, type SelectionResult } from './selection';

/**
 * The actions of plugins on the text selected in the editor. An answer that
 * changes the text, `{ replace }` or `{ insert }`, is done at once; text or
 * html is shown, to put after the text selected or copy.
 */
type Shown = {
  title: string;
  result: SelectionResult;
  done: (answer?: SelectionActionResult) => void;
};

const useShown = create<{ shown?: Shown }>(() => ({}));

/** Shows the answer; done with what to do to the text, if anything. */
const show = (title: string, result: SelectionResult) => new Promise<SelectionActionResult | undefined>((resolve) => {
  useShown.getState().shown?.done();
  useShown.setState({
    shown: {
      title,
      result,
      done: (answer) => {
        useShown.setState({ shown: undefined });
        resolve(answer);
      },
    },
  });
});

/** The buttons of the plugins for the selection toolbar of the editor */
export function useEditorSelectionActions(): SelectionAction[] {
  const installedPlugins = useStore((state) => state.installedPlugins);
  const pluginStates = useStore((state) => state.pluginStates);
  return useMemo(() => selectionActionsIn('editor', installedPlugins, pluginStates).map((found) => ({
    id: `${found.plugin.id}:${found.action.id}`,
    title: found.action.title,
    run: async (text: string) => {
      const result = await runSelectionAction(found, text, 'editor');
      if ('replace' in result || 'insert' in result) return result;
      return show(found.action.title, result);
    },
  })), [installedPlugins, pluginStates]);
}

/** The answer of an action, to put after the text selected, or copy. */
export function SelectionResultModal() {
  const shown = useShown((state) => state.shown);
  if (!shown) return null;
  const { title, result, done } = shown;
  const text = textOf(result);
  return (
    <BaseModal title={title} isOpen handleClose={() => done()}>
      <div className="overflow-y-auto text-sm max-h-80" style={{ contain: 'paint' }}>
        {'html' in result ? (
          // sanitized in plugins/selection.ts
          <div dangerouslySetInnerHTML={{ __html: result.html }} />
        ) : (
          <p className="whitespace-pre-wrap">{text}</p>
        )}
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { copy(text, { format: 'text/plain' }); done(); }}>
          Copy
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={!text} onClick={() => done({ insert: text })}>
          Insert after
        </button>
      </div>
    </BaseModal>
  );
}
