import { store } from "@/state/store";
import { makeNote } from "@/testUtils";
import { activeStore, resetReaderStore } from "@/reader/readerStore";
import type { BookEntry } from "@/reader/library/library";
import { parseManifest, type Permission } from "./manifest";
import { enablePlugin, type InstalledPlugin } from "./registry";
import { bookContext, noteContext, viewContext } from "./context";

const pluginWith = (
  permissions: Permission[],
  mode?: "trusted",
): InstalledPlugin => ({
  id: "card",
  dir: "/data/card",
  where: "device",
  hash: "",
  manifest: parseManifest({
    id: "card",
    name: "Card",
    version: "1.0.0",
    permissions,
    ...(mode ? { mode } : {}),
  }),
});

const entry = {
  hash: "h",
  file: "reading/Dune.epub",
  title: "Dune",
  author: "Frank Herbert",
  format: "EPUB",
  addedAt: "2026-01-01",
} as BookEntry;

const openBook = (patch: Record<string, unknown> = {}) =>
  activeStore().setState({
    path: "/ws/reading/Dune.epub",
    ws: "/ws",
    entry,
    location: {
      cfi: "epubcfi(/6/8!/4/2)",
      tocLabel: "Book One",
    } as never,
    ...patch,
  });

beforeEach(() => {
  resetReaderStore();
  store.getState().setInitDir("/ws");
  store
    .getState()
    .upsertNotes([
      makeNote({ id: "/ws/a.md", title: "a", content: "x #idea# " }),
    ]);
});

describe("noteContext", () => {
  it("gives the note to a plugin that may read notes only", () => {
    const plugin = pluginWith(["notes:read"]);
    store.setState({ installedPlugins: [plugin], pluginStates: {} });
    enablePlugin(plugin, []);
    expect(noteContext(plugin, "/ws/a.md")).toEqual({});
    enablePlugin(plugin);
    expect(noteContext(plugin, "/ws/a.md")).toEqual({
      note: expect.objectContaining({
        path: "a.md",
        title: "a",
        tags: ["idea"],
      }),
    });
  });

  it("gives nothing for a note the app doesn't know", () => {
    const plugin = pluginWith(["notes:read"]);
    store.setState({ installedPlugins: [plugin], pluginStates: {} });
    enablePlugin(plugin);
    expect(noteContext(plugin, "/ws/gone.md")).toEqual({});
    expect(noteContext(plugin, undefined)).toEqual({});
  });
});

describe("bookContext", () => {
  it("gives the book open, its chapter and the place selected", () => {
    const plugin = pluginWith(["books:read"]);
    store.setState({ installedPlugins: [plugin], pluginStates: {} });
    enablePlugin(plugin);
    openBook();
    expect(bookContext(plugin, "epubcfi(/6/8!/4/2,/1:0,/1:5)")).toEqual({
      book: {
        path: "reading/Dune.epub",
        title: "Dune",
        author: "Frank Herbert",
        chapter: "Book One",
        cfi: "epubcfi(/6/8!/4/2,/1:0,/1:5)",
      },
    });
    // the page shown, without a selection
    expect(bookContext(plugin).book?.cfi).toBe("epubcfi(/6/8!/4/2)");
  });

  it("gives nothing without books:read, or no book open", () => {
    const plugin = pluginWith(["books:read"]);
    store.setState({ installedPlugins: [plugin], pluginStates: {} });
    enablePlugin(plugin);
    expect(bookContext(plugin)).toEqual({});
    openBook();
    enablePlugin(plugin, []);
    expect(bookContext(plugin)).toEqual({});
  });

  it("names a book out of the workspace by its file, not where it is", () => {
    const plugin = pluginWith(["books:read"]);
    store.setState({ installedPlugins: [plugin], pluginStates: {} });
    enablePlugin(plugin);
    openBook({
      path: "/home/me/Downloads/Some Book.epub",
      entry: undefined,
      location: undefined,
    });
    expect(bookContext(plugin)).toEqual({
      book: { path: "Some Book.epub", title: "Some Book", author: "" },
    });
  });
});

describe("viewContext", () => {
  it("gives the note or the book of the view shown; all to a trusted plugin", () => {
    const plugin = pluginWith([], "trusted");
    openBook();
    expect(
      viewContext(plugin, { view: "md", params: { noteId: "/ws/a.md" } }).note
        ?.path,
    ).toBe("a.md");
    expect(viewContext(plugin, { view: "book" }).book?.title).toBe("Dune");
    expect(viewContext(plugin, { view: "graph" })).toEqual({});
    expect(viewContext(plugin, undefined)).toEqual({});
  });
});
