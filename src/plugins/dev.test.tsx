import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { store } from "@/state/store";
import { mockInvoke } from "@/testUtils";
import { parseManifest } from "./manifest";
import {
  enablePlugin,
  movePlugin,
  stopDeveloping,
  type InstalledPlugin,
} from "./registry";
import { devError, onDevReload, syncDevWatchers } from "./dev";
import PluginManager from "./PluginManager";
import PluginFrame from "./PluginFrame";

vi.mock("@/workspace/util", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/workspace/util")>()),
  isTauri: true,
}));

const manifest = { id: "clock", name: "Clock", version: "1.0.0" };
const folder = {
  id: "clock",
  dir: "/data/clock",
  where: "device",
  manifest: JSON.stringify(manifest),
};
const clock = (): InstalledPlugin => ({
  id: "clock",
  dir: "/data/clock",
  where: "device",
  hash: "",
  manifest: parseManifest(manifest),
});

beforeEach(() => {
  store.setState({ installedPlugins: [clock()], pluginStates: {} });
  syncDevWatchers({});
  vi.mocked(invoke).mockClear();
});

describe("plugins in development", () => {
  it("installs from a folder to develop, keeps it through enabling, stops", async () => {
    vi.mocked(open).mockResolvedValueOnce("/src/clock");
    mockInvoke(invoke, {
      read_file: JSON.stringify(manifest),
      install_plugin: "/data/clock",
      list_plugins: [folder],
    });
    render(<PluginManager />);
    await userEvent.click(screen.getByRole("button", { name: "Develop" }));
    const row = within(await screen.findByTestId("plugin-clock"));
    expect(await row.findByText("Dev")).toBeInTheDocument();
    const source = { kind: "folder", path: "/src/clock" };
    expect(store.getState().pluginStates.clock).toEqual({
      enabled: false,
      granted: [],
      devSource: "/src/clock",
      source,
    });
    enablePlugin(store.getState().installedPlugins[0]);
    expect(store.getState().pluginStates.clock.devSource).toBe("/src/clock");
    await userEvent.click(
      row.getByRole("button", { name: "Stop developing Clock" }),
    );
    // updated from the folder from now on, by its button
    expect(store.getState().pluginStates.clock).toEqual({
      enabled: true,
      granted: [],
      source,
    });
    expect(row.queryByText("Dev")).toBeNull();
    expect(row.getByRole("button", { name: /Update/ })).toBeInTheDocument();
  });

  it("watches the folders of the plugins in development, as they change", () => {
    mockInvoke(invoke, {
      watch_plugin_dev: undefined,
      unwatch_plugin_dev: undefined,
    });
    syncDevWatchers({ clock: "/src/clock" });
    syncDevWatchers({ clock: "/src/clock" });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("watch_plugin_dev", {
      id: "clock",
      src: "/src/clock",
    });
    syncDevWatchers({ clock: "/src/clock2" });
    expect(invoke).toHaveBeenCalledWith("unwatch_plugin_dev", { id: "clock" });
    expect(invoke).toHaveBeenLastCalledWith("watch_plugin_dev", {
      id: "clock",
      src: "/src/clock2",
    });
    syncDevWatchers({});
    expect(invoke).toHaveBeenLastCalledWith("unwatch_plugin_dev", {
      id: "clock",
    });
  });

  it("reloads a plugin installed again, its frame from the start", async () => {
    mockInvoke(invoke, { list_plugins: [folder] });
    store.setState({ pluginStates: { clock: { enabled: true, granted: [] } } });
    const { rerender } = render(
      <PluginFrame plugin={store.getState().installedPlugins[0]} />,
    );
    const before = screen.getByTitle("Clock").getAttribute("src");
    await onDevReload({ id: "clock", error: "" });
    rerender(<PluginFrame plugin={store.getState().installedPlugins[0]} />);
    const after = screen.getByTitle("Clock").getAttribute("src");
    expect(after).not.toBe(before);
    expect(after?.split("?")[0]).toBe(before?.split("?")[0]);

    await onDevReload({ id: "clock", error: "No manifest.json" });
    expect(devError("clock")).toBe("No manifest.json");
    await onDevReload({ id: "clock", error: "" });
    expect(devError("clock")).toBeUndefined();
  });

  it("stops developing a plugin moved to the workspace", async () => {
    store.setState({
      initDir: "/ws",
      layout: "workspace",
      pluginStates: {
        clock: { enabled: false, granted: [], devSource: "/src/clock" },
      },
    });
    mockInvoke(invoke, {
      install_plugin: "/ws/.mdsilo/plugins/clock",
      remove_plugin: undefined,
      list_plugins: [{ ...folder, where: "workspace", hash: "h" }],
    });
    await movePlugin(clock(), "workspace");
    await waitFor(() =>
      expect(store.getState().pluginStates.clock.devSource).toBeUndefined(),
    );
    stopDeveloping("clock"); // nothing to stop
    expect(store.getState().pluginStates.clock).toEqual({
      enabled: false,
      granted: [],
    });
  });
});
