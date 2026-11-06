import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { mockInvoke } from "../../testUtils";
import DirNewModal from "./DirNewModal";
import DirRenameModal from "./DirRenameModal";

const joinPaths = ({ root, parts }: Record<string, unknown>) =>
  [root, ...(parts as string[])].join("/");

describe("DirNewModal", () => {
  test("creates a subfolder with the typed name", async () => {
    mockInvoke(invoke, { join_paths: joinPaths });
    const handleClose = vi.fn();
    render(<DirNewModal dirPath="/n" isOpen handleClose={handleClose} />);
    await userEvent.type(
      await screen.findByPlaceholderText("New subfolder name"),
      "child",
    );
    await userEvent.click(screen.getByText("Create Subfolder"));
    await waitFor(() => expect(handleClose).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith("create_dir_recursive", {
      dirPath: "/n/child",
    });
  });
});

describe("DirRenameModal", () => {
  const renameHandlers = (exists = false, renamed = true) => ({
    join_paths: joinPaths,
    get_parent_dir: "/n",
    file_exist: exists,
    rename_file: renamed,
  });

  const rename = async (name: string) => {
    const handleClose = vi.fn();
    render(
      <DirRenameModal dirPath="/n/old" isOpen handleClose={handleClose} />,
    );
    if (name) {
      await userEvent.type(
        await screen.findByPlaceholderText("Rename folder"),
        name,
      );
    }
    await userEvent.click(screen.getByText("Rename Folder"));
    return handleClose;
  };

  test("renames the folder within its parent", async () => {
    mockInvoke(invoke, renameHandlers());
    const handleClose = await rename(" new ");
    await waitFor(() => expect(handleClose).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith("rename_file", {
      fromPath: "/n/old",
      toPath: "/n/new",
    });
  });

  test.each([
    ["", "Enter a folder name"],
    ["a/b", "A folder name can not contain / or \\"],
    ["..", "Not a valid folder name"],
  ])("refuses the name %j", async (name, msg) => {
    mockInvoke(invoke, renameHandlers());
    const handleClose = await rename(name);
    expect(await screen.findByText(msg)).toBeInTheDocument();
    expect(handleClose).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalledWith("rename_file", expect.anything());
  });

  test("never renames over an existing one", async () => {
    mockInvoke(invoke, renameHandlers(true));
    const handleClose = await rename("taken");
    expect(await screen.findByText("taken already exists")).toBeInTheDocument();
    expect(handleClose).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalledWith("rename_file", expect.anything());
  });

  test("tells when the rename fails", async () => {
    mockInvoke(invoke, renameHandlers(false, false));
    const handleClose = await rename("new");
    expect(
      await screen.findByText("Failed to rename the folder"),
    ).toBeInTheDocument();
    expect(handleClose).not.toHaveBeenCalled();
  });

  test("the same name just closes", async () => {
    mockInvoke(invoke, renameHandlers());
    const handleClose = await rename("old");
    await waitFor(() => expect(handleClose).toHaveBeenCalled());
    expect(invoke).not.toHaveBeenCalledWith("rename_file", expect.anything());
  });
});
