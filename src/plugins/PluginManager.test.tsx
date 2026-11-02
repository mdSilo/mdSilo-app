import { invoke } from "@tauri-apps/api/core";
import { ask, open } from "@tauri-apps/plugin-dialog";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { store } from "@/state/store";
import { mockInvoke } from "@/testUtils";
import { parseManifest } from "@/plugins/manifest";
import type { InstalledPlugin } from "@/plugins/registry";
import SettingsModal from "@/shell/settings/SettingsModal";
import PluginManager, { PluginsModal } from "./PluginManager";

vi.mock("@/workspace/util", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/workspace/util")>()),
  isTauri: true,
}));

const csvManifest = {
  id: "csv",
  name: "CSV Viewer",
  version: "1.0.0",
  description: "Tables",
  permissions: ["file:read", "file:write"],
  contributes: { viewers: [{ extensions: ["csv"], title: "Table" }] },
};

const installed = (
  manifest: Record<string, unknown>,
  error?: string,
): InstalledPlugin => ({
  id: manifest.id as string,
  dir: `/data/${manifest.id}`,
  where: "device",
  hash: "",
  manifest: parseManifest(manifest),
  error,
});

const item = (id: string) => within(screen.getByTestId(`plugin-${id}`));

beforeEach(() => {
  store.setState({
    installedPlugins: [installed(csvManifest)],
    pluginStates: {},
  });
});

