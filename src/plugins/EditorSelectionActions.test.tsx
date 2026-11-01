import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import copy from "copy-to-clipboard";
import { store } from "@/state/store";
import { askPlugin } from "./background";
import { parseManifest } from "./manifest";
import { enablePlugin, type InstalledPlugin } from "./registry";
import { useEditorSelectionActions } from "./EditorSelectionActions";
import { PluginAnswerModal } from "./PluginAnswer";

vi.mock("./background", () => ({ askPlugin: vi.fn() }));
vi.mock("copy-to-clipboard", () => ({ default: vi.fn() }));

const plugin: InstalledPlugin = {
  id: "ai",
  dir: "/data/ai",
  manifest: parseManifest({
    id: "ai",
    name: "AI",
    version: "1.0.0",
    contributes: {
      selectionActions: [
        { id: "explain", title: "Explain" },
        { id: "look", title: "Look up", where: ["reader"] },
      ],
    },
  }),
};

beforeEach(() => {
  store.setState({ installedPlugins: [plugin], pluginStates: {} });
  vi.mocked(askPlugin).mockReset();
});

const actions = () => renderHook(() => useEditorSelectionActions()).result;

describe("useEditorSelectionActions", () => {
  it("gives the actions of the editor only", () => {
    expect(actions().current).toEqual([]);
    enablePlugin(plugin);
    expect(actions().current.map((a) => [a.id, a.title])).toEqual([
      ["ai:explain", "Explain"],
    ]);
  });

  it("changes the text at once when the plugin says so", async () => {
    enablePlugin(plugin);
    vi.mocked(askPlugin).mockResolvedValue({ replace: "SELECTED" });
    expect(await actions().current[0].run("selected")).toEqual({
      replace: "SELECTED",
    });
    expect(askPlugin).toHaveBeenCalledWith(
      plugin,
      "selection.action",
      expect.objectContaining({ where: "editor" }),
    );
  });

  it("shows an answer, to insert after the text", async () => {
    enablePlugin(plugin);
    vi.mocked(askPlugin).mockResolvedValue({ html: "<p>A <b>word</b></p>" });
    const [action] = actions().current;
    render(<PluginAnswerModal />);
    let answer: Promise<unknown> = Promise.resolve();
    await act(async () => {
      answer = action.run("word");
    });
    expect(await screen.findByText("word")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Insert after" }));
    expect(await answer).toEqual({ insert: "A word" });
    expect(screen.queryByText("Insert after")).toBeNull();
  });

  it("copies an answer, the text unchanged", async () => {
    enablePlugin(plugin);
    vi.mocked(askPlugin).mockResolvedValue("plain answer");
    const [action] = actions().current;
    render(<PluginAnswerModal />);
    let answer: Promise<unknown> = Promise.resolve();
    await act(async () => {
      answer = action.run("word");
    });
    await userEvent.click(await screen.findByRole("button", { name: "Copy" }));
    expect(copy).toHaveBeenCalledWith("plain answer", { format: "text/plain" });
    expect(await answer).toBeUndefined();
  });
});
