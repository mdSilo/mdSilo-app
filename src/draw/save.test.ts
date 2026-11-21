import { writeFile } from "@/workspace/write";
import { EMPTY_SVG } from "./drawing";
import {
  DrawingSaver,
  flushDrawings,
  onDrawingSaved,
  sceneKey,
  svgOfScene,
  type SaveApi,
  type Scene,
} from "./save";

vi.mock("@/workspace/write", () => ({ writeFile: vi.fn(async () => {}) }));

const api: SaveApi = {
  serializeAsJSON: vi.fn((elements) =>
    JSON.stringify({ type: "excalidraw", elements }),
  ) as unknown as SaveApi["serializeAsJSON"],
  exportScene: vi.fn(async () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("id", "drawn");
    return svg;
  }) as unknown as SaveApi["exportScene"],
  getSceneVersion: ((elements: readonly { version: number }[]) =>
    elements.reduce((n, e) => n + e.version, 0)) as SaveApi["getSceneVersion"],
};

const scene = (version: number, deleted = false, bg = "#fff"): Scene =>
  ({
    elements: [{ id: "a", version, isDeleted: deleted }],
    appState: { viewBackgroundColor: bg },
    files: {},
  }) as unknown as Scene;

const written = () =>
  Object.fromEntries(
    vi.mocked(writeFile).mock.calls.map(([path, text]) => [path, text]),
  );

beforeEach(() => {
  vi.mocked(writeFile).mockClear();
});

describe("the key of a scene", () => {
  it("changes with the elements, the background, not the view", () => {
    expect(sceneKey(api, scene(1))).toBe(sceneKey(api, scene(1)));
    expect(sceneKey(api, scene(2))).not.toBe(sceneKey(api, scene(1)));
    expect(sceneKey(api, scene(1, false, "#000"))).not.toBe(
      sceneKey(api, scene(1)),
    );
  });
});

describe("svgOfScene", () => {
  it("the picture of the elements left", async () => {
    expect(await svgOfScene(api, scene(1))).toContain('id="drawn"');
    expect(await svgOfScene(api, scene(1, true))).toBe(EMPTY_SVG);
  });
});

describe("DrawingSaver", () => {
  it("saves nothing as loaded, the drawing and its picture once changed", async () => {
    const saver = new DrawingSaver(api, "/ws/drawing/A.excalidraw", 10_000);
    saver.loaded(scene(1));
    saver.change(scene(1));
    await saver.flush();
    expect(writeFile).not.toHaveBeenCalled();

    const saved = vi.fn();
    const stop = onDrawingSaved(saved);
    const share = vi.fn();
    const shared = new DrawingSaver(
      api,
      "/ws/drawing/A.excalidraw",
      10_000,
      share,
    );
    shared.loaded(scene(1));
    shared.change(scene(2));
    await shared.flush();
    stop();
    const files = written();
    expect(JSON.parse(files["/ws/drawing/A.excalidraw"])).toMatchObject({
      type: "excalidraw",
    });
    expect(files["/ws/drawing/A.svg"]).toContain('id="drawn"');
    expect(saved).toHaveBeenCalledWith("/ws/drawing/A.svg");
    expect(share).toHaveBeenCalledWith("/ws/drawing/A.svg");
    await shared.close();
  });

  it("saves once the changes pause", async () => {
    vi.useFakeTimers();
    try {
      const saver = new DrawingSaver(api, "/ws/drawing/B.excalidraw", 500);
      saver.loaded(scene(1));
      saver.change(scene(2));
      saver.change(scene(3));
      await vi.advanceTimersByTimeAsync(400);
      expect(writeFile).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(2000);
      expect(Object.keys(written())).toEqual(
        expect.arrayContaining([
          "/ws/drawing/B.excalidraw",
          "/ws/drawing/B.svg",
        ]),
      );
      await saver.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("the drawings open saved now by flushDrawings", async () => {
    const saver = new DrawingSaver(api, "/ws/drawing/C.excalidraw", 60_000);
    saver.loaded(scene(1));
    saver.change(scene(5));
    await flushDrawings();
    expect(written()["/ws/drawing/C.excalidraw"]).toBeDefined();
    await saver.close();
  });
});