describe("PluginManager", () => {
  it("keeps a plugin in the workspace when synced", async () => {
    store.setState({ initDir: "/ws", layout: "workspace" });
    mockInvoke(invoke, {
      install_plugin: () => "/ws/.mdsilo/plugins/csv",
      remove_plugin: () => undefined,
      list_plugins: () => [
        {
          id: "csv",
          dir: "/ws/.mdsilo/plugins/csv",
          manifest: JSON.stringify(csvManifest),
          where: "workspace",
          hash: "h1",
        },
      ],
    });
    render(<PluginManager />);
    await userEvent.click(item("csv").getByLabelText(/Sync with workspace/));
    await waitFor(() =>
      expect(item("csv").getByLabelText(/Sync with workspace/)).toBeChecked(),
    );
    expect(invoke).toHaveBeenCalledWith("install_plugin", {
      src: "/data/csv",
      id: "csv",
      workspace: "/ws/.mdsilo",
    });
    expect(invoke).toHaveBeenCalledWith("remove_plugin", {
      id: "csv",
      workspace: null,
    });
    expect(
      item("csv").getByText("(other devices get it disabled)"),
    ).toBeInTheDocument();
  });

  it("can not sync without a workspace", () => {
    store.setState({ initDir: "" });
    render(<PluginManager />);
    expect(item("csv").getByLabelText(/Sync with workspace/)).toBeDisabled();
  });

  it("says when a sync changed a plugin enabled", () => {
    store.setState({
      installedPlugins: [
        { ...installed(csvManifest), where: "workspace", hash: "h2" },
      ],
      pluginStates: { csv: { enabled: true, granted: [], hash: "h1" } },
    });
    render(<PluginManager />);
    expect(
      item("csv").getByText(/Changed in the workspace since you enabled it/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Enable CSV Viewer")).not.toBeChecked();
  });

  it("lists the plugins, what they open", () => {
    render(<PluginManager />);
    expect(item("csv").getByText("CSV Viewer")).toBeInTheDocument();
    expect(item("csv").getByText("Opens .csv")).toBeInTheDocument();
    expect(item("csv").getByText("Tables")).toBeInTheDocument();
  });

  it("enables a plugin with the permissions chosen", async () => {
    render(<PluginManager />);
    await userEvent.click(screen.getByLabelText("Enable CSV Viewer"));
    expect(store.getState().pluginStates.csv).toBeUndefined();
    expect(item("csv").getByText("CSV Viewer asks to:")).toBeInTheDocument();
    await userEvent.click(
      item("csv").getByLabelText("Change the file it opens"),
    );
    await userEvent.click(item("csv").getByRole("button", { name: "Enable" }));
    expect(store.getState().pluginStates.csv).toEqual({
      enabled: true,
      granted: ["file:read"],
    });
    expect(item("csv").getByText("Allowed to:")).toBeInTheDocument();
  });

  it("enabling can be cancelled", async () => {
    render(<PluginManager />);
    await userEvent.click(screen.getByLabelText("Enable CSV Viewer"));
    await userEvent.click(item("csv").getByRole("button", { name: "Cancel" }));
    expect(store.getState().pluginStates.csv).toBeUndefined();
    expect(screen.getByLabelText("Enable CSV Viewer")).not.toBeChecked();
  });

  it("changes the permissions of an enabled plugin, and disables it", async () => {
    store.setState({
      pluginStates: { csv: { enabled: true, granted: ["file:read"] } },
    });
    render(<PluginManager />);
    await userEvent.click(
      item("csv").getByLabelText("Change the file it opens"),
    );
    expect(store.getState().pluginStates.csv.granted).toEqual([
      "file:read",
      "file:write",
    ]);
    await userEvent.click(screen.getByLabelText("Enable CSV Viewer"));
    expect(store.getState().pluginStates.csv.enabled).toBe(false);
  });

  it("enables a plugin that asks nothing at once", async () => {
    store.setState({
      installedPlugins: [
        installed({ id: "clock", name: "Clock", version: "1.0.0" }),
      ],
    });
    render(<PluginManager />);
    await userEvent.click(screen.getByLabelText("Enable Clock"));
    expect(store.getState().pluginStates.clock).toEqual({
      enabled: true,
      granted: [],
    });
  });

  it("can not enable a plugin with an error", () => {
    store.setState({
      installedPlugins: [
        installed(
          { id: "old", name: "Old", version: "1.0.0" },
          "Needs mdSilo 9.0.0 or later",
        ),
      ],
    });
    render(<PluginManager />);
    expect(screen.getByLabelText("Enable Old")).toBeDisabled();
    expect(screen.getByText("Needs mdSilo 9.0.0 or later")).toBeInTheDocument();
  });

  describe("a trusted plugin", () => {
    beforeEach(() => {
      store.setState({
        installedPlugins: [
          installed(csvManifest),
          installed({
            id: "deep",
            name: "Deep",
            version: "1.0.0",
            author: "Ann",
            mode: "trusted",
            permissions: ["notes:read"],
          }),
        ],
      });
    });

    it("is listed apart, with full access", () => {
      render(<PluginManager />);
      expect(
        screen.getByText("Trusted: run in the app, with full access"),
      ).toBeInTheDocument();
      expect(
        item("deep").getByText(/full access to your files/),
      ).toBeInTheDocument();
    });

    it("is enabled after a warning, with no permission to choose", async () => {
      vi.mocked(ask).mockResolvedValueOnce(true);
      render(<PluginManager />);
      await userEvent.click(screen.getByLabelText("Enable Deep"));
      await waitFor(() =>
        expect(store.getState().pluginStates.deep?.enabled).toBe(true),
      );
      expect(vi.mocked(ask).mock.calls[0][0]).toMatch(
        /not in a sandbox.*trust Ann/,
      );
      expect(item("deep").queryByText("Deep asks to:")).toBeNull();
    });

    it("stays disabled when the warning is declined", async () => {
      vi.mocked(ask).mockResolvedValueOnce(false);
      render(<PluginManager />);
      await userEvent.click(screen.getByLabelText("Enable Deep"));
      await waitFor(() => expect(ask).toHaveBeenCalled());
      expect(store.getState().pluginStates.deep).toBeUndefined();
    });
  });

  it("installs from a folder, and says what is wrong", async () => {
    vi.mocked(open).mockResolvedValueOnce("/src/bad");
    mockInvoke(invoke, { read_file: '{"id":"Bad"}' });
    render(<PluginManager />);
    await userEvent.click(
      screen.getByRole("button", { name: "Install Folder" }),
    );
    expect(await screen.findByText(/"id" should be/)).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "install_plugin",
      expect.anything(),
    );

    vi.mocked(open).mockResolvedValueOnce("/src/clock");
    mockInvoke(invoke, {
      read_file: JSON.stringify({
        id: "clock",
        name: "Clock",
        version: "1.0.0",
      }),
      install_plugin: "/data/clock",
      list_plugins: [
        {
          id: "clock",
          dir: "/data/clock",
          where: "device",
          hash: "",
          manifest: JSON.stringify({
            id: "clock",
            name: "Clock",
            version: "1.0.0",
          }),
        },
      ],
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Install Folder" }),
    );
    expect(await screen.findByText("Clock")).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("install_plugin", {
      src: "/src/clock",
      id: "clock",
    });
  });

  it("installs from a .zip, and removes what it unpacked", async () => {
    vi.mocked(open).mockResolvedValueOnce("/dl/clock.zip");
    mockInvoke(invoke, {
      unpack_plugin: "/data/unpacked/plugin/clock",
      read_file: ({ filePath }: Record<string, unknown>) =>
        filePath === "/data/unpacked/plugin/clock/manifest.json"
          ? JSON.stringify({ id: "clock", name: "Clock", version: "1.0.0" })
          : "",
      install_plugin: "/data/clock",
      list_plugins: [],
      forget_unpacked: undefined,
    });
    render(<PluginManager />);
    await userEvent.click(
      screen.getByRole("button", { name: "Install .zip" }),
    );
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("forget_unpacked"));
    expect(invoke).toHaveBeenCalledWith("unpack_plugin", {
      zip: "/dl/clock.zip",
    });
    expect(invoke).toHaveBeenCalledWith("install_plugin", {
      src: "/data/unpacked/plugin/clock",
      id: "clock",
    });
  });

  it("says why a .zip can not be installed, and cleans up", async () => {
    vi.mocked(open).mockResolvedValueOnce("/dl/x.zip");
    mockInvoke(invoke, {
      unpack_plugin: "/data/unpacked/plugin",
      read_file: "",
      forget_unpacked: undefined,
    });
    render(<PluginManager />);
    await userEvent.click(
      screen.getByRole("button", { name: "Install .zip" }),
    );
    expect(await screen.findByText(/No manifest.json/)).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("forget_unpacked");
  });

  it("uninstalls after asking", async () => {
    store.setState({
      pluginStates: { csv: { enabled: true, granted: ["file:read"] } },
    });
    mockInvoke(invoke, { remove_plugin: undefined, list_plugins: [] });
    vi.mocked(ask).mockResolvedValueOnce(false);
    render(<PluginManager />);
    await userEvent.click(screen.getByLabelText("Uninstall CSV Viewer"));
    expect(invoke).not.toHaveBeenCalledWith("remove_plugin", expect.anything());
    vi.mocked(ask).mockResolvedValueOnce(true);
    await userEvent.click(screen.getByLabelText("Uninstall CSV Viewer"));
    await waitFor(() => expect(screen.queryByText("CSV Viewer")).toBeNull());
    expect(invoke).toHaveBeenCalledWith("remove_plugin", {
      id: "csv",
      workspace: null,
    });
    expect(store.getState().pluginStates).toEqual({});
  });

  it("is a dialog of its own, opened from the settings too", async () => {
    render(
      <>
        <SettingsModal
          isOpen
          handleClose={() => store.getState().setIsSettingsOpen(false)}
        />
        <PluginsModal />
      </>,
    );
    expect(screen.queryByTestId("plugin-manager")).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Manage Plugins" }),
    );
    expect(store.getState().isPluginsOpen).toBe(true);
    expect(await screen.findByTestId("plugin-manager")).toBeInTheDocument();
  });
});
