import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { mockInvoke } from "../../testUtils";
import RenameModal from "./RenameModal";

const renderModal = (path: string, keepExt = false) => {
  const handleClose = vi.fn();
  render(
    <RenameModal
      path={path}
      title="Rename it"
      keepExt={keepExt}
      isOpen
      handleClose={handleClose}
    />,
  );
  return handleClose;
};

const typeName = async (name: string) => {
  const input = await screen.findByLabelText("New name");
  await userEvent.clear(input);
  if (name) await userEvent.type(input, name);
  await userEvent.click(screen.getByText("Rename"));
};

describe("RenameModal", () => {
  test("the name to edit, the extension kept", async () => {
    renderModal("/n/a.md", true);
    expect(await screen.findByLabelText("New name")).toHaveValue("a");
    expect(screen.getByText(".md")).toBeInTheDocument();
  });

  test("renames in its dir", async () => {
    mockInvoke(invoke, { file_exist: false, rename_file: true });
    const handleClose = renderModal("/n/old.md", true);
    await typeName("new");
    await waitFor(() => expect(handleClose).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith("rename_file", {
      fromPath: "/n/old.md",
      toPath: "/n/new.md",
    });
  });

  test.each([
    ["", "Enter a name"],
    ["a/b", 'A name can not contain \\ / : * ? " < > |'],
  ])("refuses the name %j", async (name, msg) => {
    mockInvoke(invoke, { file_exist: false, rename_file: true });
    const handleClose = renderModal("/n/old");
    await typeName(name);
    expect(await screen.findByText(msg)).toBeInTheDocument();
    expect(handleClose).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalledWith("rename_file", expect.anything());
  });

  test("never over an existing one", async () => {
    mockInvoke(invoke, { file_exist: true, rename_file: true });
    const handleClose = renderModal("/n/old");
    await typeName("taken");
    expect(await screen.findByText("taken already exists")).toBeInTheDocument();
    expect(handleClose).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalledWith("rename_file", expect.anything());
  });

  test("tells when the rename fails", async () => {
    mockInvoke(invoke, { file_exist: false, rename_file: false });
    const handleClose = renderModal("/n/old");
    await typeName("new");
    expect(await screen.findByText("Failed to rename")).toBeInTheDocument();
    expect(handleClose).not.toHaveBeenCalled();
  });
});
