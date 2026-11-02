import { act, render, screen, waitFor } from "@testing-library/react";
import type { TrustedApi, TrustedModule } from "@mdsilo/plugin-api";
import { store } from "@/state/store";
import { NoteMap } from "@/lib/noteMap";
import { makeNote } from "@/testUtils";
import { parseManifest } from "./manifest";
import { disablePlugin, enablePlugin, type InstalledPlugin } from "./registry";
import { askPlugin } from "./background";
import PluginFrame from "./PluginFrame";
import {
  askTrusted,
  setModuleLoader,
  syncTrusted,
  trustedError,
  trustedExtensions,
  trustedExtensionsKey,
  trustedReaderCss,
} from "./trusted";

const trusted = (id = "deep"): InstalledPlugin => ({
  id,
  dir: `/data/${id}`,
  where: "device",
  hash: "",
  manifest: parseManifest({
    id,
    name: "Deep",
    version: "1.0.0",
    mode: "trusted",
    contributes: { codeBlocks: ["deep"] },
  }),
});

/** the modules imported, by the URL asked */
let modules: Record<string, TrustedModule>;
let imported: string[];
let api: TrustedApi | undefined;

beforeEach(() => {
  imported = [];
  api = undefined;
  modules = {
    deep: {
      activate: (a) => {
        api = a;
        a.handle("code.render", ({ code }) => `<b>${code}</b>`);
      },
      deactivate: vi.fn(),
    },
  };
  setModuleLoader(async (url) => {
    imported.push(url);
    const id = url.split("/").at(-2) ?? "";
    const mod = modules[id];
    if (!mod) throw new Error(`No module at ${url}`);
    return mod;
  });
  store.setState({ installedPlugins: [], pluginStates: {} });
  syncTrusted();
});

const start = async (plugin = trusted()) => {
  store.setState({ installedPlugins: [plugin] });
  enablePlugin(plugin);
  syncTrusted();
  await waitFor(() => expect(api).toBeDefined());
  return plugin;
};

it("loads the module of an enabled trusted plugin, its main", async () => {
  const plugin = trusted();
  store.setState({ installedPlugins: [plugin] });
  syncTrusted();
  expect(imported).toEqual([]);
  await start(plugin);
  expect(imported).toHaveLength(1);
  expect(imported[0]).toMatch(/deep\/main\.js\?v=\d+$/);
  expect(api?.plugin).toEqual({
    id: "deep",
    version: "1.0.0",
    dir: "/data/deep",
  });
});

it("is asked as the main page of a sandboxed plugin is", async () => {
  const plugin = await start();
  expect(
    await askPlugin(plugin, "code.render", {
      lang: "deep",
      code: "x",
      dark: false,
    }),
  ).toBe("<b>x</b>");
  await expect(askTrusted(plugin, "command.run", {})).rejects.toThrow(
    "Unknown method: command.run",
  );
});

it("calls the app with no permission asked", async () => {
  const note = makeNote({ id: "/ws/a.md", title: "a", content: "# A" });
  store.setState({ initDir: "/ws", notes: NoteMap.from({ [note.id]: note }) });
  await start();
  expect(await api!.call("app.info")).toMatchObject({ id: "deep" });
  expect(await api!.call("notes.list")).toEqual([
    expect.objectContaining({ path: "a.md", title: "a" }),
  ]);
});

it("unloads when disabled: its hooks go, deactivate is called", async () => {
  const plugin = await start();
  const unloaded = vi.fn();
  const key = trustedExtensionsKey();
  act(() => {
    api!.onUnload(unloaded);
    api!.editor.addExtension(new api!.editor.Extension());
    api!.reader.addStyles("p { color: red }");
  });
  expect(trustedExtensions()).toHaveLength(1);
  expect(trustedExtensionsKey()).toBe(key + 1);
  expect(trustedReaderCss()).toBe("p { color: red }");

  disablePlugin(plugin.id);
  syncTrusted();
  expect(unloaded).toHaveBeenCalled();
  expect(modules.deep.deactivate).toHaveBeenCalled();
  expect(trustedExtensions()).toEqual([]);
  expect(trustedExtensionsKey()).toBe(key + 2);
  expect(trustedReaderCss()).toBe("");
  await expect(askTrusted(plugin, "code.render", {})).rejects.toThrow(
    "not loaded",
  );
});

it("says why it could not load", async () => {
  modules.broken = { default: undefined } as TrustedModule;
  const plugin = trusted("broken");
  store.setState({ installedPlugins: [plugin] });
  enablePlugin(plugin);
  syncTrusted();
  await waitFor(() =>
    expect(trustedError("broken")).toBe("The module has no activate function"),
  );
  await expect(askTrusted(plugin, "code.render", {})).rejects.toThrow(
    "no activate function",
  );
});

it("loads a plugin installed again", async () => {
  const plugin = await start();
  const again = { ...plugin };
  store.setState({ installedPlugins: [again] });
  syncTrusted();
  expect(modules.deep.deactivate).toHaveBeenCalled();
  await waitFor(() => expect(imported).toHaveLength(2));
  expect(imported[0]).not.toBe(imported[1]);
});

describe("its pages", () => {
  it("draw into the app in place of a frame, with the methods of the place", async () => {
    const plugin = await start();
    const closed = vi.fn();
    const changed = vi.fn();
    act(() => {
      api!.page("main", (el, page) => {
        el.textContent = "Mounted";
        page.on("file.changed", changed);
        void page.call("file.read").then((text) => {
          el.dataset.text = text;
        });
        return closed;
      });
    });
    let host: { emit: (e: string) => void } | null = null;
    const { unmount } = render(
      <PluginFrame
        plugin={plugin}
        methods={{ "file.read": { handler: () => "a,b" } }}
        onHost={(h) => {
          host = h;
        }}
      />,
    );
    const page = await screen.findByText("Mounted");
    expect(document.querySelector("iframe")).toBeNull();
    await waitFor(() => expect(page.dataset.text).toBe("a,b"));
    act(() => host!.emit("file.changed"));
    expect(changed).toHaveBeenCalled();
    unmount();
    expect(closed).toHaveBeenCalled();
  });

  it("says when a page is not there", async () => {
    const plugin = await start();
    render(<PluginFrame plugin={plugin} page="stats" />);
    expect(await screen.findByText("Deep has no page stats.")).toBeVisible();
  });
});
