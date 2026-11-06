import type MsEditor from "mdsmirror";
import { store } from "@/state/store";
import { makeNote } from "@/testUtils";
import { setEditor } from "@/writer/editors";
import { parseManifest } from "./manifest";
import type { InstalledPlugin } from "./registry";
import { blocksFrom, editorMethods, markdownBlocks } from "./editorApi";

const pluginOf = (id: string): InstalledPlugin => ({
  id,
  dir: `/data/${id}`,
  where: "device",
  hash: "",
  manifest: parseManifest({
    id,
    name: id,
    version: "1.0.0",
    permissions: ["notes:read"],
  }),
});

/** an editor of three blocks, the cursor in the second */
function fakeEditor() {
  const editor = {
    textBlocks: () =>
      ["one", "two", "three"].map((text, index) => ({
        index,
        text,
        type: "paragraph",
      })),
    blockAtCursor: () => 1,
    goToBlock: vi.fn(() => true),
    setBlockMarks: vi.fn(),
  };
  return editor as typeof editor & MsEditor;
}

const call = (plugin: InstalledPlugin, method: string, params?: unknown) =>
  editorMethods(plugin)[method].handler(params);

const longer = pluginOf("longer");
let editor: ReturnType<typeof fakeEditor>;

beforeEach(() => {
  store.getState().setInitDir("/ws");
  store
    .getState()
    .upsertNotes([makeNote({ id: "/ws/a.md", title: "a", content: "x" })]);
  store.getState().setCurrentNoteId("/ws/a.md");
  editor = fakeEditor();
  setEditor("/ws/a.md", editor);
});

afterEach(() => setEditor("/ws/a.md", null));

describe("the editor for plugins", () => {
  it("all its methods ask notes:read", () => {
    for (const method of Object.values(editorMethods(longer)))
      expect(method.permission).toBe("notes:read");
  });

  it("says the note, the block of the cursor; null with no editor", () => {
    expect(call(longer, "editor.info")).toEqual({
      note: expect.objectContaining({ path: "a.md", title: "a" }),
      block: 1,
      blocks: 3,
    });
    setEditor("/ws/a.md", null);
    expect(call(longer, "editor.info")).toBeNull();
    expect(() => call(longer, "editor.blocks")).toThrow(
      "No note is open in the editor",
    );
  });

  it("gives the blocks from the cursor, or from a block", () => {
    expect(call(longer, "editor.blocks")).toEqual({
      blocks: [
        { index: 1, text: "two" },
        { index: 2, text: "three" },
      ],
    });
    expect(call(longer, "editor.blocks", { from: 0, count: 1 })).toEqual({
      blocks: [{ index: 0, text: "one" }],
      next: 1,
    });
  });

  it("puts the cursor at a block that is there", () => {
    expect(call(longer, "editor.goTo", { block: 2 })).toBe(true);
    expect(editor.goToBlock).toHaveBeenCalledWith(2);
    expect(() => call(longer, "editor.goTo", { block: 3 })).toThrow(
      "No block 3",
    );
    expect(() => call(longer, "editor.goTo", { block: "2" })).toThrow(
      "block should be the number of a block",
    );
  });

  it("marks blocks, with those of the other plugins; takes back its own", () => {
    const other = pluginOf("other");
    call(longer, "editor.mark", { block: 0, color: "red" });
    call(other, "editor.mark", { block: 2 });
    // the same block again: its color changed
    call(longer, "editor.mark", { block: 0, color: "blue" });
    expect(editor.setBlockMarks).toHaveBeenLastCalledWith([
      { index: 0, color: "#60a5fa4d" },
      { index: 2, color: "#facc154d" },
    ]);
    call(longer, "editor.clearMarks");
    expect(editor.setBlockMarks).toHaveBeenLastCalledWith([
      { index: 2, color: "#facc154d" },
    ]);
    expect(() =>
      call(longer, "editor.mark", { block: 0, color: "pink" }),
    ).toThrow("color should be one of");
  });

  it("forgets the marks of an editor gone: none in a new one", () => {
    call(longer, "editor.mark", { block: 0 });
    const again = fakeEditor();
    setEditor("/ws/a.md", again);
    call(longer, "editor.mark", { block: 1 });
    expect(again.setBlockMarks).toHaveBeenLastCalledWith([
      { index: 1, color: "#facc154d" },
    ]);
  });
});

describe("blocks", () => {
  it("are the paragraphs, headings and items of Markdown", () => {
    expect(markdownBlocks("# Title\n\nText **bold**.\n\n- a\n- b")).toEqual([
      { index: 0, text: "Title" },
      { index: 1, text: "Text bold." },
      { index: 2, text: "a" },
      { index: 3, text: "b" },
    ]);
  });

  it("are given 500 at most, from 0 at least", () => {
    const all = Array.from({ length: 600 }, (_, i) => i);
    expect(blocksFrom(all, -5, 2)).toEqual({ blocks: [0, 1], next: 2 });
    const big = blocksFrom(all, 0, 9999);
    expect(big.blocks).toHaveLength(500);
    expect(big.next).toBe(500);
    expect(blocksFrom(all, 598, 5)).toEqual({ blocks: [598, 599] });
  });
});
