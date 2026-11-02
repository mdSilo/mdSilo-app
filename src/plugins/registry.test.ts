import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import {
  disablePlugin,
  enabledPlugins,
  enablePlugin,
  grantedPermissions,
  installPlugin,
  isChanged,
  isEnabled,
  loadPlugins,
  movePlugin,
  netPlugins,
  pluginUrl,
  readPlugin,
  uninstallPlugin,
} from "./registry";

const manifest = (more: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: "csv",
    name: "CSV",
    version: "1.0.0",
    permissions: ["file:read", "file:write"],
    ...more,
  });

type Folder = {
  id: string;
  dir: string;
  manifest: string;
  where?: "device" | "workspace";
  hash?: string;
};

/** a plugin folder on disk, as list_plugins gives it */
let folders: Folder[] = [];

beforeEach(() => {
  folders = [];
  store.setState({
    installedPlugins: [],
    pluginStates: {},
    initDir: "/ws",
    layout: "workspace",
  });
  vi.mocked(invoke).mockImplementation(async (cmd, args) => {
    const a = args as Record<string, string | null>;
    const where = a.workspace ? "workspace" : "device";
    if (cmd === "list_plugins") return folders;
    if (cmd === "read_file")
      return a.filePath === "/src/csv/manifest.json" ? manifest() : "";
    if (cmd === "install_plugin") {
      const id = a.id ?? "";
      const dir =
        where === "workspace" ? `/ws/.mdsilo/plugins/${id}` : `/data/${id}`;
      folders = [
        ...folders.filter(
          (f) => !(f.id === id && (f.where ?? "device") === where),
        ),
        {
          id,
          dir,
          manifest: manifest(),
          where,
          hash: where === "workspace" ? "h1" : "",
        },
      ];
      return dir;
    }
    if (cmd === "remove_plugin") {
      folders = folders.filter(
        (f) => !(f.id === a.id && (f.where ?? "device") === where),
      );
      return;
    }
    throw new Error(`unexpected ${cmd}`);
  });
});

describe("readPlugin", () => {
  const folder = { id: "csv", dir: "/data/csv", manifest: manifest() };

  it("reads the manifest", () => {
    const plugin = readPlugin(folder, "1.0.0");
    expect(plugin.error).toBeUndefined();
    expect(plugin.manifest?.name).toBe("CSV");
  });

  it("says why a plugin can not run", () => {
    expect(readPlugin({ ...folder, manifest: "" }, "1.0.0").error).toBe(
      "No manifest.json",
    );
    expect(
      readPlugin({ ...folder, manifest: "{" }, "1.0.0").error,
    ).toBeTruthy();
    expect(readPlugin({ ...folder, id: "other" }, "1.0.0").error).toContain(
      "its id is csv",
    );
    expect(
      readPlugin(
        { ...folder, manifest: manifest({ minAppVersion: "2.0.0" }) },
        "1.0.0",
      ).error,
    ).toBe("Needs mdSilo 2.0.0 or later");
  });
});

describe("installing", () => {
  it("installs a plugin, not enabled", async () => {
    const installed = await installPlugin("/src/csv");
    expect(installed.id).toBe("csv");
    expect(invoke).toHaveBeenCalledWith("install_plugin", {
      src: "/src/csv",
      id: "csv",
    });
    const [plugin] = store.getState().installedPlugins;
    expect(plugin.id).toBe("csv");
    expect(isEnabled(plugin)).toBe(false);
  });

  it("refuses a folder without a manifest", async () => {
    await expect(installPlugin("/src/empty")).rejects.toThrow(
      "No manifest.json",
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "install_plugin",
      expect.anything(),
    );
  });

  it("forgets the plugin when uninstalled", async () => {
    await installPlugin("/src/csv");
    enablePlugin(store.getState().installedPlugins[0]);
    await uninstallPlugin(store.getState().installedPlugins[0]);
    expect(store.getState().installedPlugins).toEqual([]);
    expect(store.getState().pluginStates).toEqual({});
  });
});

describe("enabling", () => {
  beforeEach(async () => {
    folders = [{ id: "csv", dir: "/data/csv", manifest: manifest() }];
    await loadPlugins();
  });

  const plugin = () => store.getState().installedPlugins[0];

  it("enables with what the manifest asks, or less", () => {
    enablePlugin(plugin());
    expect(grantedPermissions(plugin())).toEqual(["file:read", "file:write"]);
    enablePlugin(plugin(), ["file:read", "net"]);
    expect(grantedPermissions(plugin())).toEqual(["file:read"]);
    expect(enabledPlugins()).toEqual([plugin()]);
  });

  it("keeps the permissions when disabled", () => {
    enablePlugin(plugin(), ["file:read"]);
    disablePlugin("csv");
    expect(isEnabled(plugin())).toBe(false);
    expect(store.getState().pluginStates.csv.granted).toEqual(["file:read"]);
    expect(enabledPlugins()).toEqual([]);
  });

  it("gives no permission the manifest does not ask for anymore", async () => {
    enablePlugin(plugin());
    folders = [
      {
        id: "csv",
        dir: "/data/csv",
        manifest: manifest({ permissions: ["file:read"] }),
      },
    ];
    await loadPlugins();
    expect(grantedPermissions(plugin())).toEqual(["file:read"]);
  });

  it("does not run a plugin with an error, even if enabled before", async () => {
    enablePlugin(plugin());
    folders = [{ id: "csv", dir: "/data/csv", manifest: "" }];
    await loadPlugins();
    expect(isEnabled(plugin())).toBe(false);
    expect(() => enablePlugin(plugin())).toThrow("No manifest.json");
  });
});

