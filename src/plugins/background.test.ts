import { store } from "@/state/store";
import { askPlugin } from "./background";
import { createHost, type PluginMethods } from "./host";
import { parseManifest } from "./manifest";
import { enablePlugin, type InstalledPlugin } from "./registry";

vi.mock("./host", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./host")>()),
  createHost: vi.fn(() => ({ call: vi.fn(), dispose: vi.fn() })),
}));

const plugin: InstalledPlugin = {
  id: "card",
  dir: "/data/card",
  where: "device",
  hash: "",
  manifest: parseManifest({
    id: "card",
    name: "Card",
    version: "1.0.0",
    permissions: ["notes:read"],
    contributes: { commands: [{ id: "c", title: "C" }] },
  }),
};

describe("background", () => {
  it("gives the hidden frame the methods of the workspace", () => {
    store.setState({ installedPlugins: [plugin], pluginStates: {} });
    enablePlugin(plugin);
    // not awaited: the frame never loads in jsdom
    void askPlugin(plugin, "command.run", { command: "c" });
    const methods = vi.mocked(createHost).mock.lastCall?.[2] as
      (() => PluginMethods) | undefined;
    expect(methods?.()).toMatchObject({
      "notes.read": { permission: "notes:read" },
      "books.list": { permission: "books:read" },
      "app.open": {},
    });
  });
});
