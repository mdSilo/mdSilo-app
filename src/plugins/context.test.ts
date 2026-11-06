import { store } from "@/state/store";
import { makeNote } from "@/testUtils";
import { activeStore, resetReaderStore } from "@/reader/readerStore";
import type { BookEntry } from "@/reader/library/library";
import { syncInfo } from "@/sync/api";
import { parseManifest, type Permission } from "./manifest";
import { enablePlugin, type InstalledPlugin } from "./registry";
import {
  bookContext,
  forgetRemotes,
  noteContext,
  viewContext,
} from "./context";

vi.mock("@/sync/api", () => ({ isSyncAvailable: true, syncInfo: vi.fn() }));

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
  forgetRemotes();
  vi.mocked(syncInfo).mockReset();
  store.getState().setInitDir("/ws");
  store
    .getState()
    .upsertNotes([
      makeNote({ id: "/ws/a.md", title: "a", content: "x #idea# " }),
    ]);
});

describe("noteContext", () => {
  it("gives the note to a plugin that may read notes only", async () => {
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

  it("gives nothing for a note the app doesn't know", async () => {
    const plugin = pluginWith(["notes:read"]);
    store.setState({ installedPlugins: [plugin], pluginStates: {} });
    enablePlugin(plugin);
    expect(noteContext(plugin, "/ws/gone.md")).toEqual({});
    expect(noteContext(plugin, undefined)).toEqual({});
  });
});

describe("bookContext", () => {
  it("gives the book open, its chapter and the place selected", async () => {
    const plugin = pluginWith(["books:read"]);
    store.setState({ installedPlugins: [plugin], pluginStates: {} });
    enablePlugin(plugin);
    openBook();
    expect(await bookContext(plugin, "epubcfi(/6/8!/4/2,/1:0,/1:5)")).toEqual({
      book: {
        path: "reading/Dune.epub",
        title: "Dune",
        author: "Frank Herbert",
        chapter: "Book One",
        cfi: "epubcfi(/6/8!/4/2,/1:0,/1:5)",
      },
    });
    // the page shown, without a selection
    expect((await bookContext(plugin)).book?.cfi).toBe("epubcfi(/6/8!/4/2)");
  });

  it("gives nothing without books:read, or no book open", async () => {
    const plugin = pluginWith(["books:read"]);
    store.setState({ installedPlugins: [plugin], pluginStates: {} });
    enablePlugin(plugin);
    expect(await bookContext(plugin)).toEqual({});
    openBook();
    enablePlugin(plugin, []);
    expect(await bookContext(plugin)).toEqual({});
  });

  it("names a book out of the workspace by its file, not where it is", async () => {
    const plugin = pluginWith(["books:read"]);
    store.setState({ installedPlugins: [plugin], pluginStates: {} });
    enablePlugin(plugin);
    openBook({
      path: "/home/me/Downloads/Some Book.epub",
      entry: undefined,
      location: undefined,
    });
    expect(await bookContext(plugin)).toEqual({
      book: { path: "Some Book.epub", title: "Some Book", author: "" },
    });
  });
});

describe("the book on the web", () => {
  it("gives the file in the repo and a link to read it at the place", async () => {
    const plugin = pluginWith(["books:read"]);
    store.setState({ installedPlugins: [plugin], pluginStates: {} });
    enablePlugin(plugin);
    vi.mocked(syncInfo).mockResolvedValue({
      isRepo: true,
      remoteUrl: "https://github.com/me/notes.git",
      branch: "main",
      hasToken: true,
      changes: 0,
    });
    openBook({ entry: { ...entry, synced: true } });
    const { book } = await bookContext(plugin, "epubcfi(/6/8!/4/2,/1:0,/1:5)");
    const url =
      "https://raw.githubusercontent.com/me/notes/main/reading/Dune.epub";
    expect(book?.url).toBe(url);
    const read = new URL(book!.readUrl!);
    expect(read.origin + read.pathname).toBe(
      "https://mdsilo.github.io/mdSilo-app/",
    );
    expect(read.searchParams.get("read")).toBe(url);
    expect(read.searchParams.get("cfi")).toBe("epubcfi(/6/8!/4/2,/1:0,/1:5)");
    // asked once a while
    await bookContext(plugin);
    expect(syncInfo).toHaveBeenCalledTimes(1);
  });

  it("gives none for a book not synced, or no remote", async () => {
    const plugin = pluginWith(["books:read"]);
    store.setState({ installedPlugins: [plugin], pluginStates: {} });
    enablePlugin(plugin);
    vi.mocked(syncInfo).mockResolvedValue({
      isRepo: false,
      hasToken: false,
      changes: 0,
    });
    openBook();
    expect((await bookContext(plugin)).book?.url).toBeUndefined();
    expect(syncInfo).not.toHaveBeenCalled();
    openBook({ entry: { ...entry, synced: true } });
    expect((await bookContext(plugin)).book).not.toHaveProperty("url");
  });
});

describe("viewContext", () => {
  it("gives the note or the book of the view shown; all to a trusted plugin", async () => {
    const plugin = pluginWith([], "trusted");
    openBook();
    expect(
      (
        await viewContext(plugin, {
          view: "md",
          params: { noteId: "/ws/a.md" },
        })
      ).note?.path,
    ).toBe("a.md");
    expect((await viewContext(plugin, { view: "book" })).book?.title).toBe(
      "Dune",
    );
    expect(await viewContext(plugin, { view: "graph" })).toEqual({});
    expect(await viewContext(plugin, undefined)).toEqual({});
  });
});
