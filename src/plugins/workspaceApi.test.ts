import { invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import { makeFileMeta, makeNote, mockInvoke } from "@/testUtils";
import { useBooks } from "@/reader/library/books";
import { useIssueStore } from "@/issue/issueStore";
import { defaultIssueData } from "@/issue/issueOps";
import type { BookEntry } from "@/reader/library/library";
import {
  backlinks,
  listBooks,
  listIssues,
  listNotes,
  noteGraph,
  openInApp,
  readNote,
  searchNotes,
  workspaceMethods,
  writeNote,
} from "./workspaceApi";

beforeEach(() => {
  store.getState().setInitDir("/ws");
  store.getState().upsertNotes([
    makeNote({
      id: "/ws/writing/a.md",
      title: "a",
      content: "see [[b]] #fruit# ",
    }),
    makeNote({ id: "/ws/writing/sub/b.md", title: "b", content: "b text" }),
    makeNote({ id: "/ws/writing/sub", title: "sub", is_dir: true }),
  ]);
});

describe("notes", () => {
  it("lists the notes with paths in the workspace, their tags and links", () => {
    expect(listNotes(undefined)).toEqual([
      {
        path: "writing/a.md",
        title: "a",
        created: "2022-01-01T00:00:00.000Z",
        updated: "2022-01-01T00:00:00.000Z",
        tags: ["fruit"],
        links: ["b"],
      },
      expect.objectContaining({
        path: "writing/sub/b.md",
        title: "b",
        tags: [],
        links: [],
      }),
    ]);
  });

  it("leaves out the other files of the tree: no PDF read as text", async () => {
    store
      .getState()
      .upsertNotes([
        makeNote({ id: "/ws/reading/book.pdf", title: "book" }),
        makeNote({ id: "/ws/writing/img/cat.png", title: "cat" }),
      ]);
    expect(listNotes(undefined).map((n) => n.path)).toEqual([
      "writing/a.md",
      "writing/sub/b.md",
    ]);
    await expect(readNote({ path: "reading/book.pdf" })).rejects.toThrow(
      "No note at reading/book.pdf",
    );
    await expect(
      writeNote({ path: "writing/img/cat.png", text: "x" }),
    ).rejects.toThrow("No note at");
    expect(invoke).not.toHaveBeenCalledWith("read_file", expect.anything());
  });

  it("lists the notes of a folder, or with a tag", () => {
    expect(listNotes({ folder: "writing/sub" }).map((n) => n.path)).toEqual([
      "writing/sub/b.md",
    ]);
    expect(listNotes({ tag: "fruit" }).map((n) => n.path)).toEqual([
      "writing/a.md",
    ]);
    expect(() => listNotes({ folder: "../other" })).toThrow(
      "Not a path in the workspace",
    );
  });

  it("reads a note the app knows, nothing else", async () => {
    expect(await readNote({ path: "writing/a.md" })).toBe("see [[b]] #fruit# ");
    expect(await readNote({ path: "./writing//sub/b.md" })).toBe("b text");
    await expect(readNote({ path: ".mdsilo/sync.json" })).rejects.toThrow(
      "No note at .mdsilo/sync.json",
    );
    await expect(readNote({ path: "writing/sub" })).rejects.toThrow(
      "No note at",
    );
    await expect(readNote({ path: "/etc/passwd" })).rejects.toThrow(
      "Not a path in the workspace",
    );
    await expect(readNote({ path: "writing/../../x.md" })).rejects.toThrow(
      "Not a path in the workspace",
    );
    await expect(readNote({ path: "C:x.md" })).rejects.toThrow(
      "Not a path in the workspace",
    );
    await expect(readNote({})).rejects.toThrow(
      "A path in the workspace is wanted",
    );
  });

  it("writes a note, to the disk and the store", async () => {
    mockInvoke(invoke, { write_file: true });
    expect(await writeNote({ path: "writing/a.md", text: "new" })).toBe(true);
    expect(invoke).toHaveBeenCalledWith("write_file", {
      filePath: "/ws/writing/a.md",
      text: "new",
    });
    expect(store.getState().notes.get("/ws/writing/a.md")?.content).toBe("new");
    await expect(
      writeNote({ path: "writing/new.md", text: "x" }),
    ).rejects.toThrow("No note at");
    await expect(writeNote({ path: "writing/a.md" })).rejects.toThrow(
      "{ path, text }",
    );
  });

  it("makes a new note with create, the folders as needed", async () => {
    mockInvoke(invoke, {
      write_file: true,
      file_exist: ({ filePath }: Record<string, unknown>) =>
        filePath === "/ws/writing/on-disk.md",
      create_dir_recursive: true,
      get_dirpath: ({ path }: Record<string, unknown>) =>
        String(path).replace(/\/[^/]*$/, ""),
    });
    expect(
      await writeNote({ path: "writing/new/c.md", text: "hi", create: true }),
    ).toBe(true);
    expect(invoke).toHaveBeenCalledWith("create_dir_recursive", {
      dirPath: "/ws/writing/new",
    });
    expect(store.getState().notes.get("/ws/writing/new/c.md")).toMatchObject({
      title: "c",
      content: "hi",
    });
    expect(listNotes(undefined).map((n) => n.path)).toContain(
      "writing/new/c.md",
    );
    // a note there: written as it is
    expect(
      await writeNote({ path: "writing/a.md", text: "x", create: true }),
    ).toBe(true);
    await expect(
      writeNote({ path: "writing/on-disk.md", text: "x", create: true }),
    ).rejects.toThrow("not known to the app");
    await expect(
      writeNote({ path: "writing/c.pdf", text: "x", create: true }),
    ).rejects.toThrow("Not a Markdown file");
    await expect(
      writeNote({ path: ".mdsilo/x.md", text: "x", create: true }),
    ).rejects.toThrow("Not in a hidden folder");
    await expect(
      writeNote({ path: "../x.md", text: "x", create: true }),
    ).rejects.toThrow("Not a path in the workspace");
    store
      .getState()
      .upsertNotes([makeNote({ id: "/ws/img.png", title: "img" })]);
    await expect(
      writeNote({ path: "img.png", text: "x", create: true }),
    ).rejects.toThrow("No note at");
  });

  it("searches the text of the notes", async () => {
    mockInvoke(invoke, {
      index_search: [
        {
          id: "1",
          path: "/ws/writing/sub/b.md",
          kind: "note",
          title: "b",
          label: "",
          snippet: "",
        },
      ],
    });
    const hits = await searchNotes({ query: "text" });
    expect(hits).toEqual([
      { path: "writing/sub/b.md", title: "b", snippets: ["b text"] },
    ]);
    expect(await searchNotes({ query: "text", limit: 0 })).toHaveLength(1);
    await expect(searchNotes({})).rejects.toThrow("{ query }");
  });

  it("gives the graph of the notes", () => {
    store.getState().upsertNotes([
      makeNote({
        id: "/ws/c.md",
        title: "c",
        content: "[[a]] [[a]] [[nowhere]] [[c]]",
      }),
    ]);
    expect(noteGraph()).toEqual({
      nodes: [
        { path: "writing/a.md", title: "a", tags: ["fruit"] },
        { path: "writing/sub/b.md", title: "b", tags: [] },
        { path: "c.md", title: "c", tags: [] },
      ],
      links: [
        { from: "writing/a.md", to: "writing/sub/b.md" },
        { from: "c.md", to: "writing/a.md" },
      ],
      unresolved: [{ from: "c.md", title: "nowhere" }],
    });
  });

  it("says when the note can not be written", async () => {
    mockInvoke(invoke, { write_file: false });
    await expect(
      writeNote({ path: "writing/a.md", text: "new" }),
    ).rejects.toThrow("Could not write writing/a.md");
    expect(store.getState().notes.get("/ws/writing/a.md")?.content).toBe(
      "see [[b]] #fruit# ",
    );
  });

  it("wants a workspace", () => {
    store.getState().setInitDir("");
    expect(() => listNotes(undefined)).toThrow("No workspace is open");
  });

  it("asks the permissions of notes", () => {
    const methods = workspaceMethods(vi.fn());
    expect(methods["notes.list"].permission).toBe("notes:read");
    expect(methods["notes.read"].permission).toBe("notes:read");
    expect(methods["notes.write"].permission).toBe("notes:write");
    expect(methods["notes.backlinks"].permission).toBe("notes:read");
    expect(methods["notes.search"].permission).toBe("notes:read");
    expect(methods["notes.graph"].permission).toBe("notes:read");
    expect(methods["books.list"].permission).toBe("books:read");
    expect(methods["issues.list"].permission).toBe("issues:read");
    expect(methods["app.open"].permission).toBeUndefined();
  });
});

describe("openInApp", () => {
  it("opens a note, a book, an issue", async () => {
    mockInvoke(invoke, {
      file_exist: true,
      get_file_meta: makeFileMeta({
        file_path: "/ws/writing/a.md",
        file_name: "a.md",
      }),
      get_parent_dir: ({ path }: Record<string, unknown>) =>
        (path as string).replace(/\/[^/]*$/, "") || "/",
      get_basename: ({ filePath }: Record<string, unknown>) => [
        (filePath as string).split("/").pop(),
        true,
      ],
    });
    const dispatch = vi.fn();
    await openInApp({ note: "writing/a.md" }, dispatch);
    expect(dispatch).toHaveBeenLastCalledWith({
      view: "md",
      params: { noteId: "/ws/writing/a.md" },
    });
    await openInApp({ book: "reading/x.epub" }, dispatch);
    expect(dispatch).toHaveBeenLastCalledWith({
      view: "book",
      path: "/ws/reading/x.epub",
    });
    await openInApp({ issue: 12 }, dispatch);
    expect(dispatch).toHaveBeenLastCalledWith({ view: "issue", number: 12 });
  });

  it("opens nothing else", async () => {
    const dispatch = vi.fn();
    await expect(
      openInApp({ book: "reading/x.exe" }, dispatch),
    ).rejects.toThrow("Not a book");
    await expect(
      openInApp({ note: "writing/none.md" }, dispatch),
    ).rejects.toThrow("No note at");
    await expect(openInApp({ issue: -1 }, dispatch)).rejects.toThrow(
      "app.open wants",
    );
    await expect(openInApp({ url: "https://x" }, dispatch)).rejects.toThrow(
      "app.open wants",
    );
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("backlinks, books, issues", () => {
  it("gives the notes linking to a note", () => {
    expect(backlinks({ path: "writing/sub/b.md" })).toEqual(["writing/a.md"]);
    expect(backlinks({ path: "writing/a.md" })).toEqual([]);
    expect(() => backlinks({ path: "none.md" })).toThrow("No note at");
  });

  it("lists the books of the library", async () => {
    const book: BookEntry = {
      hash: "h1",
      file: "reading/Dune.epub",
      title: "Dune",
      author: "Frank Herbert",
      format: "EPUB",
      addedAt: "2026-01-01",
      group: "Fiction",
      status: "Doing",
      fileHash: "x",
      cover: "custom",
    };
    useBooks.setState({ ws: "/ws", books: { h1: book } });
    expect(await listBooks()).toEqual([
      {
        path: "reading/Dune.epub",
        title: "Dune",
        author: "Frank Herbert",
        format: "EPUB",
        added: "2026-01-01",
        group: "Fiction",
        status: "Doing",
        language: undefined,
        subjects: undefined,
      },
    ]);
  });

  it("lists the issues, with the names of labels and milestones", async () => {
    const data = {
      ...defaultIssueData(),
      labels: [{ id: "l1", name: "bug", color: "red" }],
      milestones: [{ id: "m1", title: "v1", state: "open" as const }],
      issues: [
        {
          number: 3,
          title: "Fix",
          body: "see [[a]]",
          state: "open" as const,
          labels: ["l1"],
          milestone: "m1",
          notes: ["/ws/writing/a.md"],
          timeline: [],
          createdAt: "2026-01-01",
          updatedAt: "2026-01-02",
          dueOn: "2026-02-01",
        },
      ],
    };
    useIssueStore.setState({ data, dir: "/ws", isLoaded: true });
    expect(await listIssues()).toEqual([
      {
        number: 3,
        title: "Fix",
        body: "see [[a]]",
        state: "open",
        labels: ["bug"],
        milestone: "v1",
        due: "2026-02-01",
        created: "2026-01-01",
        updated: "2026-01-02",
        closed: undefined,
        notes: ["writing/a.md"],
      },
    ]);
  });
});
