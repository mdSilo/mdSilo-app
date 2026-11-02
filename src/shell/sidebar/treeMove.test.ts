import { describe, expect, test, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { mockInvoke } from "@/testUtils";
import { canMoveTo, moveIntoDir, parentOf } from "./treeMove";

const calls = (cmd: string) =>
  vi.mocked(invoke).mock.calls.filter((c) => c[0] === cmd);

describe("treeMove", () => {
  test("parentOf is the dir of the path", () => {
    expect(parentOf("/n/sub/a.md")).toBe("/n/sub");
    expect(parentOf("C:\\n\\a.md")).toBe("C:/n");
    expect(parentOf("/a.md")).toBe("/");
  });

  test("canMoveTo refuses itself, its own dirs and where it is", () => {
    expect(canMoveTo("/n/a.md", "/n/sub")).toBe(true);
    expect(canMoveTo("/n/sub/a.md", "/n")).toBe(true);
    expect(canMoveTo("/n/sub", "/n/other")).toBe(true);
    expect(canMoveTo("/n/sub", "/n/subway")).toBe(true);
    expect(canMoveTo("/n/a.md", "/n")).toBe(false);
    expect(canMoveTo("/n/sub", "/n/sub")).toBe(false);
    expect(canMoveTo("/n/sub", "/n/sub/deep")).toBe(false);
  });

  test("moveIntoDir renames into the dir", async () => {
    mockInvoke(invoke, { file_exist: false, rename_file: true });
    await expect(moveIntoDir("/n/a.md", "/n/sub")).resolves.toBe("/n/sub/a.md");
    expect(calls("rename_file").at(-1)?.[1]).toEqual({
      fromPath: "/n/a.md",
      toPath: "/n/sub/a.md",
    });
  });

  test("moveIntoDir never moves over an existing one", async () => {
    vi.mocked(invoke).mockClear();
    mockInvoke(invoke, { file_exist: true, rename_file: true });
    await expect(moveIntoDir("/n/a.md", "/n/sub")).resolves.toBeUndefined();
    expect(calls("rename_file")).toHaveLength(0);
    expect(calls("msg_dialog")).toHaveLength(1);
  });

  test("moveIntoDir does nothing into its own dir", async () => {
    vi.mocked(invoke).mockClear();
    mockInvoke(invoke, { file_exist: false, rename_file: true });
    await expect(moveIntoDir("/n/sub", "/n/sub/deep")).resolves.toBeUndefined();
    expect(calls("rename_file")).toHaveLength(0);
  });
});
