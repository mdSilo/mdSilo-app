import { useEffect, useMemo, useRef } from "react";
import { create } from "zustand";
import { TbCheck, TbPuzzle, TbX } from "react-icons/tb";
import { useStore } from "@/state/store";
import Dropdown, { DropdownItem } from "@/ui/Dropdown";
import { IconButton } from "@/ui/ui";
import type { PluginHost, PluginMethods } from "./host";
import PluginFrame from "./PluginFrame";
import { PluginIcon } from "./PluginIcon";
import { onRelocated, readerInfo, readerMethods } from "./readerApi";
import { pluginReaderPanels, type InstalledPlugin } from "./registry";
import type { ReaderPanelContribution } from "./manifest";
import { dispatchView, useTrustedVersion } from "./trusted";
import { workspaceMethods } from "./workspaceApi";

/**
 * Panels of plugins in the reader (`contributes.readerPanels`): opened from
 * its header, a page over the book or beside it, with the methods of the
 * book open (`reader.*`), told when the page shown changes. One at a time.
 */
type OpenPanel = { plugin: string; panel: string };

export const useReaderPanel = create<{ open?: OpenPanel }>(() => ({}));

export const openReaderPanel = (open: OpenPanel) =>
  useReaderPanel.setState({ open });
export const closeReaderPanel = () =>
  useReaderPanel.setState({ open: undefined });

/** The panels of the enabled plugins */
function usePanels() {
  const installedPlugins = useStore((state) => state.installedPlugins);
  const pluginStates = useStore((state) => state.pluginStates);
  // and what trusted plugins add as they run
  const trustedVersion = useTrustedVersion();
  return useMemo(
    () => pluginReaderPanels(installedPlugins, pluginStates),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [installedPlugins, pluginStates, trustedVersion],
  );
}

/** the panels shown as buttons, each its own; more are in a list */
const MAX_PANEL_BUTTONS = 1;

/** The buttons of the panels in the header of the reader: a few, or a list */
export function ReaderPanelsButton() {
  const panels = usePanels();
  const open = useReaderPanel((state) => state.open);
  if (!panels.length) return null;
  const isOpen = (p: { plugin: InstalledPlugin; panel: { id: string } }) =>
    open?.plugin === p.plugin.id && open.panel === p.panel.id;
  const toggle = (p: { plugin: InstalledPlugin; panel: { id: string } }) =>
    isOpen(p)
      ? closeReaderPanel()
      : openReaderPanel({ plugin: p.plugin.id, panel: p.panel.id });
  // a few: each its button, with its icon; more: in a list
  if (panels.length <= MAX_PANEL_BUTTONS) {
    return (
      <>
        {panels.map((p) => (
          <IconButton
            key={`${p.plugin.id}:${p.panel.id}`}
            title={p.panel.title}
            active={isOpen(p)}
            onClick={() => toggle(p)}
          >
            <PluginIcon plugin={p.plugin} size={18} />
          </IconButton>
        ))}
      </>
    );
  }
  return (
    <Dropdown
      buttonChildren={
        <>
          <TbPuzzle size={18} />
          <span className="sr-only">Plugin panels</span>
        </>
      }
      buttonClassName="btn btn-ghost btn-sm btn-square"
      itemsClassName="w-60"
      placement="bottom-end"
      tooltipContent="Plugin panels"
    >
      {panels.map((p) => (
        <DropdownItem
          key={`${p.plugin.id}:${p.panel.id}`}
          onClick={() => toggle(p)}
        >
          <PluginIcon plugin={p.plugin} size={18} className="mr-2" />
          <span className="truncate">{p.panel.title}</span>
          <span className="pl-2 ml-auto text-xs truncate text-base-content/60">
            {p.plugin.manifest?.name}
          </span>
          {isOpen(p) ? (
            <TbCheck size={14} className="ml-1 text-success shrink-0" />
          ) : null}
        </DropdownItem>
      ))}
    </Dropdown>
  );
}

/** The panel open, over the book or beside it */
export function ReaderPanelHost() {
  const open = useReaderPanel((state) => state.open);
  const panels = usePanels();
  const found = panels.find(
    (p) => p.plugin.id === open?.plugin && p.panel.id === open.panel,
  );
  // the book closed (the reader gone): the panel with it
  useEffect(() => closeReaderPanel, []);
  if (!found) return null;
  return (
    <PanelFrame
      key={`${found.plugin.id}:${found.panel.id}`}
      plugin={found.plugin}
      panel={found.panel}
    />
  );
}

function PanelFrame({
  plugin,
  panel,
}: {
  plugin: InstalledPlugin;
  panel: ReaderPanelContribution;
}) {
  const host = useRef<PluginHost | null>(null);
  const methods = useMemo<PluginMethods>(
    () => ({
      ...workspaceMethods(dispatchView),
      ...readerMethods(plugin),
      "panel.info": { handler: () => ({ id: panel.id }) },
      "panel.close": {
        handler: () => {
          closeReaderPanel();
          return true;
        },
      },
    }),
    [plugin, panel.id],
  );

  // the page shown changed: told to the panel
  useEffect(
    () =>
      onRelocated(() => {
        void readerInfo().then((info) => {
          if (info) host.current?.emit("reader.relocated", info);
        });
      }),
    [],
  );

  const side = panel.placement === "side";
  return (
    <div
      className={`absolute z-40 flex flex-col bg-base-100 text-base-content ${
        side
          ? "top-0 bottom-0 right-0 w-80 max-w-full border-l shadow-xl border-base-300"
          : "inset-0"
      }`}
      data-testid="reader-panel"
      // Escape, the focus out of the page of the panel (in the header)
      onKeyDown={(e) => {
        if (e.key === "Escape") closeReaderPanel();
      }}
    >
      <div className="flex items-center gap-2 px-2 border-b h-9 shrink-0 border-base-300">
        <PluginIcon plugin={plugin} size={16} />
        <span className="flex-1 text-sm truncate">{panel.title}</span>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          title="Close"
          aria-label="Close"
          onClick={closeReaderPanel}
        >
          <TbX size={16} />
        </button>
      </div>
      <div className="flex-1 min-h-0">
        <PluginFrame
          plugin={plugin}
          page={panel.page}
          methods={methods}
          autoFocus
          onHost={(h) => {
            host.current = h;
          }}
        />
      </div>
    </div>
  );
}
