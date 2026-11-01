import { invoke } from '@tauri-apps/api/core';
import { useEffect, useMemo, useRef } from 'react';
import { useStore } from '@/state/store';
import { useCurrentViewContext } from '@/state/useCurrentView';
import { isTauri, normalizeSlash } from '@/workspace/util';
import { getFileExt } from '@/workspace/process';
import type { PluginHost, PluginMethods } from './host';
import PluginFrame from './PluginFrame';

const nameOf = (path: string) => path.split(/[/\\]/).pop() ?? path;

/**
 * The methods of a plugin that opens a file: only that file, read and
 * written as text. `text` is the content last read or written, not to tell
 * the plugin of its own writes.
 */
export function fileMethods(path: string, text: { current: string | null }): PluginMethods {
  return {
    'file.info': { handler: () => ({ name: nameOf(path), ext: getFileExt(nameOf(path)).toLowerCase() }) },
    'file.read': {
      permission: 'file:read',
      handler: async () => {
        const content = await invoke<string>('read_file', { filePath: path });
        text.current = content;
        return content;
      },
    },
    'file.write': {
      permission: 'file:write',
      handler: async (params) => {
        const content = (params as { text?: unknown } | undefined)?.text;
        if (typeof content !== 'string') throw new Error('file.write wants { text: string }');
        const done = await invoke<boolean>('write_file', { filePath: path, text: content });
        if (!done) throw new Error(`Could not write ${nameOf(path)}`);
        text.current = content;
        return true;
      },
    },
  };
}

type Changes = { paths: string[]; event: string };

/** Tells the plugin when the file is changed by another app, or by git. */
function useFileChanged(path: string, host: { current: PluginHost | null }, text: { current: string | null }) {
  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    let gone = false;
    import('@tauri-apps/api/window').then(({ getCurrentWindow }) =>
      getCurrentWindow().listen<Changes>('changes', async ({ payload }) => {
        if (payload.event === 'remove' || payload.event === 'renameFrom') return;
        if (!payload.paths.some((p) => normalizeSlash(p) === normalizeSlash(path))) return;
        const content = await invoke<string>('read_file', { filePath: path });
        if (content === text.current) return;
        text.current = content;
        host.current?.emit('file.changed');
      })).then((fn) => {
      if (gone) fn();
      else unlisten = fn;
    }).catch((e) => console.error('Error on watching the file of a plugin:', e));
    return () => {
      gone = true;
      unlisten?.();
    };
  }, [path, host, text]);
}

/** A file opened by the plugin that views files of its kind. */
export default function PluginFileView() {
  const { state } = useCurrentViewContext();
  const { pluginId = '', filePath = '' } = state;
  const plugin = useStore((s) => s.installedPlugins.find((p) => p.id === pluginId));
  const text = useRef<string | null>(null);
  const host = useRef<PluginHost | null>(null);
  const methods = useMemo(() => fileMethods(filePath, text), [filePath]);
  useFileChanged(filePath, host, text);

  if (!plugin) {
    return <div className="p-4 text-sm text-base-content/70">The plugin {pluginId} is not installed.</div>;
  }
  return (
    <div className="flex h-full w-full flex-col">
      <div className="truncate border-b border-base-300 px-3 py-1 text-sm text-base-content/70">
        {nameOf(filePath)}
        <span className="ml-2 text-xs text-base-content/50">{plugin.manifest?.name ?? plugin.id}</span>
      </div>
      <div className="min-h-0 flex-1">
        <PluginFrame
          key={filePath}
          plugin={plugin}
          methods={methods}
          onHost={(h) => { host.current = h; }}
        />
      </div>
    </div>
  );
}
