import { afterEach, describe, expect, test, vi } from "vitest";
import { store } from "./store";
import { announce, onAnnounce, shareSettings } from "./windowSync";

type Handler = (event: { payload: unknown }) => void;
const bus = vi.hoisted(() => ({
  handlers: new Map<string, Set<(event: { payload: unknown }) => void>>(),
  emitted: [] as [string, unknown][],
}));

vi.mock("@/workspace/util", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/workspace/util")>()),
  isTauri: true,
  isWeb: false,
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ label: "main", setTitle: async () => undefined }),
}));
vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(async (event: string, payload: unknown) => {
    bus.emitted.push([event, payload]);
  }),
  listen: vi.fn(async (event: string, handler: Handler) => {
    const set = bus.handlers.get(event) ?? new Set();
    set.add(handler);
    bus.handlers.set(event, set);
    return () => set.delete(handler);
  }),
}));

const deliver = (event: string, payload: unknown) =>
  bus.handlers.get(event)?.forEach((handler) => handler({ payload }));

afterEach(() => {
  bus.emitted.length = 0;
});

describe("shareSettings", () => {
  test("gives the shared settings changed here", () => {
    const stop = shareSettings();
    store.getState().setReaderSidebarWidth(300);
    store.getState().setTheme("dracula");
    expect(bus.emitted).toEqual([
      [
        "mdsilo://settings",
        { from: "main", values: { readerSidebarWidth: 300 } },
      ],
    ]);
    stop();
    store.getState().setReaderSidebarWidth(320);
    expect(bus.emitted).toHaveLength(1);
  });

  test("takes those of the other windows, w/o giving them back", async () => {
    const stop = shareSettings();
    await Promise.resolve();
    deliver("mdsilo://settings", {
      from: "book-1",
      values: { lastBooks: { "/ws": "/ws/a.epub" } },
    });
    expect(store.getState().lastBooks).toEqual({ "/ws": "/ws/a.epub" });
    deliver("mdsilo://settings", { from: "main", values: { lastBooks: {} } });
    expect(store.getState().lastBooks).toEqual({ "/ws": "/ws/a.epub" });
    expect(bus.emitted).toEqual([]);
    stop();
  });
});

describe("announce", () => {
  test("tells the other windows what was written", () => {
    const fn = vi.fn();
    const stop = onAnnounce("issues", fn);
    announce("issues", "/ws");
    expect(bus.emitted).toEqual([
      ["mdsilo://data", { from: "main", kind: "issues", dir: "/ws" }],
    ]);
    // from here, or of another kind: not for it
    deliver("mdsilo://data", { from: "main", kind: "issues", dir: "/ws" });
    deliver("mdsilo://data", { from: "book-1", kind: "library", dir: "/ws" });
    expect(fn).not.toHaveBeenCalled();
    deliver("mdsilo://data", { from: "book-1", kind: "issues", dir: "/ws" });
    expect(fn).toHaveBeenCalledWith("/ws");
    stop();
  });
});
