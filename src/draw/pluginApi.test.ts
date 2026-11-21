import { invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import { mockInvoke } from "@/testUtils";
import { workspaceMethods } from "@/plugins/workspaceApi";
import {
  listDrawingInfos,
  readDrawingFiles,
  writeDrawingFiles,
} from "./pluginApi";
import { onDrawingSaved, useDrawingReloads } from "./save";

vi.mock("@/workspace/open", () => ({
  openFilePaths: vi.fn(),
  addToListedDir: vi.fn(),
  openFilePath: vi.fn(),
}));
// Excalidraw does not run in jsdom: the scene as given, a picture of it
vi.mock("./render", () => ({
  renderScene: vi.fn(async (text: string) => {
    const data = JSON.parse(text) as { type?: string };
    if (data.type !== "excalidraw") throw new Error("not a scene");
    return { scene: `${text}\n`, svg: `<svg>${text.length}</svg>` };
  }),
}));

const files = new Map<string, string>();
const meta = (path: string, secs: number, dir = false) => ({
  file_path: path,
  is_dir: dir,
  is_file: !dir,
  is_hidden: false,
  last_modified: { secs_since_epoch: secs },
});
const SCENE = JSON.stringify({ type: "excalidraw", elements: [] });

beforeEach(() => {
  files.clear();
  files.set("/ws/drawing/A.excalidraw", SCENE);
  files.set("/ws/drawing/A.svg", "<svg/>");
  files.set("/ws/drawing/sub/B.excalidraw", SCENE);
  store.setState({ initDir: "/ws" });
  mockInvoke(invoke, {
    list_directory: ({ dir }: Record<string, unknown>) =>
      dir === "/ws/drawing"
        ? [
            meta("/ws/drawing/A.excalidraw", 100),
            meta("/ws/drawing/A.svg", 100),
            meta("/ws/drawing/sub", 0, true),
          ]
        : dir === "/ws/drawing/sub"
          ? [meta("/ws/drawing/sub/B.excalidraw", 200)]
          : [],
    file_exist: ({ filePath }: Record<string, unknown>) =>
      files.has(filePath as string),
    read_file: ({ filePath }: Record<string, unknown>) =>
      files.get(filePath as string),
    write_file: ({ filePath, text }: Record<string, unknown>) => {
      files.set(filePath as string, text as string);
      return true;
    },
    create_dir_recursive: true,
  });
});
afterEach(() => store.setState({ initDir: "" }));

describe("the drawings for plugins", () => {
  it("lists the drawings of drawing/ and its folders, last changed first", async () => {
    expect(await listDrawingInfos()).toEqual([
      {
        path: "drawing/sub/B.excalidraw",
        picture: "drawing/sub/B.svg",
        name: "B",
        updated: new Date(200_000).toISOString(),
      },
      {
        path: "drawing/A.excalidraw",
        picture: "drawing/A.svg",
        name: "A",
        updated: new Date(100_000).toISOString(),
      },
    ]);
  });

  it("reads a drawing and its picture", async () => {
    expect(await readDrawingFiles({ path: "drawing/A.excalidraw" })).toEqual({
      scene: SCENE,
      svg: "<svg/>",
    });
    // no picture yet: none
    expect(
      await readDrawingFiles({ path: "drawing/sub/B.excalidraw" }),
    ).toEqual({ scene: SCENE, svg: "" });
  });

  it("drawings only, in drawing/", async () => {
    for (const path of [
      "writing/a.md",
      "drawing/A.svg",
      "../drawing/A.excalidraw",
      "/ws/drawing/A.excalidraw",
      "other/A.excalidraw",
    ])
      await expect(readDrawingFiles({ path })).rejects.toThrow();
  });

  it("writes a drawing: its picture drawn again, the canvases and notes told", async () => {
    const saved = vi.fn();
    const stop = onDrawingSaved(saved);
    const before = useDrawingReloads.getState().seq;
    const scene = JSON.stringify({ type: "excalidraw", elements: [{}] });
    await writeDrawingFiles({ path: "drawing/A.excalidraw", scene });
    stop();
    expect(files.get("/ws/drawing/A.excalidraw")).toBe(`${scene}\n`);
    expect(files.get("/ws/drawing/A.svg")).toBe(`<svg>${scene.length}</svg>`);
    expect(useDrawingReloads.getState().seq).toBe(before + 1);
    expect(saved).toHaveBeenCalledWith("/ws/drawing/A.svg");
  });

  it("a new drawing with create only, not over a picture", async () => {
    await expect(
      writeDrawingFiles({ path: "drawing/New.excalidraw", scene: SCENE }),
    ).rejects.toThrow("No drawing");
    await writeDrawingFiles({
      path: "drawing/new/New.excalidraw",
      scene: SCENE,
      create: true,
    });
    expect(files.has("/ws/drawing/new/New.svg")).toBe(true);
    files.set("/ws/drawing/Taken.svg", "<svg/>");
    await expect(
      writeDrawingFiles({
        path: "drawing/Taken.excalidraw",
        scene: SCENE,
        create: true,
      }),
    ).rejects.toThrow("already exists");
  });

  it("not a scene: nothing written", async () => {
    await expect(
      writeDrawingFiles({ path: "drawing/A.excalidraw", scene: "{}" }),
    ).rejects.toThrow();
    expect(files.get("/ws/drawing/A.excalidraw")).toBe(SCENE);
  });

  it("each method behind its permission", () => {
    const methods = workspaceMethods(vi.fn());
    expect(methods["drawings.list"].permission).toBe("drawings:read");
    expect(methods["drawings.read"].permission).toBe("drawings:read");
    expect(methods["drawings.write"].permission).toBe("drawings:write");
  });
});
