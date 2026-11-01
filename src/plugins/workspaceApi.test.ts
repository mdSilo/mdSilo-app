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
  openInApp,
  readNote,
  workspaceMethods,
  writeNote,
} from "./workspaceApi";

beforeEach(() => {
  store.getState().setInitDir("/ws");
  store
    .getState()
    .upsertNotes([
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
