import { invoke } from "@tauri-apps/api/core";
import { act, renderHook } from "@testing-library/react";
import { store } from "@/state/store";
import { mockInvoke } from "@/testUtils";
import {
  fileSrcOf,
  imageFileOf,
  refreshPicture,
  useNoteDrawings,
} from "./noteDrawings";

vi.mock("@/workspace/open", () => ({ openFilePaths: vi.fn() }));

describe("imageFileOf", () => {
  it("resolves as the editor does", () => {
    const dir = "/ws/writing/a";
    const root = "/ws/writing";
    expect(imageFileOf("../../drawing/P%20A.svg", dir, root)).toBe(
      "/ws/drawing/P A.svg",
    );
    expect(imageFileOf("./assets/x.png", dir, root)).toBe(
      "/ws/writing/assets/x.png",
    );
    expect(imageFileOf("/abs/x.svg", dir, root)).toBe("/abs/x.svg");
    expect(imageFileOf("https://e.com/x.svg", dir, root)).toBeUndefined();
    expect(imageFileOf("x.svg", undefined, undefined)).toBeUndefined();
  });
});

describe("the pictures refreshed", () => {
  it("the images of the picture load it again, by a new URL", () => {
    const path = "/ws/drawing/R.svg";
    const before = fileSrcOf(path);
    document.body.innerHTML = `<img src="${before}"><img src="${fileSrcOf("/ws/other.svg")}">`;
    refreshPicture(path);
    const [mine, other] = document.querySelectorAll("img");
    expect(mine.getAttribute("src")).toBe(`${before}?v=1`);
    expect(other.getAttribute("src")).not.toContain("v=");
    // shown later: the new URL too
    expect(fileSrcOf(path)).toBe(`${before}?v=1`);
    refreshPicture(path);
    expect(mine.getAttribute("src")).toBe(`${before}?v=2`);
  });
});

describe("useNoteDrawings", () => {
  beforeEach(() => {
    store.setState({ initDir: "/ws", besideDrawing: "" });
    mockInvoke(invoke, {
      file_exist: false,
      write_file: undefined,
      create_dir_recursive: true,
    });
  });
  afterEach(() => store.setState({ initDir: "", besideDrawing: "" }));

  it("the pictures of drawings edited, beside", () => {
    const dispatch = vi.fn();
    const { result } = renderHook(() =>
      useNoteDrawings("/ws/writing", "/ws/writing", dispatch),
    );
    expect(result.current.isEditableImage("../drawing/A.svg")).toBe(true);
    expect(result.current.isEditableImage("./assets/A.svg")).toBe(false);
    act(() => result.current.onEditImage("../drawing/A.svg"));
    // the view is not a note here: shown as the view
    expect(dispatch).toHaveBeenCalledWith({
      view: "drawing",
      path: "/ws/drawing/A.excalidraw",
    });
  });

  it("a new drawing: its picture to insert", async () => {
    const { result } = renderHook(() =>
      useNoteDrawings("/ws/writing/sub", "/ws/writing", vi.fn()),
    );
    const picture = await result.current.onCreateDrawing();
    expect(picture?.src).toMatch(/^\.\.\/\.\.\/drawing\/Drawing%20.*\.svg$/);
    expect(picture?.alt).toMatch(/^Drawing /);
  });
});
