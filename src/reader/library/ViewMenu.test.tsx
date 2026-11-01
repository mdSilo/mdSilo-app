import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { store } from "@/state/store";
import ViewMenu from "./ViewMenu";

const openMenu = () =>
  userEvent.click(
    document.querySelector('[aria-haspopup="menu"]') as HTMLElement,
  );

const windows = vi.hoisted(() => ({ canOpenBookWindow: false }));
vi.mock("@/shell/windows", () => ({
  get canOpenBookWindow() {
    return windows.canOpenBookWindow;
  },
}));

describe("ViewMenu", () => {
  test("where books open: where there can be book windows", async () => {
    const { unmount } = render(
      <div id="app-container">
        <ViewMenu onGroupBy={vi.fn()} />
      </div>,
    );
    await openMenu();
    expect(screen.getByText("Order")).toBeInTheDocument();
    expect(screen.queryByText("Open books in")).toBeNull();
    unmount();

    windows.canOpenBookWindow = true;
    render(
      <div id="app-container">
        <ViewMenu onGroupBy={vi.fn()} />
      </div>,
    );
    await openMenu();
    await userEvent.click(screen.getByText("A new window"));
    expect(store.getState().librarySettings).toMatchObject({
      openIn: "window",
    });
  });
});
