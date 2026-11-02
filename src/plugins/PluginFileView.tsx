import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef } from "react";
import { useStore } from "@/state/store";
import { useCurrentViewContext } from "@/state/useCurrentView";
import { isTauri, normalizeSlash } from "@/workspace/util";
import { getFileExt } from "@/workspace/process";
import { readBytes, writeBytes } from "@/reader/library/library";
import type { PluginHost, PluginMethods } from "./host";
import PluginFrame from "./PluginFrame";

const nameOf = (path: string) => path.split(/[/\\]/).pop() ?? path;

/** The content of a file last read or written: text, or bytes */
type Content = string | Uint8Array;

const sameContent = (a: Content, b: Content) =>
  typeof a === "string" || typeof b === "string"
    ? a === b
    : a.length === b.length && a.every((x, i) => x === b[i]);

const bytesOf = (data: unknown) =>
  data instanceof Uint8Array
    ? data
    : data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : null;

/**
 * The methods of a plugin that opens a file: only that file, read and
 * written as text or as bytes. `text` is the content last read or written,
 * not to tell the plugin of its own writes.
 */
export function fileMethods(
  path: string,
  text: { current: Content | null },
): PluginMethods {
  return {
    "file.info": {
      handler: () => ({
        name: nameOf(path),
        ext: getFileExt(nameOf(path)).toLowerCase(),
      }),
    },
    "file.read": {
      permission: "file:read",
      handler: async () => {
        const content = await invoke<string>("read_file", { filePath: path });
        text.current = content;
        return content;
      },
    },
    "file.write": {
      permission: "file:write",
      handler: async (params) => {
        const content = (params as { text?: unknown } | undefined)?.text;
        if (typeof content !== "string")
          throw new Error("file.write wants { text: string }");
        const done = await invoke<boolean>("write_file", {
          filePath: path,
          text: content,
        });
        if (!done) throw new Error(`Could not write ${nameOf(path)}`);
        text.current = content;
        return true;
      },
    },
    "file.readBytes": {
      permission: "file:read",
      handler: async () => {
        const data = await readBytes(path);
        text.current = data;
        return data;
      },
    },
    "file.writeBytes": {
      permission: "file:write",
      handler: async (params) => {
        const data = bytesOf((params as { data?: unknown } | undefined)?.data);
        if (!data)
          throw new Error("file.writeBytes wants { data: Uint8Array }");
        if (!(await writeBytes(path, data)))
          throw new Error(`Could not write ${nameOf(path)}`);
        text.current = data;
        return true;
      },
    },
  };
}

type Changes = { paths: string[]; event: string };

/** Tells the plugin when the file is changed by another app, or by git. */
function useFileChanged(
  path: string,
  host: { current: PluginHost | null },
  text: { current: Content | null },
) {
  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    let gone = false;
    import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) =>
        getCurrentWindow().listen<Changes>("changes", async ({ payload }) => {
          if (payload.event === "remove" || payload.event === "renameFrom")
            return;
          if (
            !payload.paths.some(
              (p) => normalizeSlash(p) === normalizeSlash(path),
            )
          )
            return;
          // read as the plugin read it: bytes are not text
          if (text.current !== null) {
            const content =
              typeof text.current === "string"
                ? await invoke<string>("read_file", { filePath: path })
                : await readBytes(path);
            if (sameContent(text.current, content)) return;
            text.current = content;
          }
          host.current?.emit("file.changed");
        }),
      )
      .then((fn) => {
        if (gone) fn();
        else unlisten = fn;
      })
      .catch((e) =>
        console.error("Error on watching the file of a plugin:", e),
      );
    return () => {
      gone = true;
      unlisten?.();
    };
  }, [path, host, text]);
}

/** A file opened by the plugin that views files of its kind. */
export default function PluginFileView() {
  const { state } = useCurrentViewContext();
  const { pluginId = "", filePath = "" } = state;
  const plugin = useStore((s) =>
    s.installedPlugins.find((p) => p.id === pluginId),
  );
  const text = useRef<Content | null>(null);
  const host = useRef<PluginHost | null>(null);
  const methods = useMemo(() => fileMethods(filePath, text), [filePath]);
  useFileChanged(filePath, host, text);

  if (!plugin) {
    return (
      <div className="p-4 text-sm text-base-content/70">
        The plugin {pluginId} is not installed.
      </div>
    );
  }
  return (
    <div className="flex h-full w-full flex-col">
      <div className="truncate border-b border-base-300 px-3 py-1 text-sm text-base-content/70">
        {nameOf(filePath)}
        <span className="ml-2 text-xs text-base-content/50">
          {plugin.manifest?.name ?? plugin.id}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <PluginFrame
          key={filePath}
          plugin={plugin}
          methods={methods}
          onHost={(h) => {
            host.current = h;
          }}
        />
      </div>
    </div>
  );
}
