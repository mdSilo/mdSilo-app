import { invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import { NoteMap } from "@/lib/noteMap";
import { makeNote, mockInvoke } from "@/testUtils";
import { writeFile } from "@/workspace/write";
import { useNoteReloads } from "@/workspace/noteReloads";
import { renamePath } from "@/workspace/renamePath";
import {
  drawingRenameOptions,
  followDrawingRename,
  isDrawingRename,
  pairOf,
  relinkPicture,
} from "./rename";

vi.mock("@/workspace/write", () => ({ writeFile: vi.fn(async () => {}) }));
vi.mock("@/workspace/open", () => ({
  openFilePaths: vi.fn(),
  loadDir: vi.fn(),
}));

describe("the files of a drawing, together", () => {
  it("pairs a drawing and its picture", () => {
    expect(pairOf("/ws/drawing/A.excalidraw")).toBe("/ws/drawing/A.svg");
    expect(pairOf("/ws/drawing/A.svg")).toBe("/ws/drawing/A.excalidraw");
    expect(pairOf("/ws/writing/a.md")).toBeUndefined();
  });

  it("a rename of a drawing, or of the picture of one", () => {
    store.setState({ initDir: "/ws" });
    expect(
      isDrawingRename("/ws/drawing/A.excalidraw", "/ws/drawing/B.excalidraw"),
    ).toBe(true);
    expect(isDrawingRename("/ws/drawing/A.svg", "/ws/drawing/B.svg")).toBe(
      true,
    );
    // an SVG elsewhere is just a picture
    expect(
      isDrawingRename("/ws/writing/assets/a.svg", "/ws/writing/assets/b.svg"),
    ).toBe(false);
    expect(isDrawingRename("/ws/writing/a.md", "/ws/writing/b.md")).toBe(false);
  });
});

describe("relinkPicture", () => {
  const relink = (md: string, dir = "/ws/writing") =>
    relinkPicture(
      md,
      dir,
      "/ws/writing",
      "/ws/drawing/Plan A.svg",
      "/ws/drawing/sub/Plan B.svg",
    );

  it("the links to the picture, relative to the note", () => {
    expect(relink("see ![Plan](../drawing/Plan%20A.svg) here")).toBe(
      "see ![Plan](../drawing/sub/Plan%20B.svg) here",
    );
    expect(
      relink('![P](<../../drawing/Plan A.svg> "title")', "/ws/writing/x"),
    ).toBe('![P](../../drawing/sub/Plan%20B.svg "title")');
  });

  it("the other images and links stay", () => {
    const md =
      "![a](./assets/Plan%20A.svg) [link](../drawing/Plan%20A.svg) ![b](../drawing/Other.svg)";
    expect(relink(md)).toBe(md);
  });
});

describe("followDrawingRename", () => {
  const files = new Set<string>();
  const note = makeNote({
    id: "/ws/writing/n.md",
    title: "n",
    content: "![Plan](../drawing/Plan.svg)\n",
  });

  beforeEach(() => {
    vi.mocked(writeFile).mockClear();
    files.clear();
    store.setState({
      initDir: "/ws",
      isLoaded: true,
      besideDrawing: "/ws/drawing/Plan.excalidraw",
    });
    store.getState().setNotes(NoteMap.from({ [note.id]: note }));
    mockInvoke(invoke, {
      file_exist: ({ filePath }: Record<string, unknown>) =>
        files.has(filePath as string),
      rename_file: ({ fromPath, toPath }: Record<string, unknown>) => {
        files.delete(fromPath as string);
        files.add(toPath as string);
        return true;
      },
    });
  });
  afterEach(() => store.setState({ initDir: "", besideDrawing: "" }));

  it("the picture renamed with the drawing, the notes and the drawing open follow", async () => {
    // the drawing renamed already, its picture not yet
    files.add("/ws/drawing/New.excalidraw");
    files.add("/ws/drawing/Plan.svg");
    expect(
      await followDrawingRename(
        "/ws/drawing/Plan.excalidraw",
        "/ws/drawing/New.excalidraw",
      ),
    ).toEqual({
      from: "/ws/drawing/Plan.excalidraw",
      to: "/ws/drawing/New.excalidraw",
    });
    expect([...files].sort()).toEqual([
      "/ws/drawing/New.excalidraw",
      "/ws/drawing/New.svg",
    ]);
    expect(writeFile).toHaveBeenCalledWith(
      note.id,
      "![Plan](../drawing/New.svg)\n",
    );
    expect(store.getState().notes.get(note.id)?.content).toBe(
      "![Plan](../drawing/New.svg)\n",
    );
    expect(store.getState().besideDrawing).toBe("/ws/drawing/New.excalidraw");

    // seen again (the watcher): nothing more
    vi.mocked(writeFile).mockClear();
    await followDrawingRename("/ws/drawing/Plan.svg", "/ws/drawing/New.svg");
    expect([...files].sort()).toEqual([
      "/ws/drawing/New.excalidraw",
      "/ws/drawing/New.svg",
    ]);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("the drawing moved with its picture, not over another file", async () => {
    files.add("/ws/drawing/Plan.excalidraw");
    files.add("/ws/drawing/sub/Plan.svg");
    // its picture moved; the drawing there would be taken: it stays
    files.add("/ws/drawing/sub/Plan.excalidraw");
    await followDrawingRename(
      "/ws/drawing/Plan.svg",
      "/ws/drawing/sub/Plan.svg",
    );
    expect(files.has("/ws/drawing/Plan.excalidraw")).toBe(true);
    // the picture followed in the notes; the drawing open stays where it is
    expect(store.getState().notes.get(note.id)?.content).toBe(
      "![Plan](../drawing/sub/Plan.svg)\n",
    );
    expect(store.getState().besideDrawing).toBe("/ws/drawing/Plan.excalidraw");
  });

  it("renamed in the app: both files, never over another file", async () => {
    files.add("/ws/drawing/Plan.excalidraw");
    files.add("/ws/drawing/Plan.svg");
    files.add("/ws/drawing/Taken.svg");
    const rename = (name: string) =>
      renamePath("/ws/drawing/Plan.excalidraw", name, {
        ...drawingRenameOptions("/ws/drawing/Plan.excalidraw"),
        ext: ".excalidraw",
      });
    expect(await rename("Taken")).toBe("Taken.svg already exists");
    expect(files.has("/ws/drawing/Plan.excalidraw")).toBe(true);

    expect(await rename("Done")).toBeUndefined();
    expect([...files].sort()).toEqual([
      "/ws/drawing/Done.excalidraw",
      "/ws/drawing/Done.svg",
      "/ws/drawing/Taken.svg",
    ]);
    expect(store.getState().notes.get(note.id)?.content).toBe(
      "![Plan](../drawing/Done.svg)\n",
    );
    expect(store.getState().besideDrawing).toBe("/ws/drawing/Done.excalidraw");
  });

  it("a note open: its editor shown again, with the new link", async () => {
    files.add("/ws/drawing/Plan.excalidraw");
    files.add("/ws/drawing/Plan.svg");
    store.setState({ currentNote: { [note.id]: note } });
    const before = useNoteReloads.getState().seq;
    await renamePath("/ws/drawing/Plan.svg", "Open", {
      ...drawingRenameOptions("/ws/drawing/Plan.svg"),
      ext: ".svg",
    });
    expect(store.getState().currentNote[note.id]?.content).toBe(
      "![Plan](../drawing/Open.svg)\n",
    );
    expect(useNoteReloads.getState().seq).toBe(before + 1);
    expect(files.has("/ws/drawing/Open.excalidraw")).toBe(true);
    store.setState({ currentNote: {} });
  });
});
