import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import copy from "copy-to-clipboard";
import { store } from "@/state/store";
import { makeNote } from "@/testUtils";
import { askPlugin } from "./background";
import { parseManifest } from "./manifest";
import { enablePlugin, type InstalledPlugin } from "./registry";
import { useEditorSelectionActions } from "./EditorSelectionActions";
import { PluginAnswerModal } from "./PluginAnswer";

vi.mock("./background", () => ({ askPlugin: vi.fn() }));
vi.mock("copy-to-clipboard", () => ({ default: vi.fn() }));
vi.mock("./image", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./image")>()),
  saveImageToAssets: vi.fn(async () => "![A card](./assets/card.png)"),
}));

const plugin: InstalledPlugin = {
  id: "ai",
  dir: "/data/ai",
  where: "device",
  hash: "",
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

const actions = (noteId?: string) =>
  renderHook(() => useEditorSelectionActions(noteId)).result;

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
    expect(await actions().current[0].run("selected", {})).toEqual({
      replace: "SELECTED",
    });
    expect(askPlugin).toHaveBeenCalledWith(
      plugin,
      "selection.action",
      expect.objectContaining({ where: "editor" }),
    );
  });

  it("gives the plugin the Markdown, and the note if it may read notes", async () => {
    store.getState().setInitDir("/ws");
    store
      .getState()
      .upsertNotes([makeNote({ id: "/ws/a.md", title: "a", content: "x" })]);
    const reader = {
      ...plugin,
      manifest: { ...plugin.manifest!, permissions: ["notes:read" as const] },
    };
    store.setState({ installedPlugins: [reader] });
    vi.mocked(askPlugin).mockResolvedValue({ replace: "X" });

    enablePlugin(reader, []);
    await actions("/ws/a.md").current[0].run("x", { markdown: "**x**" });
    expect(vi.mocked(askPlugin).mock.lastCall?.[2]).toEqual({
      action: "explain",
      text: "x",
      markdown: "**x**",
      where: "editor",
      lang: undefined,
    });

    enablePlugin(reader);
    await actions("/ws/a.md").current[0].run("x", {});
    expect(vi.mocked(askPlugin).mock.lastCall?.[2]).toMatchObject({
      text: "x",
      note: { path: "a.md", title: "a", tags: [] },
    });
  });

  it("shows an answer, to insert after the text", async () => {
    enablePlugin(plugin);
    vi.mocked(askPlugin).mockResolvedValue({ html: "<p>A <b>word</b></p>" });
    const [action] = actions().current;
    render(<PluginAnswerModal />);
    let answer: Promise<unknown> = Promise.resolve();
    await act(async () => {
      answer = action.run("word", {});
    });
    expect(await screen.findByText("word")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Insert after" }));
    expect(await answer).toEqual({ insert: "A word" });
    expect(screen.queryByText("Insert after")).toBeNull();
  });

  it("shows an image, to put in the note as Markdown", async () => {
    URL.createObjectURL = vi.fn(() => "blob:card");
    URL.revokeObjectURL = vi.fn();
    enablePlugin(plugin);
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    vi.mocked(askPlugin).mockResolvedValue({ image: png, alt: "A card" });
    const [action] = actions().current;
    render(<PluginAnswerModal />);
    let answer: Promise<unknown> = Promise.resolve();
    await act(async () => {
      answer = action.run("word", {});
    });
    expect(await screen.findByRole("img", { name: "A card" })).toHaveAttribute(
      "src",
      "blob:card",
    );
    expect(screen.getByRole("button", { name: /Save/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Insert/ }));
    expect(await answer).toEqual({
      insertMarkdown: "![A card](./assets/card.png)",
    });
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("copies an answer, the text unchanged", async () => {
    enablePlugin(plugin);
    vi.mocked(askPlugin).mockResolvedValue("plain answer");
    const [action] = actions().current;
    render(<PluginAnswerModal />);
    let answer: Promise<unknown> = Promise.resolve();
    await act(async () => {
      answer = action.run("word", {});
    });
    await userEvent.click(await screen.findByRole("button", { name: "Copy" }));
    expect(copy).toHaveBeenCalledWith("plain answer", { format: "text/plain" });
    expect(await answer).toBeUndefined();
  });
});
