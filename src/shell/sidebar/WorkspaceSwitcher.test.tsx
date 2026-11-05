import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { store } from "@/state/store";
import WorkspaceSwitcher from "./WorkspaceSwitcher";

const reopenWorkspace = vi.fn(async (_dir: string) => {});
const onListDir = vi.fn(async () => {});
vi.mock("@/workspace/useOpen", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/workspace/useOpen")>()),
  reopenWorkspace: (dir: string) => reopenWorkspace(dir),
  onListDir: () => onListDir(),
}));

const open = async () => {
  // the menu is in a portal to #app-container
  render(
    <div id="app-container">
      <WorkspaceSwitcher />
    </div>,
  );
  await userEvent.click(screen.getByRole("button", { name: /notes/ }));
  return screen.getByTestId("workspace-list");
};
const row = (list: HTMLElement, dir: string) =>
  within(list).getByTitle(dir) as HTMLElement;

describe("WorkspaceSwitcher", () => {
  beforeEach(() => {
    reopenWorkspace.mockClear();
    store.getState().setInitDir("/a/notes");
    store.getState().setRecentDir(["/a/old", "/a/notes", "/a/work"]);
    store.getState().setPinnedDir("/a/old");
  });

  test("nothing without a workspace", () => {
    store.getState().setInitDir(undefined);
    const { container } = render(<WorkspaceSwitcher />);
    expect(container).toBeEmptyDOMElement();
  });

  test("the pinned folder first, then the latest; the current checked", async () => {
    const list = await open();
    const titles = within(list)
      .getAllByRole("menuitem")
      .map((el) => el.getAttribute("title"));
    expect(titles).toEqual(["/a/old", "/a/work", "/a/notes"]);
    expect(row(list, "/a/notes")).toHaveAttribute("aria-current", "true");
  });

  test("switches to another folder in place", async () => {
    const list = await open();
    await userEvent.click(row(list, "/a/work"));
    expect(reopenWorkspace).toHaveBeenCalledWith("/a/work");
    // not to the one open
    await userEvent.click(screen.getByRole("button", { name: /notes/ }));
    await userEvent.click(
      row(screen.getByTestId("workspace-list"), "/a/notes"),
    );
    expect(reopenWorkspace).toHaveBeenCalledTimes(1);
  });

  test("pins, unpins and removes without switching", async () => {
    const list = await open();
    await userEvent.click(
      within(row(list, "/a/work")).getByRole("button", { name: "Pin" }),
    );
    expect(store.getState().pinnedDir).toBe("/a/work");
    await userEvent.click(
      within(row(list, "/a/work")).getByRole("button", { name: "Unpin" }),
    );
    expect(store.getState().pinnedDir).toBe("");
    await userEvent.click(
      within(row(list, "/a/old")).getByRole("button", {
        name: "Remove from Recent",
      }),
    );
    expect(store.getState().recentDir).toEqual(["/a/notes", "/a/work"]);
    expect(reopenWorkspace).not.toHaveBeenCalled();
  });

  test("opens a folder, clears the recent ones but the current", async () => {
    await open();
    await userEvent.click(screen.getByText("Open Folder…"));
    expect(onListDir).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /notes/ }));
    await userEvent.click(screen.getByText("Clear Recent"));
    expect(store.getState().recentDir).toEqual(["/a/notes"]);
  });

  test("a folder of the workspace, the count; makes a subfolder there", async () => {
    store.getState().setCurrentDir("/a/notes/sub");
    render(
      <div id="app-container">
        <WorkspaceSwitcher count={3} />
      </div>,
    );
    const button = screen.getByRole("button", { name: /notes \/ sub/ });
    expect(button).toHaveTextContent("3");
    await userEvent.click(button);
    await userEvent.click(screen.getByText("New Subfolder"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
