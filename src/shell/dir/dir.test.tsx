import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { mockInvoke } from "../../testUtils";
import DirNewModal from "./DirNewModal";

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
