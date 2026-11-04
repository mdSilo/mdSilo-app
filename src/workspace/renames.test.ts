import type { Mock } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { NoteMap } from "@/lib/noteMap";
import { store } from "@/state/store";
import { makeNote, useWebFs } from "@/testUtils";
import * as ops from "@/issue/issueOps";
import { issueStore, resetIssueStore } from "@/issue/issueStore";
import { readLibrary, refreshLibrary } from "@/reader/library/library";
import { useReaderStore } from "@/reader/readerStore";
import {
  followMovedMeanwhile,
  followRename,
  onRenamed,
  titleOfPath,
} from "./renames";

const WS = "/mdSilo";
const write = (filePath: string, text: string) =>
  invoke("write_file", { filePath, text });
const read = (filePath: string) => invoke<string>("read_file", { filePath });
const exists = (filePath: string) =>
  invoke<boolean>("file_exist", { filePath });
/** the content of a note as the app has it (written to disk in the app) */
const noteOf = (path: string) => store.getState().notes.get(path)?.content;
const rename = (fromPath: string, toPath: string) =>
  invoke<boolean>("rename_file", { fromPath, toPath });

let webInvoke: Awaited<ReturnType<typeof useWebFs>>;

beforeEach(async () => {
  webInvoke = await useWebFs();
  store.setState({
    initDir: WS,
    layout: "workspace",
    isLoaded: true,
    lastBooks: {},
  });
});

afterEach(() => {
  resetIssueStore();
  useReaderStore.setState({ path: undefined });
});

/** Notes on disk and in the store, as loaded. */
async function seedNotes(notes: Record<string, string>) {
  const made = [];
  for (const [path, content] of Object.entries(notes)) {
    await write(path, content);
    made.push(
      makeNote({
        id: path,
        file_path: path,
        title: titleOfPath(path),
        content,
      }),
    );
  }
  store.getState().setNotes(NoteMap.from(made));
}

async function seedIssue(notePath: string, body: string) {
  await issueStore.getState().load(WS);
  issueStore.getState().createIssue({ title: "one", body });
  issueStore.getState().apply((d) => ops.linkNote(d, 1, notePath));
}

const issue = () => issueStore.getState().data.issues[0];

describe("a note renamed outside the app", () => {
  test("the links and issues follow it", async () => {
    await seedNotes({
      [`${WS}/writing/Old.md`]: "the note",
      [`${WS}/writing/linker.md`]: "see [[Old]] and [it](Old)",
    });
    await seedIssue(`${WS}/writing/Old.md`, "about [[Old]]");
    const seen = vi.fn();
    const stop = onRenamed(seen);

    // as the watcher sees it: the store follows the files, then the rename
    await rename(`${WS}/writing/Old.md`, `${WS}/writing/New.md`);
    store.getState().deleteNote(`${WS}/writing/Old.md`);
    await followRename(`${WS}/writing/Old.md`, `${WS}/writing/New.md`);
    stop();

    expect(noteOf(`${WS}/writing/linker.md`)).toBe("see [[New]] and [it](New)");
    expect(issue().notes).toEqual([`${WS}/writing/New.md`]);
    expect(issue().body).toBe("about [[New]]");
    expect(seen).toHaveBeenCalledWith({
      from: `${WS}/writing/Old.md`,
      to: `${WS}/writing/New.md`,
    });
  });

  test("moved, its title the same: only the issues follow", async () => {
    await seedNotes({
      [`${WS}/writing/a.md`]: "a",
      [`${WS}/writing/linker.md`]: "see [[a]]",
    });
    await seedIssue(`${WS}/writing/a.md`, "about [[a]]");
    await rename(`${WS}/writing/a.md`, `${WS}/writing/sub/a.md`);
    await followRename(`${WS}/writing/a.md`, `${WS}/writing/sub/a.md`);
    expect(noteOf(`${WS}/writing/linker.md`)).toBe("see [[a]]");
    expect(issue().notes).toEqual([`${WS}/writing/sub/a.md`]);
  });

  test("another note has the old title: the links stay with it", async () => {
    await seedNotes({
      [`${WS}/writing/a.md`]: "a",
      [`${WS}/writing/sub/a.md`]: "another a",
      [`${WS}/writing/linker.md`]: "see [[a]]",
    });
    await rename(`${WS}/writing/a.md`, `${WS}/writing/b.md`);
    await followRename(`${WS}/writing/a.md`, `${WS}/writing/b.md`);
    expect(noteOf(`${WS}/writing/linker.md`)).toBe("see [[a]]");
  });

  test("not a note any more (e.g. a backup of an editor): nothing", async () => {
    await seedNotes({
      [`${WS}/writing/a.md`]: "a",
      [`${WS}/writing/linker.md`]: "see [[a]]",
    });
    await rename(`${WS}/writing/a.md`, `${WS}/writing/a.md~`);
    await followRename(`${WS}/writing/a.md`, `${WS}/writing/a.md~`);
    expect(noteOf(`${WS}/writing/linker.md`)).toBe("see [[a]]");
  });
});

