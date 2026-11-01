import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { store } from "@/state/store";
import { loadDir } from "@/workspace/open";
import BookWindow from "./BookWindow";

vi.mock("@/reader/components/ReaderView", () => ({
  default: () => <div data-testid="reader-stub" />,
}));
vi.mock("@/workspace/layout", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/workspace/layout")>()),
  resolveLayout: vi.fn(async () => "workspace"),
}));
vi.mock("@/workspace/open", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/workspace/open")>()),
  loadDir: vi.fn(async () => undefined),
}));

describe("BookWindow", () => {
  test("opens the workspace, then the book", async () => {
    render(<BookWindow path="/ws/reading/a.epub" ws="/ws" />);
    expect(await screen.findByTestId("reader-stub")).toBeInTheDocument();
    expect(store.getState().initDir).toBe("/ws");
    expect(store.getState().layout).toBe("workspace");
    expect(loadDir).toHaveBeenCalledWith("/ws");
    // kept as the last book, for the main window
    expect(store.getState().lastBooks).toEqual({ "/ws": "/ws/reading/a.epub" });
  });
});
