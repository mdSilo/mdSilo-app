import { invoke } from "@tauri-apps/api/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { store, useStore } from "@/state/store";
import { NoteMap } from "@/lib/noteMap";
import { mockInvoke } from "@/testUtils";
import DrawingName from "./DrawingName";

vi.mock("@/workspace/write", () => ({ writeFile: vi.fn(async () => {}) }));
vi.mock("@/workspace/open", () => ({
  openFilePaths: vi.fn(),
  loadDir: vi.fn(),
}));

const files = new Set<string>();

beforeEach(() => {
  files.clear();
  files.add("/ws/drawing/Plan.excalidraw");
  files.add("/ws/drawing/Plan.svg");
  files.add("/ws/drawing/Taken.svg");
  store.setState({
    initDir: "/ws",
    isLoaded: true,
    besideDrawing: "/ws/drawing/Plan.excalidraw",
  });
  store.getState().setNotes(NoteMap.from({}));
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

/** The name of the drawing beside, as the bar of its canvas shows it */
function Beside() {
  const path = useStore((s) => s.besideDrawing);
  return path ? <DrawingName path={path} /> : null;
}

describe("DrawingName", () => {
  it("renames the drawing from its name, its picture with it", async () => {
    render(<Beside />);
    await userEvent.click(screen.getByRole("button", { name: "Plan" }));
    const field = screen.getByRole("textbox", { name: "Rename the drawing" });
    await userEvent.clear(field);
    await userEvent.type(field, "My plan{Enter}");
    await waitFor(() =>
      expect(store.getState().besideDrawing).toBe(
        "/ws/drawing/My plan.excalidraw",
      ),
    );
    expect(files.has("/ws/drawing/My plan.svg")).toBe(true);
    expect(
      await screen.findByRole("button", { name: "My plan" }),
    ).toBeInTheDocument();
  });

  it("tells why not, and Escape keeps the name", async () => {
    render(<Beside />);
    await userEvent.click(screen.getByRole("button", { name: "Plan" }));
    const field = screen.getByRole("textbox", { name: "Rename the drawing" });
    await userEvent.clear(field);
    await userEvent.type(field, "Taken{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Taken.svg already exists",
    );
    expect(files.has("/ws/drawing/Plan.excalidraw")).toBe(true);
    fireEvent.keyDown(field, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Plan" })).toBeInTheDocument();
  });
});