describe("in the workspace", () => {
  const plugin = () => store.getState().installedPlugins[0];

  it("lists the plugins of the workspace opened", async () => {
    await loadPlugins();
    expect(invoke).toHaveBeenCalledWith("list_plugins", {
      workspace: "/ws/.mdsilo",
    });
    store.setState({ initDir: "" });
    await loadPlugins();
    expect(invoke).toHaveBeenCalledWith("list_plugins", { workspace: null });
  });

  it("is not enabled when it came with the workspace", async () => {
    folders = [
      {
        id: "csv",
        dir: "/ws/.mdsilo/plugins/csv",
        manifest: manifest(),
        where: "workspace",
        hash: "h1",
      },
    ];
    await loadPlugins();
    expect(plugin().where).toBe("workspace");
    expect(isEnabled(plugin())).toBe(false);
    enablePlugin(plugin());
    expect(isEnabled(plugin())).toBe(true);
    expect(store.getState().pluginStates.csv.hash).toBe("h1");
  });

  it("stops when a sync changed it, until enabled again", async () => {
    folders = [
      {
        id: "csv",
        dir: "/ws/.mdsilo/plugins/csv",
        manifest: manifest(),
        where: "workspace",
        hash: "h1",
      },
    ];
    await loadPlugins();
    enablePlugin(plugin());
    folders = [{ ...folders[0], hash: "h2" }];
    await loadPlugins();
    expect(isChanged(plugin())).toBe(true);
    expect(isEnabled(plugin())).toBe(false);
    enablePlugin(plugin());
    expect(isEnabled(plugin())).toBe(true);
  });

  it("moves to the workspace and back, enabled as it was", async () => {
    await installPlugin("/src/csv");
    enablePlugin(plugin());
    await movePlugin(plugin(), "workspace");
    expect(invoke).toHaveBeenCalledWith("install_plugin", {
      src: "/data/csv",
      id: "csv",
      workspace: "/ws/.mdsilo",
    });
    expect(invoke).toHaveBeenCalledWith("remove_plugin", {
      id: "csv",
      workspace: null,
    });
    expect(store.getState().installedPlugins).toHaveLength(1);
    expect(plugin().where).toBe("workspace");
    expect(isEnabled(plugin())).toBe(true);

    await movePlugin(plugin(), "device");
    expect(plugin().where).toBe("device");
    expect(plugin().dir).toBe("/data/csv");
    expect(isEnabled(plugin())).toBe(true);
  });

  it("can not move to the workspace without one", async () => {
    await installPlugin("/src/csv");
    store.setState({ initDir: "" });
    await expect(movePlugin(plugin(), "workspace")).rejects.toThrow(
      "No workspace",
    );
    expect(plugin().where).toBe("device");
  });
});

describe("pluginUrl", () => {
  it("puts the id and the path after the base of the scheme", () => {
    vi.mocked(convertFileSrc).mockImplementationOnce(
      (path, protocol) => `${protocol}://localhost/${path}`,
    );
    expect(pluginUrl("csv", "a b/index.html")).toBe(
      "mdsplugin://localhost/csv/a%20b/index.html",
    );
  });

  it("serves the Windows form as well", () => {
    vi.mocked(convertFileSrc).mockImplementationOnce(
      (path, protocol) => `http://${protocol}.localhost/${path}`,
    );
    expect(pluginUrl("csv")).toBe("http://mdsplugin.localhost/csv/");
  });
});

describe("netPlugins", () => {
  it("lists the enabled plugins granted the network", async () => {
    folders = [
      {
        id: "a",
        dir: "/data/a",
        manifest: manifest({ id: "a", permissions: ["net"] }),
      },
      {
        id: "b",
        dir: "/data/b",
        manifest: manifest({ id: "b", permissions: ["net"] }),
      },
      {
        id: "c",
        dir: "/data/c",
        manifest: manifest({ id: "c", permissions: ["net"] }),
      },
    ];
    const [a, b, c] = await loadPlugins();
    enablePlugin(a);
    enablePlugin(b, []);
    enablePlugin(c);
    disablePlugin("c");
    expect(netPlugins()).toEqual(["a"]);
  });
});
