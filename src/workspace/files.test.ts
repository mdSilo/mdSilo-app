import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  type Mock,
} from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { enterTauri, leaveTauri, mockInvoke } from "../testUtils";
import FileAPI from "./files";

describe("FileAPI (web)", () => {
  test("normalizes the file name", () => {
    expect(new FileAPI("C:\\notes\\a.md").fileName).toBe("C:/notes/a.md");
    expect(new FileAPI("/notes/a.md").parentDir).toBeUndefined();
  });

  test("joins parent dir and file name", () => {
    const file = new FileAPI("a.md", "/notes/");
    expect(file.fileName).toBe("/notes/a.md");
    expect(file.parentDir).toBe("/notes/");
  });

  test("readFile rejects outside Tauri", async () => {
    await expect(new FileAPI("/a.md").readFile()).rejects.toMatch(
      /not supported/,
    );
  });

  test("createFile and writeFile are no-ops outside Tauri", async () => {
    const file = new FileAPI("/a.md");
    await file.createFile();
    await file.writeFile("x");
    expect(invoke).not.toHaveBeenCalled();
  });

  test("exists/getBasename/getMetadata/isFile/deleteFiles invoke the backend", async () => {
    const file = new FileAPI("/a.md");
    mockInvoke(invoke, {
      file_exist: true,
      get_basename: ["a.md", true],
      get_file_meta: { file_name: "a.md" },
      is_file: true,
      delete_files: true,
    });
    await expect(file.exists()).resolves.toBe(true);
    await expect(file.getBasename()).resolves.toEqual(["a.md", true]);
    await expect(file.getMetadata()).resolves.toEqual({ file_name: "a.md" });
    await expect(file.isFile()).resolves.toBe(true);
    await expect(file.deleteFiles()).resolves.toBe(true);

    expect(invoke).toHaveBeenCalledWith("file_exist", { filePath: "/a.md" });
    expect(invoke).toHaveBeenCalledWith("get_basename", { filePath: "/a.md" });
    expect(invoke).toHaveBeenCalledWith("get_file_meta", { filePath: "/a.md" });
    expect(invoke).toHaveBeenCalledWith("is_file", { path: "/a.md" });
    expect(invoke).toHaveBeenCalledWith("delete_files", { paths: ["/a.md"] });
  });
});

describe("FileAPI (tauri)", () => {
  let TauriFileAPI: typeof FileAPI;
  let tauriInvoke: Mock;

  beforeEach(async () => {
    enterTauri();
    tauriInvoke = (await import("@tauri-apps/api/core")).invoke as Mock;
    mockInvoke(tauriInvoke, { get_data: { status: false } });
    TauriFileAPI = (await import("./files")).default;
  });

  afterEach(() => {
    leaveTauri();
  });

  test("readFile and readJSONFile", async () => {
    mockInvoke(tauriInvoke, { read_file: '{"a":1}' });
    const file = new TauriFileAPI("/a.json");
    await expect(file.readFile()).resolves.toBe('{"a":1}');
    await expect(file.readJSONFile()).resolves.toEqual({ a: 1 });
    expect(tauriInvoke).toHaveBeenCalledWith("read_file", {
      filePath: "/a.json",
    });
  });

  test("createFile creates parent dirs first", async () => {
    mockInvoke(tauriInvoke, { get_dirpath: "/notes" });
    await new TauriFileAPI("/notes/a.md").createFile();
    // skip the settings store loading / saving itself (get_data / set_data)
    const cmds = tauriInvoke.mock.calls
      .map((c) => c[0])
      .filter((c) => c !== "get_data" && c !== "set_data");
    expect(cmds).toEqual([
      "get_dirpath",
      "create_dir_recursive",
      "create_file",
    ]);
    expect(tauriInvoke).toHaveBeenCalledWith("create_dir_recursive", {
      dirPath: "/notes",
    });
    expect(tauriInvoke).toHaveBeenCalledWith("create_file", {
      filePath: "/notes/a.md",
    });
  });

  test("writeFile sends the text", async () => {
    await new TauriFileAPI("/notes/a.md").writeFile("hello");
    expect(tauriInvoke).toHaveBeenCalledWith("write_file", {
      filePath: "/notes/a.md",
      text: "hello",
    });
  });
});
