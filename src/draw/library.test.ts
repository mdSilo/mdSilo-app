import { invoke } from "@tauri-apps/api/core";
import type { LibraryItems } from "@excalidraw/excalidraw/types";
import { mockInvoke } from "@/testUtils";
import { libraryAdapter, libraryPath } from "./library";

const files = new Map<string, string>();
const serialize = (items: LibraryItems) =>
  JSON.stringify({ type: "excalidrawlib", version: 2, libraryItems: items });
const item = { id: "a", status: "unpublished", elements: [], created: 1 };

beforeEach(() => {
  files.clear();
  mockInvoke(invoke, {
    file_exist: ({ filePath }: Record<string, unknown>) =>
      files.has(filePath as string),
    read_file: ({ filePath }: Record<string, unknown>) =>
      files.get(filePath as string),
    write_file: ({ filePath, text }: Record<string, unknown>) => {
      files.set(filePath as string, text as string);
    },
    create_dir_recursive: true,
  });
});

describe("the shape library", () => {
  it("in .mdsilo/ of the workspace", () => {
    expect(libraryPath("/ws")).toBe(
      "/ws/.mdsilo/drawing-library.excalidrawlib",
    );
    expect(libraryPath("")).toBeUndefined();
  });

  it("none yet, then saved and loaded", async () => {
    const adapter = libraryAdapter(serialize, "/ws");
    expect(await adapter.load({ source: "load" })).toBeNull();
    await adapter.save({ libraryItems: [item] as unknown as LibraryItems });
    expect(
      JSON.parse(files.get("/ws/.mdsilo/drawing-library.excalidrawlib")!),
    ).toMatchObject({ type: "excalidrawlib", libraryItems: [item] });
    expect(await adapter.load({ source: "load" })).toEqual({
      libraryItems: [item],
    });
  });

  it("a library of version 1, as excalidraw.com saved them", async () => {
    files.set(
      "/ws/.mdsilo/drawing-library.excalidrawlib",
      JSON.stringify({ type: "excalidrawlib", version: 1, library: [[]] }),
    );
    expect(
      await libraryAdapter(serialize, "/ws").load({ source: "load" }),
    ).toEqual({ libraryItems: [[]] });
  });

  it("no workspace: nothing", async () => {
    const adapter = libraryAdapter(serialize, "");
    expect(await adapter.load({ source: "load" })).toBeNull();
    await adapter.save({ libraryItems: [] });
    expect(files.size).toBe(0);
  });
});
