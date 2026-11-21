import { render, screen, fireEvent } from "@testing-library/react";
import { store } from "@/state/store";
import { viewEffects } from "@/state/viewReducer";
import { ProvideCurrentView } from "@/state/useCurrentView";
import BesideDrawing from "./BesideDrawing";
import { closeBesideDrawing, expandBesideDrawing, openDrawing } from "./open";

// Excalidraw does not run in jsdom: the canvas, by its path
vi.mock("./DrawCanvas", () => ({
  default: ({ path, actions }: { path: string; actions?: React.ReactNode }) => (
    <div data-testid="canvas">
      {path}
      {actions}
    </div>
  ),
}));

const note = { view: "md", params: { noteId: "/ws/writing/a.md" } } as const;

beforeEach(() => {
  store.setState({ besideDrawing: "", besideNoteId: "", initDir: "/ws" });
});

describe("openDrawing", () => {
  it("beside a note, the note beside leaving", async () => {
    viewEffects(note);
    store.setState({ besideNoteId: "/ws/writing/b.md" });
    const dispatch = vi.fn();
    await openDrawing("/ws/drawing/A.excalidraw", dispatch, "auto");
    expect(store.getState().besideDrawing).toBe("/ws/drawing/A.excalidraw");
    expect(store.getState().besideNoteId).toBe("");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("as the view elsewhere, or when asked", async () => {
    viewEffects({ view: "feed" });
    const dispatch = vi.fn();
    await openDrawing("/ws/drawing/A.excalidraw", dispatch, "beside");
    expect(dispatch).toHaveBeenCalledWith({
      view: "drawing",
      path: "/ws/drawing/A.excalidraw",
    });
    viewEffects(note);
    store.setState({ besideDrawing: "/ws/drawing/B.excalidraw" });
    await openDrawing("/ws/drawing/A.excalidraw", dispatch, "view");
    expect(store.getState().besideDrawing).toBe("");
  });

  it("no window in the browser: beside instead", async () => {
    viewEffects(note);
    await openDrawing("/ws/drawing/A.excalidraw", vi.fn(), "window");
    expect(store.getState().besideDrawing).toBe("/ws/drawing/A.excalidraw");
  });

  it("the drawing beside shown alone, or closed", () => {
    const dispatch = vi.fn();
    store.setState({ besideDrawing: "/ws/drawing/A.excalidraw" });
    expandBesideDrawing(dispatch);
    expect(dispatch).toHaveBeenCalledWith({
      view: "drawing",
      path: "/ws/drawing/A.excalidraw",
    });
    expect(store.getState().besideDrawing).toBe("");
    store.setState({ besideDrawing: "/ws/drawing/A.excalidraw" });
    closeBesideDrawing();
    expect(store.getState().besideDrawing).toBe("");
  });
});

describe("BesideDrawing", () => {
  it("the canvas of the drawing beside, closed from its bar", async () => {
    store.setState({ besideDrawing: "/ws/drawing/A.excalidraw" });
    render(
      <ProvideCurrentView>
        <BesideDrawing />
      </ProvideCurrentView>,
    );
    expect(await screen.findByTestId("canvas")).toHaveTextContent(
      "/ws/drawing/A.excalidraw",
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(store.getState().besideDrawing).toBe("");
  });
});
