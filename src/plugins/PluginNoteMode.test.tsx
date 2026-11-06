import { render, screen } from "@testing-library/react";
import { store } from "@/state/store";
import { makeNote } from "@/testUtils";
import { parseManifest } from "./manifest";
import {
  enablePlugin,
  pluginNoteModes,
  type InstalledPlugin,
} from "./registry";
import PluginNoteMode, { noteMethods } from "./PluginNoteMode";
import { openInApp } from "./workspaceApi";
import { dispatchView } from "./trusted";

vi.mock("./workspaceApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./workspaceApi")>()),
  openInApp: vi.fn(async () => true),
}));

const plugin: InstalledPlugin = {
  id: "cards",
  dir: "/data/cards",
  where: "device",
  hash: "",
  manifest: parseManifest({
    id: "cards",
    name: "Cards",
    version: "1.0.0",
    permissions: ["notes:read", "notes:write"],
    contributes: {
      noteModes: [{ id: "cards", title: "Cards", page: "cards.html" }],
    },
  }),
};
const mode = plugin.manifest!.contributes.noteModes[0];

beforeEach(() => {
  store.setState({ installedPlugins: [plugin], pluginStates: {} });
});

describe("pluginNoteModes", () => {
  it("lists the modes of the enabled plugins, by the name kept in rawMode", () => {
    expect(pluginNoteModes()).toEqual([]);
    enablePlugin(plugin);
    expect(pluginNoteModes()).toEqual([
      { plugin, mode, name: "plugin:cards:cards" },
    ]);
  });
});

describe("noteMethods", () => {
  it("reads the note and writes it the way the editor does", async () => {
    const text = { current: "# A" };
    const written: string[] = [];
    const onChange = vi.fn();
    let readOnly = false;
    const methods = noteMethods(
      () => ({ title: "A", readOnly }),
      text,
      written,
      onChange,
    );
    expect(methods["note.read"].permission).toBe("notes:read");
    expect(methods["note.write"].permission).toBe("notes:write");
    expect(await methods["note.info"].handler(undefined)).toEqual({
      title: "A",
      readOnly: false,
    });
    expect(await methods["note.read"].handler(undefined)).toBe("# A");
    await methods["note.write"].handler({ text: "# B" });
    expect(onChange).toHaveBeenCalledWith("# B");
    expect(await methods["note.read"].handler(undefined)).toBe("# B");
    expect(written).toEqual(["# B"]);
    expect(() => methods["note.write"].handler({ text: 1 })).toThrow(
      "note.write wants { text: string }",
    );
    readOnly = true;
    expect(() => methods["note.write"].handler({ text: "# C" })).toThrow(
      "read only",
    );
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("PluginNoteMode", () => {
  const props = {
    plugin,
    mode,
    noteId: "/n/a.md",
    title: "A",
    readOnly: false,
    onChange: vi.fn(),
  };

  it("says where the note is, its tags and dates; gives its blocks", async () => {
    store.getState().setInitDir("/ws");
    store
      .getState()
      .upsertNotes([
        makeNote({ id: "/ws/a.md", title: "a", content: "x #idea# " }),
      ]);
    const methods = noteMethods(
      () => ({ title: "a", readOnly: false }),
      { current: "# Title\n\nOne.\n\n- two" },
      [],
      vi.fn(),
      "/ws/a.md",
    );
    expect(await methods["note.info"].handler(undefined)).toEqual({
      title: "a",
      readOnly: false,
      path: "a.md",
      tags: ["idea"],
      created: "2022-01-01T00:00:00.000Z",
      updated: "2022-01-01T00:00:00.000Z",
    });
    expect(methods["note.blocks"].permission).toBe("notes:read");
    expect(await methods["note.blocks"].handler({ from: 1, count: 1 })).toEqual(
      { blocks: [{ index: 1, text: "One." }], next: 2 },
    );
  });

  it("opens a note, a book or an issue, as views do", async () => {
    const methods = noteMethods(
      () => ({ title: "A", readOnly: false }),
      { current: "" },
      [],
      vi.fn(),
    );
    expect(methods["app.open"].permission).toBeUndefined();
    expect(await methods["app.open"].handler({ note: "b.md" })).toBe(true);
    expect(openInApp).toHaveBeenCalledWith({ note: "b.md" }, dispatchView);
  });

  it("shows the page of the mode, and tells it of changes made elsewhere", () => {
    enablePlugin(plugin);
    const { rerender } = render(<PluginNoteMode {...props} content="# A" />);
    const frame = screen.getByTitle("Cards") as HTMLIFrameElement;
    expect(frame.src).toContain("cards/cards.html");
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    const post = vi.spyOn(frame.contentWindow!, "postMessage");
    rerender(<PluginNoteMode {...props} content="# Changed" />);
    expect(post).toHaveBeenCalledWith(
      { mdsilo: 1, event: "note.changed", data: undefined },
      "*",
    );
  });

  it("is not enabled, no page", () => {
    render(<PluginNoteMode {...props} content="# A" />);
    expect(screen.getByText("Cards is not enabled.")).toBeInTheDocument();
  });
});
