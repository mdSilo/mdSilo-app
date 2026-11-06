import { invoke } from "@tauri-apps/api/core";
import { NoteMap } from "@/lib/noteMap";
import { store } from "@/state/store";
import { makeNote, useWebFs } from "@/testUtils";
import { readLibrary, refreshLibrary } from "@/reader/library/library";
import { bookRenameOptions, moveBook } from "@/reader/library/bookFile";
import { useReaderStore } from "@/reader/readerStore";
import { issueStore, resetIssueStore } from "@/issue/issueStore";
import * as ops from "@/issue/issueOps";
import { moveNote } from "@/writer/NoteMoveInput";
import { hasPendingSave, scheduleSave } from "./pendingSaves";
import { titleOfPath } from "./renames";
import {
  dirRenameOptions,
  invalidName,
  noteRenameOptions,
  renamePath,
  splitName,
} from "./renamePath";

const WS = "/mdSilo";
const write = (filePath: string, text: string) =>
  invoke("write_file", { filePath, text });
const read = (filePath: string) => invoke<string>("read_file", { filePath });
const exists = (filePath: string) =>
  invoke<boolean>("file_exist", { filePath });
const noteOf = (path: string) => store.getState().notes.get(path)?.content;

beforeEach(async () => {
  await useWebFs();
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

test.each([
  ["", "Enter a name"],
  ["a/b", 'A name can not contain \\ / : * ? " < > |'],
  ["a:b", 'A name can not contain \\ / : * ? " < > |'],
  ["..", "A name can not start with ."],
  [".hidden", "A name can not start with ."],
])("invalidName(%j)", (name, msg) => {
  expect(invalidName(name)).toBe(msg);
});

test("splitName: the extension kept for files only", () => {
  expect(splitName("/n/a.b.md", true)).toEqual({ name: "a.b", ext: ".md" });
  expect(splitName("/n/v1.0", false)).toEqual({ name: "v1.0", ext: "" });
  expect(splitName("/n/.md", true)).toEqual({ name: ".md", ext: "" });
});

describe("a note", () => {
  const from = `${WS}/writing/Old.md`;

  test("renamed with its extension and its links, saved first", async () => {
    await seedNotes({
      [from]: "the note",
      [`${WS}/writing/linker.md`]: "see [[Old]]",
    });
    scheduleSave(from, "the note, changed");

    const err = await renamePath(from, " New ", {
      ...noteRenameOptions(from),
      ext: ".md",
    });

    expect(err).toBeUndefined();
    expect(await exists(from)).toBe(false);
    // saved before (no disk in the tests: the save is written nowhere)
    expect(hasPendingSave(from)).toBe(false);
    expect(await read(`${WS}/writing/New.md`)).toBe("the note");
    expect(noteOf(`${WS}/writing/linker.md`)).toBe("see [[New]]");
  });

  test("never to the title of another note", async () => {
    await seedNotes({ [from]: "the note", [`${WS}/reading/New.md`]: "other" });
    const err = await renamePath(from, "New", {
      ...noteRenameOptions(from),
      ext: ".md",
    });
    expect(err).toBe("A note titled New already exists");
    expect(await exists(from)).toBe(true);
  });

  test("never over an existing file", async () => {
    await seedNotes({ [from]: "the note" });
    await write(`${WS}/writing/New.md`, "a file not loaded");
    const err = await renamePath(from, "New", {
      ...noteRenameOptions(from),
      ext: ".md",
    });
    expect(err).toBe("New.md already exists");
    expect(await read(`${WS}/writing/New.md`)).toBe("a file not loaded");
  });

  test("the same name: nothing to do", async () => {
    await seedNotes({ [from]: "the note" });
    expect(await renamePath(from, "Old", { ext: ".md" })).toBeUndefined();
    expect(await read(from)).toBe("the note");
  });
});

test("a dir renamed, its notes saved first", async () => {
  const note = `${WS}/writing/old/a.md`;
  await seedNotes({ [note]: "a" });
  scheduleSave(note, "a, changed");
  expect(
    await renamePath(`${WS}/writing/old`, "new", dirRenameOptions),
  ).toBeUndefined();
  expect(hasPendingSave(note)).toBe(false);
  expect(await read(`${WS}/writing/new/a.md`)).toBe("a");
  expect(await exists(`${WS}/writing/old`)).toBe(false);
});

describe("a book", () => {
  const from = `${WS}/reading/Old.epub`;
  const to = `${WS}/reading/New.epub`;

  test("renamed with its notes and its library entry", async () => {
    await write(from, "epub bytes");
    await write(`${from}.md`, "the highlights");
    const hash = Object.keys((await refreshLibrary(WS)).books)[0];
    useReaderStore.setState({ path: from });

    const err = await renamePath(from, "New", {
      ...bookRenameOptions(from),
      ext: ".epub",
    });

    expect(err).toBeUndefined();
    expect(await read(`${to}.md`)).toBe("the highlights");
    expect((await readLibrary(WS)).books[hash].file).toBe("reading/New.epub");
    expect(useReaderStore.getState().path).toBe(to);
  });

  test("never over the notes of another book", async () => {
    await write(from, "epub bytes");
    await write(`${to}.md`, "other notes");
    const err = await renamePath(from, "New", {
      ...bookRenameOptions(from),
      ext: ".epub",
    });
    expect(err).toBe("New.epub.md already exists");
    expect(await exists(from)).toBe(true);
  });
});

test("before is done right before the rename, never if refused", async () => {
  await write(`${WS}/a.md`, "a");
  await write(`${WS}/b.md`, "b");
  const before = vi.fn(async () => {
    expect(await exists(`${WS}/a.md`)).toBe(true);
  });
  expect(await renamePath(`${WS}/a.md`, "b", { ext: ".md", before })).toBe(
    "b.md already exists",
  );
  expect(before).not.toHaveBeenCalled();
  expect(await renamePath(`${WS}/a.md`, "c", { ext: ".md", before })).toBe(
    undefined,
  );
  expect(before).toHaveBeenCalledOnce();
  expect(await read(`${WS}/c.md`)).toBe("a");
});

describe("a book moved", () => {
  const from = `${WS}/reading/Old.epub`;
  const to = `${WS}/reading/sub/Old.epub`;

  test("its notes and library entry with it", async () => {
    await write(from, "epub bytes");
    await write(`${from}.md`, "the highlights");
    await invoke("create_dir_recursive", { dirPath: `${WS}/reading/sub` });
    const hash = Object.keys((await refreshLibrary(WS)).books)[0];
    useReaderStore.setState({ path: from });

    expect(await moveBook(from, `${WS}/reading/sub`)).toBe(to);

    expect(await exists(from)).toBe(false);
    expect(await exists(`${from}.md`)).toBe(false);
    expect(await read(`${to}.md`)).toBe("the highlights");
    expect((await readLibrary(WS)).books[hash].file).toBe(
      "reading/sub/Old.epub",
    );
    expect(useReaderStore.getState().path).toBe(to);
  });

  test("never over the notes there, nor where it is", async () => {
    await write(from, "epub bytes");
    await write(`${to}.md`, "other notes");
    expect(await moveBook(from, `${WS}/reading/sub`)).toBeUndefined();
    expect(await moveBook(from, `${WS}/reading`)).toBeUndefined();
    expect(await exists(from)).toBe(true);
    expect(await read(`${to}.md`)).toBe("other notes");
  });
});

describe("a note moved", () => {
  const from = `${WS}/writing/a.md`;
  const to = `${WS}/writing/sub/a.md`;

  test("its issues follow it, the links by title stay", async () => {
    await seedNotes({ [from]: "a", [`${WS}/writing/linker.md`]: "see [[a]]" });
    await invoke("create_dir_recursive", { dirPath: `${WS}/writing/sub` });
    await issueStore.getState().load(WS);
    issueStore.getState().createIssue({ title: "one", body: "about [[a]]" });
    issueStore.getState().apply((d) => ops.linkNote(d, 1, from));

    expect(await moveNote(from, `${WS}/writing/sub`)).toBe(to);

    expect(await exists(from)).toBe(false);
    expect(await read(to)).toBe("a");
    expect(store.getState().notes.get(to)?.content).toBe("a");
    expect(issueStore.getState().data.issues[0].notes).toEqual([to]);
    expect(noteOf(`${WS}/writing/linker.md`)).toBe("see [[a]]");
  });

  test("never over an existing file", async () => {
    await seedNotes({ [from]: "a" });
    await write(to, "other");
    expect(await moveNote(from, `${WS}/writing/sub`)).toBeUndefined();
    expect(await read(from)).toBe("a");
    expect(await read(to)).toBe("other");
  });
});