describe("a book renamed outside the app", () => {
  const from = `${WS}/reading/Old.epub`;
  const to = `${WS}/reading/New.epub`;

  async function seedBook() {
    await write(from, "epub bytes");
    await write(`${from}.md`, "the highlights");
    const lib = await refreshLibrary(WS);
    return Object.keys(lib.books)[0];
  }

  test("its notes, entry, the book open and the last book follow it", async () => {
    const hash = await seedBook();
    useReaderStore.setState({ path: from });
    store.getState().setLastBook(WS, from);

    await rename(from, to);
    await followRename(from, to);

    expect(await exists(`${from}.md`)).toBe(false);
    expect(await read(`${to}.md`)).toBe("the highlights");
    const lib = await readLibrary(WS);
    expect(lib.books[hash].file).toBe("reading/New.epub");
    expect(useReaderStore.getState().path).toBe(to);
    expect(store.getState().lastBooks[WS]).toBe(to);

    // seen again (renamed in the app, then by the watcher): nothing more
    await followRename(from, to);
    expect(await read(`${to}.md`)).toBe("the highlights");
    expect((await readLibrary(WS)).books[hash].file).toBe("reading/New.epub");
  });

  test("notes at the new name already are kept", async () => {
    await seedBook();
    await write(`${to}.md`, "other notes");
    await rename(from, to);
    await followRename(from, to);
    expect(await read(`${from}.md`)).toBe("the highlights");
    expect(await read(`${to}.md`)).toBe("other notes");
  });

  test("the library refreshed moves its notes too", async () => {
    await seedBook();
    await rename(from, to);
    await refreshLibrary(WS);
    expect(await read(`${to}.md`)).toBe("the highlights");
    expect(await exists(`${from}.md`)).toBe(false);
  });
});

test("a dir renamed: the issues and books in it follow it", async () => {
  await seedNotes({ [`${WS}/writing/d/a.md`]: "a" });
  await seedIssue(`${WS}/writing/d/a.md`, "");
  await write(`${WS}/reading/d/B.pdf`, "pdf bytes");
  const lib = await refreshLibrary(WS);
  const hash = Object.keys(lib.books)[0];
  useReaderStore.setState({ path: `${WS}/reading/d/B.pdf` });

  await rename(`${WS}/writing/d`, `${WS}/writing/e`);
  await followRename(`${WS}/writing/d`, `${WS}/writing/e`);
  await rename(`${WS}/reading/d`, `${WS}/reading/e`);
  await followRename(`${WS}/reading/d`, `${WS}/reading/e`);

  expect(issue().notes).toEqual([`${WS}/writing/e/a.md`]);
  expect((await readLibrary(WS)).books[hash].file).toBe("reading/e/B.pdf");
  expect(useReaderStore.getState().path).toBe(`${WS}/reading/e/B.pdf`);
});

test("renamed while the app was closed: followed on load", async () => {
  // a book, then renamed with its notes left behind
  await write(`${WS}/reading/Old.epub`, "epub bytes");
  await write(`${WS}/reading/Old.epub.md`, "the highlights");
  await refreshLibrary(WS);
  store.getState().setLastBook(WS, `${WS}/reading/Old.epub`);
  await rename(`${WS}/reading/Old.epub`, `${WS}/reading/New.epub`);
  // a note, as the index found it
  await seedNotes({
    [`${WS}/writing/New.md`]: "the note",
    [`${WS}/writing/linker.md`]: "see [[Old]]",
  });
  (invoke as Mock).mockImplementation(
    (cmd: string, args?: Record<string, unknown>) =>
      cmd === "index_renames"
        ? Promise.resolve([[`${WS}/writing/Old.md`, `${WS}/writing/New.md`]])
        : webInvoke(cmd, args),
  );

  await followMovedMeanwhile(WS);

  expect(noteOf(`${WS}/writing/linker.md`)).toBe("see [[New]]");
  expect(await read(`${WS}/reading/New.epub.md`)).toBe("the highlights");
  expect(store.getState().lastBooks[WS]).toBe(`${WS}/reading/New.epub`);
});

test("titleOfPath: the name without its extension", () => {
  expect(titleOfPath("/w/a.b.md")).toBe("a.b");
  expect(titleOfPath("/w/Foo.epub.md")).toBe("Foo.epub");
  expect(titleOfPath("/w/plain")).toBe("plain");
});
