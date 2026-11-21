import { invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import { mockInvoke } from "@/testUtils";
import { openFilePaths } from "@/workspace/open";
import {
  createDrawing,
  dirOfPath,
  drawingMarkdown,
  drawingName,
  drawingOfSvg,
  EMPTY_SCENE,
  EMPTY_SVG,
  isDrawingFile,
  newDrawingName,
  relativePath,
  svgOfDrawing,
} from "./drawing";

vi.mock("@/workspace/open", () => ({ openFilePaths: vi.fn() }));

describe("the files of a drawing", () => {
  it("a drawing and its picture", () => {
    expect(isDrawingFile("/ws/drawing/A.excalidraw")).toBe(true);
    expect(isDrawingFile("/ws/drawing/A.svg")).toBe(false);
    expect(svgOfDrawing("/ws/drawing/A b.excalidraw")).toBe(
      "/ws/drawing/A b.svg",
    );
    expect(drawingName("/ws/drawing/A b.excalidraw")).toBe("A b");
  });

  it("the drawing of a picture: an SVG in drawing/ only", () => {
    const root = "/ws/drawing";
    expect(drawingOfSvg("/ws/drawing/A.svg", root)).toBe(
      "/ws/drawing/A.excalidraw",
    );
    expect(drawingOfSvg("/ws/drawing/sub/A.SVG", root)).toBe(
      "/ws/drawing/sub/A.excalidraw",
    );
    expect(drawingOfSvg("/ws/writing/assets/A.svg", root)).toBeUndefined();
    expect(drawingOfSvg("/ws/drawing/A.png", root)).toBeUndefined();
    expect(drawingOfSvg("/ws/drawingx/A.svg", root)).toBeUndefined();
    expect(drawingOfSvg("/ws/drawing/A.svg", undefined)).toBeUndefined();
  });

  it("a name by the time", () => {
    expect(newDrawingName(new Date(2026, 10, 1, 9, 5))).toBe(
      "Drawing 2026-11-01 09.05",
    );
  });
});

describe("the link from a note", () => {
  it("relative to the dir of the note", () => {
    expect(relativePath("/ws/writing", "/ws/drawing/A.svg")).toBe(
      "../drawing/A.svg",
    );
    expect(relativePath("/ws/writing/a/b", "/ws/drawing/A.svg")).toBe(
      "../../../drawing/A.svg",
    );
    expect(relativePath("/ws", "/ws/drawing/A.svg")).toBe("drawing/A.svg");
    expect(relativePath("C:\\ws\\writing", "C:/ws/drawing/A.svg")).toBe(
      "../drawing/A.svg",
    );
  });

  it("the Markdown of the picture", () => {
    expect(
      drawingMarkdown("/ws/drawing/Plan [A].excalidraw", "/ws/writing"),
    ).toBe("![Plan A](../drawing/Plan%20%5BA%5D.svg)");
    expect(dirOfPath("/ws/writing/a.md")).toBe("/ws/writing");
  });
});

describe("createDrawing", () => {
  const files = new Map<string, string>();
  beforeEach(() => {
    files.clear();
    store.setState({ initDir: "/ws" });
    mockInvoke(invoke, {
      file_exist: ({ filePath }: Record<string, unknown>) =>
        files.has(filePath as string),
      write_file: ({ filePath, text }: Record<string, unknown>) => {
        files.set(filePath as string, text as string);
      },
      create_dir_recursive: true,
    });
  });
  afterEach(() => store.setState({ initDir: "" }));

  it("writes the drawing and its picture, in drawing/", async () => {
    const path = await createDrawing("Plan");
    expect(path).toBe("/ws/drawing/Plan.excalidraw");
    expect(JSON.parse(files.get(path) ?? "")).toEqual(EMPTY_SCENE);
    expect(files.get("/ws/drawing/Plan.svg")).toBe(EMPTY_SVG);
    expect(openFilePaths).toHaveBeenCalledWith([path, "/ws/drawing/Plan.svg"]);
  });

  it("by a name no drawing or picture has, the name made safe", async () => {
    files.set("/ws/drawing/a-b.excalidraw", "{}");
    files.set("/ws/drawing/a-b 2.svg", "<svg/>");
    expect(await createDrawing("a/b")).toBe("/ws/drawing/a-b 3.excalidraw");
  });

  it("no workspace, no drawing", async () => {
    store.setState({ initDir: "" });
    await expect(createDrawing()).rejects.toThrow("No workspace");
  });
});
