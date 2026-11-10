import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import html2canvas from "html2canvas-pro";

vi.mock("html2canvas-pro", () => ({ default: vi.fn() }));
vi.mock("@/workspace/util", () => ({ isTauri: true }));

import { exportPdf, exportPng, PRINT_ROOT_ID } from "./useExport";

const printRoot = () => document.getElementById(PRINT_ROOT_ID);

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  const el = document.createElement("div");
  el.id = "note-content";
  el.innerHTML = '<div contenteditable="true"><p>Hello</p></div>';
  document.body.appendChild(el);
});

afterEach(() => {
  document.getElementById("note-content")?.remove();
  printRoot()?.remove();
});

describe("exportPdf", () => {
  test("does nothing without note content", async () => {
    document.getElementById("note-content")?.remove();
    await exportPdf("Title", false);
    expect(invoke).not.toHaveBeenCalled();
    expect(printRoot()).toBeNull();
  });

  test("prints a copy of the note, with its title, as text", async () => {
    await exportPdf("My Note", false);
    expect(invoke).toHaveBeenCalledWith("print_page");
    const root = printRoot()!;
    expect(root.parentElement).toBe(document.body);
    expect(root.getAttribute("data-theme")).toBe("mdsilo-light");
    expect(root.classList.contains("print-ink")).toBe(false);
    expect(root.querySelector(".print-title")?.textContent).toBe("My Note");
    expect(root.querySelector("p")?.textContent).toBe("Hello");
    // a copy: not a second #note-content, not editable
    expect(document.querySelectorAll("#note-content")).toHaveLength(1);
    expect(
      root.querySelector("[contenteditable]")?.getAttribute("contenteditable"),
    ).toBe("false");
  });

  test("prints in ink from a dark theme", async () => {
    await exportPdf("", true);
    const root = printRoot()!;
    expect(root.classList.contains("print-ink")).toBe(true);
    expect(root.querySelector(".print-title")).toBeNull();
  });

  test("the copy is gone after printing, one at a time", async () => {
    await exportPdf("a", false);
    await exportPdf("b", false);
    expect(document.querySelectorAll(`#${PRINT_ROOT_ID}`)).toHaveLength(1);
    window.dispatchEvent(new Event("afterprint"));
    expect(printRoot()).toBeNull();
  });

  test("the copy is gone when printing fails", async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error("no printer"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await exportPdf("a", false);
    expect(printRoot()).toBeNull();
    err.mockRestore();
  });
});

describe("exportPng", () => {
  beforeEach(() => {
    const canvas = {
      toBlob: (cb: (b: Blob) => void) =>
        cb(new Blob([new Uint8Array([0, 1, 2])], { type: "image/png" })),
    };
    vi.mocked(html2canvas).mockResolvedValue(
      canvas as unknown as HTMLCanvasElement,
    );
  });

  test("does nothing without note content", async () => {
    document.getElementById("note-content")?.remove();
    await exportPng("/notes/a.md");
    expect(html2canvas).not.toHaveBeenCalled();
  });

  test("saves the image beside the note, then says so", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(true);
    await exportPng("/notes/a.md");
    expect(invoke).toHaveBeenNthCalledWith(1, "download_file", {
      filePath: "/notes/a.png",
      blob: [0, 1, 2],
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "msg_dialog", {
      title: "Export",
      msg: "Saved to /notes/a.png",
    });
  });

  test("says when the image is not saved", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(false);
    await exportPng("/notes/a.md");
    expect(invoke).toHaveBeenLastCalledWith("msg_dialog", {
      title: "Export",
      msg: "Failed to save /notes/a.png",
    });
  });
});
