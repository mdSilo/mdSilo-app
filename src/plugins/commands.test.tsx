import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { store } from "@/state/store";
import SideMenu from "@/shell/SideMenu";
import { renderWithView } from "@/testUtils";
import { askPlugin } from "./background";
import { pluginCommands, runCommand } from "./commands";
import { parseManifest } from "./manifest";
import { enablePlugin, type InstalledPlugin } from "./registry";
import { PluginAnswerModal } from "./PluginAnswer";

vi.mock("./background", () => ({ askPlugin: vi.fn() }));
vi.mock("@/workspace/util", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/workspace/util")>()),
  isTauri: true,
}));

const plugin: InstalledPlugin = {
  id: "clock",
  dir: "/data/clock",
  where: "device",
  hash: "",
  manifest: parseManifest({
    id: "clock",
    name: "Clock",
    version: "1.0.0",
    contributes: { commands: [{ id: "now", title: "What time is it" }] },
  }),
};

beforeEach(() => {
  store.setState({ installedPlugins: [plugin], pluginStates: {} });
  vi.mocked(askPlugin).mockReset();
});

describe("commands", () => {
  it("lists the commands of the enabled plugins", () => {
    expect(pluginCommands()).toEqual([]);
    enablePlugin(plugin);
    expect(pluginCommands().map(({ command }) => command.id)).toEqual(["now"]);
  });

  it("runs a command from the Plugins menu, and shows its answer", async () => {
    enablePlugin(plugin);
    vi.mocked(askPlugin).mockResolvedValue({
      html: "<p>It is <b>noon</b></p><script>1</script>",
    });
    renderWithView(
      <div id="app-container">
        <SideMenu />
        <PluginAnswerModal />
      </div>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Plugins" }));
    await userEvent.click(screen.getByText("What time is it"));
    expect(askPlugin).toHaveBeenCalledWith(plugin, "command.run", {
      command: "now",
    });
    expect(await screen.findByText("noon")).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("noon")).toBeNull();
  });

  it("shows the error of a command, and nothing for no answer", async () => {
    enablePlugin(plugin);
    render(<PluginAnswerModal />);
    vi.mocked(askPlugin).mockResolvedValue(undefined);
    await runCommand(pluginCommands()[0]);
    expect(screen.queryByRole("dialog")).toBeNull();
    vi.mocked(askPlugin).mockRejectedValue(
      new Error("Clock did not answer command.run"),
    );
    void runCommand(pluginCommands()[0]);
    expect(
      await screen.findByText("Clock did not answer command.run"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Insert after" })).toBeNull();
  });
});
