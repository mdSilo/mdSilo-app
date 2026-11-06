import { store } from "@/state/store";
import { activeStore, resetReaderStore } from "@/reader/readerStore";
import { setView, type FoliateView } from "@/reader/view";
import { addMark, clearMarks, useMarks } from "@/reader/marks";
import type { BookEntry } from "@/reader/library/library";
import { parseManifest } from "./manifest";
import type { InstalledPlugin } from "./registry";
import { onRelocated, readerInfo, readerMethods } from "./readerApi";

vi.mock("@/sync/api", () => ({ isSyncAvailable: false, syncInfo: vi.fn() }));

const plugin: InstalledPlugin = {
  id: "rsvp",
  dir: "/data/rsvp",
  where: "device",
  hash: "",
  manifest: parseManifest({
    id: "rsvp",
    name: "Speed Reading",
    version: "1.0.0",
    permissions: ["reader:read"],
  }),
};

const html = (body: string) =>
  new DOMParser().parseFromString(`<body>${body}</body>`, "text/html");

/** a view of a book of one section: a CFI is the text of its block */
function fakeView() {
  const view = {
    book: {
      sections: [
        { id: "s0", createDocument: async () => html("<p>a</p><p>b</p>") },
      ],
    },
    getCFI: (_i: number, range?: Range) =>
      range ? `epubcfi(/6/2!${range.toString()})` : "epubcfi(/6/2)",
    resolveNavigation: (cfi: string) =>
      cfi.startsWith("epubcfi(/6/2") ? { index: 0 } : undefined,
    goTo: vi.fn(async () => undefined),
  };
  return view as typeof view & FoliateView;
}

const call = (method: string, params?: unknown) =>
  readerMethods(plugin)[method].handler(params);

let view: ReturnType<typeof fakeView>;

beforeEach(() => {
  resetReaderStore();
  useMarks.setState({ marks: [] });
  store.getState().setInitDir("/ws");
  view = fakeView();
  setView(view, "main");
  activeStore().setState({
    path: "/ws/reading/Dune.epub",
    ws: "/ws",
    entry: {
      file: "reading/Dune.epub",
      title: "Dune",
      author: "Frank Herbert",
    } as BookEntry,
    location: {
      cfi: "epubcfi(/6/2)",
      fraction: 0.25,
      tocLabel: "Book One",
    } as never,
  });
});

afterEach(() => setView(null, "main"));

describe("the reader for plugins", () => {
  it("all its methods ask reader:read", () => {
    for (const method of Object.values(readerMethods(plugin)))
      expect(method.permission).toBe("reader:read");
  });

  it("says where the reader is, and null with no book", async () => {
    expect(await readerInfo()).toEqual({
      path: "reading/Dune.epub",
      title: "Dune",
      author: "Frank Herbert",
      chapter: "Book One",
      cfi: "epubcfi(/6/2)",
      fraction: 0.25,
    });
    setView(null, "main");
    expect(await readerInfo()).toBeNull();
  });

  it("gives the blocks of text from the page shown, or a place", async () => {
    expect(await call("reader.blocks")).toEqual({
      blocks: [
        { cfi: "epubcfi(/6/2!a)", text: "a" },
        { cfi: "epubcfi(/6/2!b)", text: "b" },
      ],
    });
    expect(await call("reader.blocks", { count: 1 })).toEqual({
      blocks: [{ cfi: "epubcfi(/6/2!a)", text: "a" }],
      next: "epubcfi(/6/2!b)",
    });
    await expect(call("reader.blocks", { from: "page 3" })).rejects.toThrow(
      "Not a place in the book: page 3",
    );
  });

  it("goes to a place, and marks text with the plugin as owner", async () => {
    expect(await call("reader.goTo", { cfi: "epubcfi(/6/2!b)" })).toBe(true);
    expect(view.goTo).toHaveBeenCalledWith("epubcfi(/6/2!b)");
    call("reader.mark", { cfi: "epubcfi(/6/2!a)" });
    call("reader.mark", { cfi: "epubcfi(/6/2!b)", color: "blue" });
    expect(useMarks.getState().marks).toEqual([
      { cfi: "epubcfi(/6/2!a)", color: "yellow", owner: "rsvp", pane: "main" },
      { cfi: "epubcfi(/6/2!b)", color: "blue", owner: "rsvp", pane: "main" },
    ]);
    expect(() =>
      call("reader.mark", { cfi: "epubcfi(/6/2!a)", color: "pink" }),
    ).toThrow("color should be one of");
    expect(() => call("reader.mark", { cfi: "epubcfi(/6/99)" })).toThrow(
      "Not a place in the book",
    );
  });

  it("takes back its own marks only", () => {
    addMark({
      cfi: "epubcfi(/6/2!a)",
      color: "yellow",
      owner: "quote",
      pane: "main",
    });
    call("reader.mark", { cfi: "epubcfi(/6/2!b)" });
    call("reader.clearMarks");
    expect(useMarks.getState().marks.map((m) => m.owner)).toEqual(["quote"]);
  });

  it("can do nothing with no book open", async () => {
    setView(null, "main");
    await expect(call("reader.blocks")).rejects.toThrow("No book is open");
    expect(() => call("reader.mark", { cfi: "epubcfi(/6/2!a)" })).toThrow(
      "No book is open",
    );
  });

  it("tells when the page shown changes", () => {
    const changed = vi.fn();
    const off = onRelocated(changed);
    activeStore().setState({ location: { cfi: "epubcfi(/6/4)" } as never });
    expect(changed).toHaveBeenCalledTimes(1);
    off();
    activeStore().setState({ location: { cfi: "epubcfi(/6/6)" } as never });
    expect(changed).toHaveBeenCalledTimes(1);
  });
});

describe("marks", () => {
  it("one per text and owner; taken back by owner or by pane", () => {
    addMark({ cfi: "x", color: "yellow", owner: "a", pane: "main" });
    addMark({ cfi: "x", color: "red", owner: "a", pane: "main" });
    addMark({ cfi: "x", color: "blue", owner: "b", pane: "side" });
    expect(useMarks.getState().marks).toEqual([
      { cfi: "x", color: "red", owner: "a", pane: "main" },
      { cfi: "x", color: "blue", owner: "b", pane: "side" },
    ]);
    clearMarks({ pane: "side" });
    expect(useMarks.getState().marks.map((m) => m.owner)).toEqual(["a"]);
    clearMarks({ owner: "a" });
    expect(useMarks.getState().marks).toEqual([]);
  });
});
