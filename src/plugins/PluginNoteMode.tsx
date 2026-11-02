import { useEffect, useMemo, useRef } from "react";
import { useStore } from "@/state/store";
import type { PluginHost, PluginMethods } from "./host";
import PluginFrame from "./PluginFrame";
import { pluginNoteModes, type InstalledPlugin } from "./registry";
import type { NoteModeContribution } from "./manifest";

/** The note modes of the enabled plugins */
export function usePluginNoteModes() {
  const installedPlugins = useStore((state) => state.installedPlugins);
  const pluginStates = useStore((state) => state.pluginStates);
  return useMemo(
    () => pluginNoteModes(installedPlugins, pluginStates),
    [installedPlugins, pluginStates],
  );
}

type NoteInfo = { title: string; readOnly: boolean };

/** how many of its own writes are known, not to take them for changes */
const OWN_WRITES = 20;

/**
 * The methods of a note mode, for the note open only. `text` is the content
 * last read or written; `written` the latest texts the plugin wrote, not to
 * tell it of its own writes when the store catches up with them.
 */
export function noteMethods(
  info: () => NoteInfo,
  text: { current: string },
  written: string[],
  onChange: (text: string) => void,
): PluginMethods {
  return {
    "note.info": { handler: info },
    "note.read": { permission: "notes:read", handler: () => text.current },
    "note.write": {
      permission: "notes:write",
      handler: (params) => {
        const content = (params as { text?: unknown } | undefined)?.text;
        if (typeof content !== "string")
          throw new Error("note.write wants { text: string }");
        if (info().readOnly) throw new Error("The note is read only");
        text.current = content;
        written.push(content);
        if (written.length > OWN_WRITES) written.shift();
        // the same way as the other modes: saved once the typing pauses
        onChange(content);
        return true;
      },
    },
  };
}

type Props = {
  plugin: InstalledPlugin;
  mode: NoteModeContribution;
  noteId: string;
  title: string;
  /** the content of the note, as the store has it */
  content: string;
  readOnly: boolean;
  onChange: (text: string) => void;
};

/** The note open, shown and edited by the page of a plugin, in place of the editor. */
export default function PluginNoteMode({
  plugin,
  mode,
  noteId,
  title,
  content,
  readOnly,
  onChange,
}: Props) {
  const text = useRef(content);
  const written = useRef<string[]>([]);
  const host = useRef<PluginHost | null>(null);
  const info = useRef<NoteInfo>({ title, readOnly });
  info.current = { title, readOnly };
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const methods = useMemo(
    () =>
      noteMethods(
        () => info.current,
        text,
        written.current,
        (t) => onChangeRef.current(t),
      ),
    [],
  );

  // changed elsewhere: by another app, git, or a plugin of the workspace
  useEffect(() => {
    if (content === text.current || written.current.includes(content)) return;
    text.current = content;
    host.current?.emit("note.changed");
  }, [content]);

  return (
    <div className="h-[70vh] min-h-64 w-full" data-testid="plugin-note-mode">
      <PluginFrame
        key={`${plugin.id}-${mode.id}-${noteId}`}
        plugin={plugin}
        page={mode.page}
        methods={methods}
        onHost={(h) => {
          host.current = h;
        }}
      />
    </div>
  );
}
